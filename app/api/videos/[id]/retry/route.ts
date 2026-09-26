import { after } from "next/server"
import { errorResponse, rateLimit, sameOrigin } from "@/lib/ai/http"
import { ensureRenderer, renderVideoJob, retryVideoJob } from "@/lib/ai/video-jobs"
export const runtime = "nodejs"
export const maxDuration = 900
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request)
    rateLimit(request, "video", 3)
    const id = (await params).id
    await ensureRenderer()
    const job = await retryVideoJob(id)
    after(() => renderVideoJob(job.id))
    return Response.json(job, { status: 202 })
  } catch (error) { return errorResponse(error) }
}
