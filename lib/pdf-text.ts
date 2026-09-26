import type { PDFPageProxy } from "pdfjs-dist"

type TextContent = Awaited<ReturnType<PDFPageProxy["getTextContent"]>>

// PDF.js 6 uses `for await` in getTextContent, which requires ReadableStream
// async iteration. WebKit browsers can render PDFs without supporting that API.
export async function readPdfPageText(page: PDFPageProxy, maxCharacters = Infinity): Promise<string> {
  if (page.isPureXfa) {
    const content = await page.getTextContent()
    return content.items.map((item) => "str" in item ? item.str : "").join(" ").slice(0, maxCharacters)
  }
  const reader = (page.streamTextContent() as ReadableStream<TextContent>).getReader()
  let text = ""
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (text.length >= maxCharacters) continue
      const chunk = value.items.map((item) => "str" in item ? item.str : "").join(" ")
      text = (text ? `${text} ${chunk}` : chunk).slice(0, maxCharacters)
    }
    return text
  } finally { reader.releaseLock() }
}
