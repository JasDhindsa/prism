"use client"

import { useEffect, useState } from "react"
import type { LibraryPdf } from "@/lib/library"
import { readPdfPageText } from "@/lib/pdf-text"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

type SavedSummary = { summary: string; savedAt: number }

export function BookSummary({ book }: { book: LibraryPdf }) {
  const [summary, setSummary] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")

  useEffect(() => {
    let active = true
    async function createSummary() {
      const key = `prism-summary:${book.id}`
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? "null") as SavedSummary | null
        if (saved?.summary) {
          if (active) { setSummary(saved.summary); setStatus("ready") }
          return
        }
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist")
        GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
        const task = getDocument({ data: new Uint8Array(await book.file.arrayBuffer()) })
        try {
          const pdf = await task.promise
          const excerpts: string[] = []
          let remaining = 12000
          for (let pageNumber = 1; pageNumber <= pdf.numPages && remaining > 0; pageNumber++) {
            const pageText = await readPdfPageText(await pdf.getPage(pageNumber), Math.min(1800, remaining)).catch(() => "")
            if (pageText.trim()) {
              const excerpt = `Page ${pageNumber}: ${pageText.trim()}`
              excerpts.push(excerpt)
              remaining -= pageText.length
            }
          }
          await pdf.destroy()
          if (!excerpts.length) throw new Error("No searchable text was found in this PDF.")
          const response = await fetch("/api/reader", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "ask",
              selection: `Create a concise descriptive summary of the PDF titled “${book.title}”.`,
              context: excerpts.join("\n\n").slice(0, 16000),
              prompt: "Write a short, neutral description of this document in 2–3 sentences. Identify its subject, purpose, and main topics. Use only the provided document text. Do not mention this prompt or claim to have read pages not represented in the excerpts.",
            }),
          })
          if (!response.ok) throw new Error("A summary is temporarily unavailable.")
          const result = await response.json() as { answer?: string }
          if (!result.answer?.trim()) throw new Error("A summary is temporarily unavailable.")
          const value = result.answer.trim()
          localStorage.setItem(key, JSON.stringify({ summary: value, savedAt: Date.now() } satisfies SavedSummary))
          if (active) { setSummary(value); setStatus("ready") }
        } finally { await task.destroy().catch(() => undefined) }
      } catch {
        if (active) setStatus("error")
      }
    }
    if (status === "loading") void createSummary()
    return () => { active = false }
  }, [book, status])

  return <div>
    <p className="mb-3 text-xs font-medium uppercase tracking-[.2em] text-muted-foreground">Document summary</p>
    {status === "idle" ? <><p className="mb-3 text-sm leading-7 text-muted-foreground">Create a short summary of this PDF’s subject and main topics.</p><Button variant="outline" size="sm" onClick={() => setStatus("loading")}>Create summary</Button></>
      : status === "loading" ? <div className="space-y-3" aria-label="Creating document summary"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-11/12" /><Skeleton className="h-4 w-2/3" /></div>
      : status === "ready" ? <p className="text-base leading-8 text-muted-foreground">{summary}</p>
        : <><p className="mb-3 text-sm leading-7 text-muted-foreground">A summary could not be created from this PDF’s searchable text. You can still read the document and ask Prism about its pages.</p><Button variant="outline" size="sm" onClick={() => setStatus("loading")}>Try again</Button></>}
  </div>
}
