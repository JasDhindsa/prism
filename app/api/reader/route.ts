import { after } from "next/server"
import { errorResponse, rateLimit, readJson, sameOrigin } from "@/lib/ai/http"
import { generateReader, generateVideoPlan, validateInput } from "@/lib/ai/reader"
import { createVideoJob, ensureRenderer, ensureVideoCapacity, renderVideoJob } from "@/lib/ai/video-jobs"

export const runtime = "nodejs"
export const maxDuration = 900

export async function POST(request: Request) {
  try {
    sameOrigin(request)
    const input = validateInput(await readJson(request, 9_000_000))
    rateLimit(request, "reader", 30)
    if (input.action === "video") {
      rateLimit(request, "video", 3)
      await ensureRenderer()
      await ensureVideoCapacity()
      const plan = await generateVideoPlan(input)
      const video = await createVideoJob(plan)
      after(() => renderVideoJob(video.id))
      return Response.json({ answer: plan.summary, title: plan.title, video }, { status: 202 })
    }
    return Response.json(await generateReader(input))
  } catch (error) { return errorResponse(error) }
}
