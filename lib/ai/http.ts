export class AiError extends Error {
  constructor(message: string, public status = 502) { super(message) }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) throw new AiError("Cross-origin requests are disabled.", 403)
}
export async function readBytes(request: Request, maxBytes: number): Promise<Buffer> {
  const reader = request.body?.getReader()
  if (!reader) throw new AiError("A request body is required.", 400)
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) { await reader.cancel(); throw new AiError("The selection is too large.", 413) }
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } catch (error) {
    if (error instanceof AiError) throw error
    throw new AiError("Invalid request body.", 400)
  }
}
export async function readJson(request: Request, maxBytes = 4_000_000): Promise<unknown> {
  const bytes = await readBytes(request, maxBytes)
  try { return JSON.parse(bytes.toString("utf8")) }
  catch { throw new AiError("Invalid JSON request.", 400) }
}
export function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof AiError ? error.message : "The request could not be completed. Try again." }, { status: error instanceof AiError ? error.status : 500 })
}
const globalLimits = globalThis as typeof globalThis & { prismRateLimits?: Map<string, number[]> }
const limits = globalLimits.prismRateLimits ??= new Map<string, number[]>()
export function rateLimit(request: Request, bucket: string, maximum: number) {
  const key = `${bucket}:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local"}`
  const now = Date.now()
  const recent = (limits.get(key) ?? []).filter((time) => now - time < 60_000)
  if (recent.length >= maximum) throw new AiError("Too many requests. Please wait a minute before trying again.", 429)
  recent.push(now)
  limits.set(key, recent)
  if (limits.size > 1000) for (const [id, times] of limits) if (now - times[times.length - 1] > 60_000) limits.delete(id)
}
