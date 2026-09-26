import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { synthesizeSpeech, streamSpeech } from "@/lib/ai/elevenlabs"
import { AiError, errorResponse, rateLimit, readJson, sameOrigin } from "@/lib/ai/http"

export const runtime = "nodejs"
export const maxDuration = 90
export async function POST(request: Request) {
  try {
    sameOrigin(request)
    const input = await readJson(request, 20000) as { text?: unknown; language?: unknown; conversational?: unknown; stream?: unknown }
    if (!input || typeof input.text !== "string" || !input.text.trim() || input.text.length > 6000) throw new AiError("Provide between 1 and 6,000 characters to read aloud.", 400)
    if ((input.language !== undefined && (typeof input.language !== "string" || !/^[a-z]{2,3}$/.test(input.language))) || (input.conversational !== undefined && typeof input.conversational !== "boolean")) throw new AiError("Invalid speech settings.", 400)
    if (input.stream !== undefined && typeof input.stream !== "boolean") throw new AiError("Invalid streaming setting.", 400)
    rateLimit(request, "speech", 30)
    const text = input.text.trim()
    const options = { language: input.language as string | undefined, conversational: input.conversational as boolean | undefined }
    if (input.stream === true) {
      const body = await streamSpeech(text, options, request.signal)
      return new Response(body, { headers: { "Content-Type": "audio/pcm", "X-Audio-Sample-Rate": "24000", "Cache-Control": "private, no-store", "X-Accel-Buffering": "no" } })
    }
    const digest = createHash("sha256").update(JSON.stringify([text, process.env.ELEVENLABS_VOICE_ID, process.env.ELEVENLABS_MODEL_ID, process.env.ELEVENLABS_CONVERSATION_MODEL_ID, options])).digest("hex")
    const directory = path.resolve(process.env.DATA_DIR || ".data", "ai", "speech")
    const file = path.join(directory, `${digest}.mp3`)
    let audio: Buffer
    try { audio = await readFile(file) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      audio = (await synthesizeSpeech(text, false, options)).audio
      await mkdir(directory, { recursive: true })
      await writeFile(file, audio)
    }
    return new Response(new Uint8Array(audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store" } })
  } catch (error) { return errorResponse(error) }
}
