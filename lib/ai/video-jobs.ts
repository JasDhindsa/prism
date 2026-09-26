import { randomUUID } from "node:crypto"
import { execFile } from "node:child_process"
import { access, copyFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises"
import path from "node:path"
import { promisify } from "node:util"
import type { VideoJob, VideoPlan } from "../reader-types"
import { AiError } from "./http"
import { speechConfigured, synthesizeSpeech } from "./elevenlabs"
import { speechLanguageCode } from "../languages"

const execute = promisify(execFile)
const root = () => path.resolve(process.env.DATA_DIR || ".data", "ai", "videos")
export function videoDirectory(id: string) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)) throw new AiError("Video not found.", 404)
  return path.join(root(), id)
}
const python = () => process.env.MANIM_PYTHON || path.resolve(".venv-manim", process.platform === "win32" ? "Scripts/python.exe" : "bin/python")
function rendererEnv(directory?: string): NodeJS.ProcessEnv {
  // Generated code receives no provider credentials or inherited application secrets.
  return { NODE_ENV: process.env.NODE_ENV, PATH: `${path.dirname(python())}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH || ""}`, HOME: process.env.HOME, SYSTEMROOT: process.env.SYSTEMROOT, LANG: "en_US.UTF-8", PYTHONIOENCODING: "utf-8", PYTHONNOUSERSITE: "1", ...(directory ? { XDG_CACHE_HOME: path.join(directory, ".cache") } : {}) }
}
export async function ensureRenderer() {
  try { await execute(python(), ["-c", "import manim"], { timeout: 20_000, env: rendererEnv() }) }
  catch { throw new AiError("The Manim renderer is not installed. Follow the video setup in README.md and restart Prism.", 503) }
}
async function writeJob(job: VideoJob) {
  const directory = videoDirectory(job.id)
  const temporary = path.join(directory, `${randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify(job), { mode: 0o600 })
  await rename(temporary, path.join(directory, "job.json"))
}
export async function readVideoJob(id: string): Promise<VideoJob> {
  try {
    const job = JSON.parse(await readFile(path.join(videoDirectory(id), "job.json"), "utf8")) as VideoJob
    if (!["ready", "failed"].includes(job.status) && Date.now() - job.createdAt > 30 * 60_000) {
      job.status = "failed"; job.error = "Rendering was interrupted or timed out. Retry this video."; job.stage = "Rendering stopped"
      await writeJob(job)
    }
    return job
  } catch (error) {
    if (error instanceof AiError) throw error
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new AiError("Video not found. It may have been removed from this server.", 404)
    throw error
  }
}
async function source(plan: VideoPlan, timings: { duration: number; audio?: string }[]) {
  const template = await readFile(path.resolve("scripts", "manim_scene.py"), "utf8")
  return template.replace("__PRISM_STORYBOARD__", JSON.stringify(JSON.stringify(plan))).replace("__PRISM_TIMINGS__", JSON.stringify(JSON.stringify(timings)))
}
export async function ensureVideoCapacity() {
  await mkdir(root(), { recursive: true })
  const existing = await readdir(root())
  const jobs = await Promise.all(existing.filter((id) => /^[a-f0-9-]{36}$/.test(id)).map((id) => readVideoJob(id).catch(() => null)))
  if (jobs.filter((job) => job && !["ready", "failed"].includes(job.status)).length >= 2) throw new AiError("Two videos are already rendering. Wait for one to finish.", 429)
}
export async function createVideoJob(plan: VideoPlan): Promise<VideoJob> {
  await ensureVideoCapacity()
  const id = randomUUID()
  const directory = videoDirectory(id)
  await mkdir(directory, { recursive: true })
  const job: VideoJob = { id, title: plan.title, summary: plan.summary, status: "queued", stage: "Preparing animation", progress: 5, createdAt: Date.now(), narration: speechConfigured(), language: speechLanguageCode(plan.language) || "en", chapters: plan.scenes.map((scene) => ({ heading: scene.heading, narration: scene.narration, start: 0, duration: 0 })), sourceUrl: `/api/videos/${id}/source` }
  await writeFile(path.join(directory, "plan.json"), JSON.stringify(plan), { mode: 0o600 })
  await writeFile(path.join(directory, "scene.py"), await source(plan, plan.scenes.map(() => ({ duration: 10 }))))
  await writeJob(job)
  return job
}
export async function retryVideoJob(id: string): Promise<VideoJob> {
  const previous = await readVideoJob(id)
  if (previous.status !== "failed") throw new AiError("This video is still rendering or already complete.", 409)
  await ensureVideoCapacity()
  const job: VideoJob = { ...previous, status: "queued", stage: "Preparing animation", progress: 5, createdAt: Date.now(), narration: speechConfigured(), error: undefined, warning: undefined }
  await writeJob(job)
  return job
}
async function findMovie(directory: string): Promise<string | undefined> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isFile() && entry.name === "lesson.mp4") return file
    if (entry.isDirectory() && entry.name !== "partial_movie_files") { const found = await findMovie(file); if (found) return found }
  }
}
function captionTime(seconds: number) {
  const ms = Math.round(seconds * 1000)
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`
}
export async function renderVideoJob(id: string) {
  let job = await readVideoJob(id)
  if (job.status !== "queued") return
  const directory = videoDirectory(id)
  try {
    const plan = JSON.parse(await readFile(path.join(directory, "plan.json"), "utf8")) as VideoPlan
    const timings: { duration: number; audio?: string }[] = []
    for (const [index, scene] of plan.scenes.entries()) {
      job = { ...job, status: "narrating", stage: `Recording narration ${index + 1} of ${plan.scenes.length}`, progress: 10 + Math.round(index / plan.scenes.length * 35) }
      await writeJob(job)
      if (job.narration) {
        try {
          const speech = await synthesizeSpeech(scene.narration, true, { language: job.language })
          const audio = `narration-${index}.mp3`
          await writeFile(path.join(directory, audio), speech.audio)
          timings.push({ duration: Math.max(8, speech.duration + 0.9), audio })
        } catch (error) {
          // A speech outage should not discard a useful rendered visual lesson.
          job = { ...job, narration: false, warning: error instanceof AiError ? `${error.message} This video includes captions instead.` : "Narration is unavailable. This video includes captions instead." }
          for (const timing of timings) delete timing.audio
          timings.push({ duration: Math.max(10, scene.narration.split(/\s+/).length / 2.5) })
        }
      } else timings.push({ duration: Math.max(10, scene.narration.split(/\s+/).length / 2.5) })
    }
    if (!job.narration && !job.warning) job.warning = "ElevenLabs is not configured. This video includes captions instead."
    await writeFile(path.join(directory, "scene.py"), await source(plan, timings))
    let elapsed = 0
    const chapters: NonNullable<VideoJob["chapters"]> = []
    const cues = plan.scenes.map((scene, index) => {
      const start = elapsed
      elapsed += timings[index].duration
      chapters.push({ heading: scene.heading, narration: scene.narration, start, duration: timings[index].duration })
      return `${index + 1}\n${captionTime(start)} --> ${captionTime(elapsed)}\n${scene.narration.replace(/[<>]/g, "").replace(/\n+/g, " ")}\n`
    })
    await writeFile(path.join(directory, "captions.vtt"), `WEBVTT\n\n${cues.join("\n")}`)
    job = { ...job, status: "rendering", stage: "Rendering Manim animation", progress: 55 }
    await writeJob(job)
    const rendered = await execute(python(), ["-m", "manim", "render", "-qm", "--disable_caching", "--format", "mp4", "--media_dir", path.join(directory, "media"), "-o", "lesson", path.join(directory, "scene.py"), "PrismLesson"], { cwd: directory, env: rendererEnv(directory), timeout: 600_000, maxBuffer: 8_000_000 })
    await writeFile(path.join(directory, "render.log"), rendered.stdout + rendered.stderr)
    const movie = await findMovie(path.join(directory, "media"))
    if (!movie) throw new AiError("Manim did not produce a video. Retry with a smaller selection.")
    job = { ...job, stage: "Preparing video playback", progress: 95 }
    await writeJob(job)
    const final = path.join(directory, "video.mp4")
    try { await execute(process.env.FFMPEG_PATH || "ffmpeg", ["-y", "-i", movie, "-c", "copy", "-movflags", "+faststart", final], { env: rendererEnv(directory), timeout: 30_000, maxBuffer: 1_000_000 }) }
    catch { await copyFile(movie, final) }
    await access(final)
    await writeFile(path.join(directory, "README.txt"), "Prism Manim lesson\n\nInstall: pip install manim==0.20.1\nRender: manim -qm scene.py PrismLesson\n\nKeep the narration MP3 files beside scene.py for narrated playback.\nRequires Cairo/Pango and FFmpeg. No LaTeX is required.\n")
    const files = ["scene.py", "plan.json", "captions.vtt", "README.txt", ...timings.flatMap((timing) => timing.audio ? [timing.audio] : [])]
    await execute(python(), ["-c", "import json, sys, zipfile; files=json.loads(sys.argv[1]); archive=zipfile.ZipFile('source.zip','w',zipfile.ZIP_DEFLATED); [archive.write(name, name) for name in files]; archive.close()", JSON.stringify(files)], { cwd: directory, env: rendererEnv(directory), timeout: 20_000 })
    await writeJob({ ...job, chapters, status: "ready", stage: "Your video is ready", progress: 100, videoUrl: `/api/videos/${id}/video`, captionsUrl: `/api/videos/${id}/captions`, bundleUrl: `/api/videos/${id}/bundle` })
  } catch (error) {
    const details = error as Error & { stdout?: string; stderr?: string }
    await writeFile(path.join(directory, "render.log"), `${details.message}\n${details.stdout || ""}\n${details.stderr || ""}`).catch(() => undefined)
    await writeJob({ ...job, status: "failed", stage: "Video could not be rendered", error: error instanceof AiError ? error.message : "The renderer failed or timed out. Check the local Manim installation and retry." })
  }
}
