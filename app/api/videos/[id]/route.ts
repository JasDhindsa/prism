import { errorResponse } from "@/lib/ai/http"
import { readVideoJob } from "@/lib/ai/video-jobs"
export const runtime = "nodejs"
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return Response.json(await readVideoJob((await params).id), { headers: { "Cache-Control": "no-store" } }) }
  catch (error) { return errorResponse(error) }
}
