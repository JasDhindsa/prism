import type { PDFDocumentProxy } from "pdfjs-dist"
import { documentPageTexts, retrieveDocumentPassages, type DocumentPassage } from "./document-retrieval"

const indexes = new WeakMap<PDFDocumentProxy, Promise<DocumentPassage[]>>()
const descriptions = new WeakMap<PDFDocumentProxy, Map<number, string>>()

async function visualDescriptions(pdf: PDFDocumentProxy, renderPage: (number: number, thumbnail?: boolean) => Promise<string | undefined>, status: (text: string) => void) {
  let saved = descriptions.get(pdf)
  if (!saved) { saved = new Map(); descriptions.set(pdf, saved) }
  const scanned = (await documentPageTexts(pdf, status)).filter((item) => item.text.trim().length < 80 && !saved.has(item.page)).map((item) => item.page)
  for (let start = 0; start < scanned.length; start += 6) {
    const batch = scanned.slice(start, start + 6)
    status(`Reading scanned pages ${start + 1}–${Math.min(start + 6, scanned.length)} of ${scanned.length}…`)
    const images: { page: number; image: string }[] = []
    for (const page of batch) { const image = await renderPage(page, true); if (image) images.push({ page, image }) }
    if (!images.length) continue
    const response = await fetch("/api/document-index", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentImages: images }) })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Scanned pages could not be indexed.")
    for (const item of data.pages as DocumentPassage[]) saved.set(item.page, item.text)
  }
  return [...saved].map(([page, text]) => ({ page, text }))
}

export async function retrieveChatDocumentContext(pdf: PDFDocumentProxy, question: string, currentPage: number, selection: string, renderPage: (number: number, thumbnail?: boolean) => Promise<string | undefined>, status: (text: string) => void) {
  status("Searching across the document…")
  let index = indexes.get(pdf)
  if (!index) {
    index = visualDescriptions(pdf, renderPage, status)
    indexes.set(pdf, index)
    void index.catch(() => indexes.delete(pdf))
  }
  const supplemental = await index
  const passages = await retrieveDocumentPassages(pdf, selection, question, currentPage, supplemental)
  const requested: number[] = []
  for (const match of question.matchAll(/\bpages?\s+(\d+)(?:\s*(?:-|–|to|and|,)\s*(\d+))?/gi)) {
    for (const value of [match[1], match[2]]) { const page = Number(value); if (page >= 1 && page <= pdf.numPages) requested.push(page) }
  }
  const pages = [...new Set([...requested, currentPage, ...passages.map((item) => item.page)])].slice(0, 6)
  // General overview questions may not contain terms from the document. Sample across it.
  if (pages.length < 3) {
    for (const page of [1, Math.round(pdf.numPages / 3), Math.round(pdf.numPages * 2 / 3), pdf.numPages]) {
      if (page >= 1 && !pages.includes(page) && pages.length < 6) pages.push(page)
    }
  }
  status(`Examining ${pages.length} document pages…`)
  const images: { page: number; image: string }[] = []
  for (const page of pages) { const image = await renderPage(page); if (image) images.push({ page, image }) }
  return { documentPassages: passages, documentImages: images }
}
