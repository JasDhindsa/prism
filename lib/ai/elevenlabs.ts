import { AiError } from "./http"
import { speechLanguageCode } from "../languages"
export function speechConfigured() {
  return !!process.env.ELEVENLABS_API_KEY?.trim() && !/^(your[_-]|replace|paste|<)/i.test(process.env.ELEVENLABS_API_KEY.trim())
}
export async function synthesizeSpeech(text: string, timestamps = false, options: { language?: string; conversational?: boolean } = {}) {
  if (!speechConfigured()) throw new AiError("Add ELEVENLABS_API_KEY to the server environment for narration.", 503)
  const voice = process.env.ELEVENLABS_VOICE_ID || "JBFqnCBsd6RMkjVDRZzb"
  const language = speechLanguageCode(options.language) || (/[\u0A00-\u0A7F]/.test(text) ? "pa" : undefined)
  const model = (options.conversational || language === "pa") ? process.env.ELEVENLABS_CONVERSATION_MODEL_ID || "eleven_v3" : process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2"
  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}${timestamps ? "/with-timestamps" : ""}?output_format=mp3_44100_128`, {
      method: "POST", headers: { "Content-Type": "application/json", "xi-api-key": process.env.ELEVENLABS_API_KEY!.trim() },
      body: JSON.stringify({ text, model_id: model, ...(language && model !== "eleven_multilingual_v2" ? { language_code: language } : {}), voice_settings: { stability: model === "eleven_v3" ? 0.5 : 0.55, similarity_boost: 0.75 } }), signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) {
      if (response.status === 429) throw new AiError("ElevenLabs usage limit reached. Try again later.", 429)
      if ([401, 403].includes(response.status)) throw new AiError("ElevenLabs rejected the API key or voice access. Check the server configuration.")
      throw new AiError("ElevenLabs could not generate speech. Check your voice settings and remaining credits.")
    }
    if (!timestamps) return { audio: Buffer.from(await response.arrayBuffer()), duration: 0 }
    const data = await response.json() as { audio_base64?: string; alignment?: { character_end_times_seconds?: number[] }; normalized_alignment?: { character_end_times_seconds?: number[] } }
    if (!data.audio_base64) throw new AiError("ElevenLabs returned no audio.")
    const times = data.normalized_alignment?.character_end_times_seconds ?? data.alignment?.character_end_times_seconds ?? []
    const duration = times[times.length - 1]
    if (!Number.isFinite(duration) || duration <= 0 || duration > 90) throw new AiError("ElevenLabs returned invalid narration timing.")
    return { audio: Buffer.from(data.audio_base64, "base64"), duration }
  } catch (error) {
    if (error instanceof AiError) throw error
    throw new AiError("The speech service could not be reached. Try again.")
  }
}
