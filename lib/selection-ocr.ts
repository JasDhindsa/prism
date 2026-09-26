import { languages } from "./languages"
import type { Worker } from "tesseract.js"

// Small in-memory cache: selections never leave the browser for OCR.
const cache = new Map<string, string>()
export async function readSelectionImage(image: string, language: string, signal: AbortSignal, options: { fresh?: boolean } = {}): Promise<string> {
  const ocr = languages.find((item) => item.name === language)?.ocr || "eng"
  const key = `${ocr}:${image}`
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError")
  if (!options.fresh && cache.has(key)) return cache.get(key)!
  let worker: Worker | undefined
  let abort: (() => void) | undefined
  const extraction = async () => {
    const { createWorker, PSM } = await import("tesseract.js")
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError")
    worker = await createWorker(ocr === "eng" ? "eng" : `eng+${ocr}`, 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr", workerBlobURL: false })
    if (signal.aborted) { await worker.terminate(); throw new DOMException("Cancelled", "AbortError") }
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    const result = await worker.recognize(image)
    const text = result.data.text.trim().slice(0, 12000)
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError")
    if (cache.size >= 8) cache.delete(cache.keys().next().value!)
    cache.set(key, text)
    return text
  }
  try {
    return await Promise.race([extraction(), new Promise<never>((_, reject) => {
      abort = () => { void worker?.terminate().catch(() => undefined); reject(new DOMException("Cancelled", "AbortError")) }
      signal.addEventListener("abort", abort, { once: true })
    })])
  } finally {
    if (abort) signal.removeEventListener("abort", abort)
    await worker?.terminate().catch(() => undefined)
  }
}
