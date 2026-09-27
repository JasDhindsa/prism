import type { PDFDocumentProxy } from "pdfjs-dist"
import { readPdfPageText } from "./pdf-text"

export type DocumentPassage = { page: number; text: string }
type IndexedPassage = DocumentPassage & { terms: Map<string, number> }

const pageTextCache = new WeakMap<PDFDocumentProxy, Promise<DocumentPassage[]>>()
const indexCache = new WeakMap<PDFDocumentProxy, Promise<IndexedPassage[]>>()
const stopWords = new Set("about after again against also among because been before between could does each from have into more most other over same some such than that their them then there these this those through under very were what when where which while with would your".split(" "))

function terms(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const term of text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (term.length < 3 || stopWords.has(term)) continue
    counts.set(term, (counts.get(term) ?? 0) + 1)
  }
  return counts
}

function splitPassages(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim()
  const passages: string[] = []
  for (let start = 0; start < normalized.length;) {
    let end = Math.min(normalized.length, start + 1400)
    if (end < normalized.length) {
      const boundary = normalized.lastIndexOf(" ", end)
      if (boundary > start + 900) end = boundary
    }
    const passage = normalized.slice(start, end).trim()
    if (passage.length >= 100) passages.push(passage)
    if (end >= normalized.length) break
    start = Math.max(start + 1, end - 180)
  }
  return passages
}

export function documentPageTexts(pdf: PDFDocumentProxy, status?: (text: string) => void): Promise<DocumentPassage[]> {
  let cached = pageTextCache.get(pdf)
  if (!cached) {
    cached = (async () => {
      const pages: DocumentPassage[] = []
      for (let page = 1; page <= pdf.numPages; page++) {
        if (page === 1 || page % 25 === 0) status?.(`Indexing document page ${page} of ${pdf.numPages}…`)
        const text = await readPdfPageText(await pdf.getPage(page), 100_000).catch(() => "")
        pages.push({ page, text })
      }
      return pages
    })()
    pageTextCache.set(pdf, cached)
    void cached.catch(() => pageTextCache.delete(pdf))
  }
  return cached
}

async function indexDocument(pdf: PDFDocumentProxy): Promise<IndexedPassage[]> {
  return (await documentPageTexts(pdf)).flatMap(({ page, text }) => splitPassages(text).map((passage) => ({ page, text: passage, terms: terms(passage) })))
}

export async function retrieveDocumentPassages(pdf: PDFDocumentProxy, selection: string, topic = "", selectedPage?: number, supplemental: DocumentPassage[] = []): Promise<DocumentPassage[]> {
  let index = indexCache.get(pdf)
  if (!index) { index = indexDocument(pdf); indexCache.set(pdf, index) }
  const passages = [...await index, ...supplemental.map((passage) => ({ ...passage, terms: terms(passage.text) }))]
  if (!passages.length) return []

  const query = terms(`${topic} ${selection.slice(0, 4000)}`)
  const topicTerms = terms(topic)
  if (!query.size) return []
  const frequency = new Map<string, number>()
  for (const passage of passages) for (const term of passage.terms.keys()) frequency.set(term, (frequency.get(term) ?? 0) + 1)
  const ranked = passages.map((passage) => {
    let score = 0
    for (const [term, count] of query) {
      const matches = passage.terms.get(term) ?? 0
      if (!matches) continue
      const rarity = Math.log(1 + (passages.length + 1) / (1 + (frequency.get(term) ?? 0)))
      score += (topicTerms.has(term) ? 3 : 1) * Math.min(count, 3) * rarity * matches / (matches + 1.2)
    }
    if (passage.page === selectedPage) score *= 0.75
    return { passage, score }
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score)

  const selected: DocumentPassage[] = []
  const perPage = new Map<number, number>()
  for (const { passage } of ranked) {
    if ((perPage.get(passage.page) ?? 0) >= 2) continue
    selected.push({ page: passage.page, text: passage.text })
    perPage.set(passage.page, (perPage.get(passage.page) ?? 0) + 1)
    if (selected.length === 6) break
  }
  return selected
}
