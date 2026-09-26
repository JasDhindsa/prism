import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import { Readable } from "node:stream"
import path from "node:path"
import { AiError, errorResponse } from "@/lib/ai/http"
import { readVideoJob, videoDirectory } from "@/lib/ai/video-jobs"
export const runtime = "nodejs"
export async function GET(request: Request, { params }: { params: Promise<{ id: string; asset: string }> }) {
  try {
    const { id, asset } = await params
    const allowed: Record<string, { file: string; type: string }> = { source: { file: "scene.py", type: "text/x-python; charset=utf-8" }, video: { file: "video.mp4", type: "video/mp4" }, captions: { file: "captions.vtt", type: "text/vtt; charset=utf-8" }, bundle: { file: "source.zip", type: "application/zip" } }
    if (!Object.hasOwn(allowed, asset)) throw new AiError("Asset not found.", 404)
    const job = await readVideoJob(id)
    if (asset !== "source" && job.status !== "ready") throw new AiError("The video is not ready yet.", 409)
    const file = path.join(/* turbopackIgnore: true */ videoDirectory(id), allowed[asset].file)
    const { size } = await stat(/* turbopackIgnore: true */ file)
    const headers = new Headers({ "Content-Type": allowed[asset].type, "Cache-Control": asset === "source" && job.status !== "ready" ? "no-store" : "private, max-age=31536000, immutable", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff" })
    if (asset === "source") headers.set("Content-Disposition", 'attachment; filename="prism-lesson.py"')
    if (asset === "bundle") headers.set("Content-Disposition", 'attachment; filename="prism-lesson-source.zip"')
    if (asset === "video" && new URL(request.url).searchParams.get("download") === "1") headers.set("Content-Disposition", 'attachment; filename="prism-lesson.mp4"')
    let start = 0, end = size - 1, status = 200
    const range = request.headers.get("range")
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range)
      if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } })
      if (!match[1]) start = Math.max(0, size - Number(match[2]))
      else { start = Number(match[1]); if (match[2]) end = Math.min(Number(match[2]), size - 1) }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } })
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`)
      status = 206
    }
    headers.set("Content-Length", String(end - start + 1))
    return new Response(Readable.toWeb(createReadStream(/* turbopackIgnore: true */ file, { start, end })) as ReadableStream<Uint8Array>, { status, headers })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return errorResponse(new AiError("Asset not found.", 404))
    return errorResponse(error)
  }
}
