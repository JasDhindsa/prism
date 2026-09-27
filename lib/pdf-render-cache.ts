import type { PDFDocumentProxy } from "pdfjs-dist"

// Keep recent rendered pages available when scrolling back, with a bounded bitmap budget.
const documents = new WeakMap<PDFDocumentProxy, Map<string, HTMLCanvasElement>>()
const MAX_PIXELS = 16_000_000
const MAX_PAGES = 10
export function cachedPdfCanvas(pdf: PDFDocumentProxy, key: string) {
  const cache = documents.get(pdf)
  const canvas = cache?.get(key)
  if (canvas) { cache!.delete(key); cache!.set(key, canvas) }
  return canvas
}
export function cachePdfCanvas(pdf: PDFDocumentProxy, key: string, canvas: HTMLCanvasElement) {
  if (canvas.width * canvas.height > MAX_PIXELS) return
  let cache = documents.get(pdf)
  if (!cache) { cache = new Map(); documents.set(pdf, cache) }
  cache.delete(key); cache.set(key, canvas)
  let pixels = [...cache.values()].reduce((total, item) => total + item.width * item.height, 0)
  while (cache.size > MAX_PAGES || pixels > MAX_PIXELS) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    const item = cache.get(oldest)!
    pixels -= item.width * item.height
    cache.delete(oldest)
  }
}
