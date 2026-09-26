import { AiError, errorResponse, rateLimit, sameOrigin } from "@/lib/ai/http"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(request: Request) {
  try {
    sameOrigin(request)
    rateLimit(request, "live-session", 6)
    const key = process.env.GEMINI_API_KEY?.trim()
    if (!key || /^(your[_-]|replace|paste|<)/i.test(key)) throw new AiError("Add GEMINI_API_KEY to the server environment for voice conversations.", 503)
    const model = (process.env.GEMINI_LIVE_MODEL || "gemini-3.8-live").replace(/^models\//, "")
    const response = await fetch("https://generativelanguage.googleapis.com/v1alpha/auth_tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(Date.now() + 10 * 60_000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 60_000).toISOString(),
        // REST uses the serialized setup, not the SDK-only liveConnectConstraints option.
        bidiGenerateContentSetup: { model: `models/${model}`, generationConfig: { responseModalities: ["AUDIO"], maxOutputTokens: 512 } },
        fieldMask: "model,generationConfig.responseModalities,generationConfig.maxOutputTokens",
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) {
      const details = await response.json().catch(() => null) as { error?: { message?: string; status?: string } } | null
      const reason = details?.error?.message?.replaceAll(key, "[redacted]").replace(/auth_tokens\/[A-Za-z0-9_-]+/g, "[session credential]").slice(0, 700)
      throw new AiError(`Gemini Live session request failed (HTTP ${response.status}${details?.error?.status ? ` · ${details.error.status}` : ""}).${reason ? ` ${reason}` : " Please try again."}`, response.status === 429 ? 429 : 502)
    }
    const token = await response.json() as { name?: string }
    if (!token.name?.startsWith("auth_tokens/")) throw new AiError("Gemini Live returned an invalid session credential.")
    return Response.json({ token: token.name, model, apiVersion: "v1alpha", voice: process.env.GEMINI_LIVE_VOICE || "Kore", maxSessionSeconds: 480, idleSeconds: 60 }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return errorResponse(error) }
}
