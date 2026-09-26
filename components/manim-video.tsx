"use client"
import { useEffect, useRef, useState } from "react"
import type { VideoJob } from "@/lib/reader-types"
import { RiCodeLine, RiDownloadLine, RiRestartLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function ManimVideo({ jobId }: { jobId: string }) {
  const player = useRef<HTMLVideoElement>(null)
  const id = jobId
  const [attempt, setAttempt] = useState(0)
  const [job, setJob] = useState<VideoJob | null>(null)
  const [error, setError] = useState("")
  const [retrying, setRetrying] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [code, setCode] = useState("")
  const [codeLoading, setCodeLoading] = useState(false)
  const retryController = useRef<AbortController | null>(null)
  const codeController = useRef<AbortController | null>(null)
  useEffect(() => () => { retryController.current?.abort(); codeController.current?.abort() }, [])
  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function poll() {
      try {
        const response = await fetch(`/api/videos/${id}`, { cache: "no-store", signal: controller.signal })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Video status is unavailable.")
        if (!active) return
        setJob(data); setError("")
        if (!["ready", "failed"].includes(data.status)) timer = setTimeout(() => void poll(), 2000)
      } catch (caught) {
        if (!active) return
        setError(caught instanceof Error ? caught.message : "Video status is unavailable.")
        timer = setTimeout(() => void poll(), 5000)
      }
    }
    void poll()
    return () => { active = false; controller.abort(); clearTimeout(timer) }
  }, [id, attempt])
  async function retry() {
    setRetrying(true); setError("")
    retryController.current = new AbortController()
    try {
      const response = await fetch(`/api/videos/${id}/retry`, { method: "POST", signal: retryController.current.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Video could not be restarted.")
      setJob(data); setAttempt((value) => value + 1)
    } catch (caught) { if (!retryController.current.signal.aborted) setError(caught instanceof Error ? caught.message : "Video could not be restarted.") }
    finally { if (!retryController.current.signal.aborted) setRetrying(false) }
  }
  async function viewCode() {
    if (!job?.sourceUrl || codeLoading) return
    setCodeOpen(true); setCodeLoading(true)
    codeController.current = new AbortController()
    try {
      const response = await fetch(job.sourceUrl, { cache: "no-store", signal: codeController.current.signal })
      if (!response.ok) throw new Error("The animation source could not be loaded.")
      setCode(await response.text())
    } catch (caught) { if (!codeController.current.signal.aborted) setError(caught instanceof Error ? caught.message : "The animation source could not be loaded.") }
    finally { if (!codeController.current.signal.aborted) setCodeLoading(false) }
  }
  return <div className="reader-manim-video">
    {job?.status === "ready" && job.videoUrl ? <video ref={player} key={id} controls playsInline preload="metadata" className="w-full rounded-xl bg-[#0B1020]" aria-label={job.title} onError={() => setError("This video could not be played. Try downloading it.")}>
      <source src={job.videoUrl} type="video/mp4" />
      {job.captionsUrl && <track kind="captions" src={job.captionsUrl} srcLang={job.language || "en"} label="Lesson captions" default={!job.narration} />}
    </video> : <div className="rounded-xl bg-[#0B1020] px-5 py-7 text-center text-white" aria-live="polite" aria-busy={job?.status !== "failed"}>
      {job?.status !== "failed" && <Spinner className="mx-auto mb-3 size-5 text-[#5CB8FF]" />}
      <p className="text-sm font-medium">{job?.status === "failed" ? "Couldn’t create this video" : job?.stage || "Loading animation…"}</p>
      {job?.status === "failed" ? <><p className="mt-2 text-xs leading-5 text-white/65">{job.error}</p><Button size="sm" variant="secondary" className="mt-4" disabled={retrying} onClick={() => void retry()}><RiRestartLine className="size-3.5" />{retrying ? "Restarting…" : "Retry video"}</Button></> : <><Progress value={job?.progress ?? 5} className="mt-4" /><p className="mt-3 text-[11px] text-white/60">You can keep reading while your video renders.</p></>}
    </div>}
    {!!job?.chapters?.length && <details className="reader-video-chapters" open={job.status !== "ready"}><summary>{job.status === "ready" ? "Chapters & transcript" : "Your lesson outline"} · {job.chapters.length} scenes</summary><ol>{job.chapters.map((chapter, index) => <li key={index}><button type="button" disabled={job.status !== "ready"} onClick={() => { if (player.current) { player.current.currentTime = chapter.start; void player.current.play().catch(() => undefined) } }}><span>{index + 1}. {chapter.heading}</span>{job.status === "ready" && <time>{Math.floor(chapter.start / 60)}:{String(Math.floor(chapter.start % 60)).padStart(2, "0")}</time>}</button><p dir="auto">{chapter.narration}</p></li>)}</ol></details>}
    {job?.warning && <p className="mt-2 text-xs leading-5 text-muted-foreground">{job.warning}</p>}
    {error && <p role="alert" className="mt-2 text-xs leading-5 text-destructive">{error}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {job?.sourceUrl && <button type="button" onClick={() => void viewCode()} className="inline-flex items-center gap-1.5 hover:text-foreground"><RiCodeLine className="size-3.5" />View Manim code</button>}
      {job?.bundleUrl && <a href={job.bundleUrl} download="prism-lesson-source.zip" className="inline-flex items-center gap-1.5 hover:text-foreground"><RiDownloadLine className="size-3.5" />Source + narration</a>}
      {job?.videoUrl && <a href={`${job.videoUrl}?download=1`} download="prism-lesson.mp4" className="inline-flex items-center gap-1.5 hover:text-foreground"><RiDownloadLine className="size-3.5" />Download video</a>}
    </div>
    <Dialog open={codeOpen} onOpenChange={setCodeOpen}><DialogContent className="w-[min(840px,calc(100vw-32px))] max-w-none"><DialogHeader><DialogTitle>{job?.title || "Animation"} · Manim source</DialogTitle></DialogHeader>
      {codeLoading ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Spinner />Loading source…</div> : <pre className="max-h-[65vh] overflow-auto rounded-xl bg-[#0B1020] p-5 text-[11px] leading-5 text-[#B8C4DB]"><code>{code || "Source is unavailable."}</code></pre>}
      <div className="flex flex-wrap gap-4 text-xs">{job?.sourceUrl && <a href={job.sourceUrl} download="prism-lesson.py" className="underline underline-offset-4">Download Python source</a>}{job?.bundleUrl && <a href={job.bundleUrl} download="prism-lesson-source.zip" className="underline underline-offset-4">Download source with narration</a>}</div>
    </DialogContent></Dialog>
  </div>
}
