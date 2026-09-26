import { speechConfigured } from "@/lib/ai/elevenlabs"
import { AiError, errorResponse, rateLimit, readBytes, sameOrigin } from "@/lib/ai/http"
export const runtime = "nodejs"
export const maxDuration = 90
export async function POST(request: Request) {
  try {
    sameOrigin(request)
    rateLimit(request, "transcribe", 30)
    if (!speechConfigured()) throw new AiError("ElevenLabs is not configured for voice input.", 503)
    const bytes = await readBytes(request, 12_000_000)
    const form = await new Response(new Uint8Array(bytes), { headers: { "Content-Type": request.headers.get("content-type") || "" } }).formData().catch(() => { throw new AiError("Invalid audio upload.", 400) })
    const file = form.get("file")
    const language = form.get("language")
    if (language !== null && (typeof language !== "string" || !/^[a-z]{2,3}$/.test(language))) throw new AiError("Invalid conversation language.", 400)
    if (!(file instanceof File) || !file.size || file.size > 10_000_000 || !/^(audio\/(webm|mp4|ogg|wav|mpeg)|video\/webm)/.test(file.type)) throw new AiError("Upload a short audio recording (up to 10 MB).", 400)
    const payload = new FormData()
    payload.set("file", file)
    payload.set("model_id", process.env.ELEVENLABS_STT_MODEL_ID || "scribe_v2")
    payload.set("tag_audio_events", "false")
    if (language) payload.set("language_code", language as string)
    let response: Response
    try { response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!.trim() }, body: payload, signal: AbortSignal.timeout(60_000) }) }
    catch { throw new AiError("The transcription service could not be reached. Try again.") }
    if (!response.ok) throw new AiError(response.status === 429 ? "ElevenLabs usage limit reached. Try again later." : "ElevenLabs could not transcribe this recording. Check API key access and credits.", response.status === 429 ? 429 : 502)
    const data = await response.json() as { text?: string; language_code?: string }
    if (!data.text?.trim()) throw new AiError("No speech was detected. Try recording again.", 422)
    return Response.json({ text: data.text.trim().slice(0, 2000), language: data.language_code })
  } catch (error) { return errorResponse(error) }
}
