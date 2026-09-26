"use client"
import { useEffect, useRef, useState } from "react"
import { RiArrowRightLine, RiScanLine, RiRestartLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Progress } from "@/components/ui/progress"
import { languages } from "@/lib/languages"
import type { ReaderAction } from "@/lib/reader-types"
import { proficiencyLevels, type ReadingProficiency } from "@/lib/reader-preferences"
import type { Worker } from "tesseract.js"

export type AnnotationDraft = { text: string; topic: string; instructions: string; language: string; detailed: boolean }
type Action = Exclude<ReaderAction, "ask">
const descriptions: Record<Action, { title: string; about: string; instructions: string }> = {
  adapt: { title: "Adapt this selection", about: "A version matched to your reading level and language.", instructions: "Adapt the passage to my selected reading level while keeping its full meaning." },
  explain: { title: "Adapt this selection", about: "A version matched to your reading level and language.", instructions: "Adapt the passage to my selected reading level while keeping its full meaning." },
  quiz: { title: "Create a quiz", about: "Questions and answer explanations grounded in this passage.", instructions: "Quiz me on the main ideas and details in this passage." },
  translate: { title: "Translate this selection", about: "A translation of the text below into your chosen language.", instructions: "Preserve the meaning and technical terms." },
  pronunciation: { title: "Practice pronunciation", about: "Pronunciation guides and spoken examples for this selection.", instructions: "Help me pronounce the important names and terms." },
  video: { title: "Create an animated lesson", about: "A narrated Manim lesson that develops these ideas with diagrams, worked examples, and a recap.", instructions: "Build intuition, explain each important detail, show a worked example, and finish with a recap." },
}

export function AnnotationPreview({ action, image, initialText, defaultLanguage, defaultProficiency, onClose, onSubmit }: { action: Action; image?: string; initialText: string; defaultLanguage: string; defaultProficiency: ReadingProficiency; onClose: () => void; onSubmit: (draft: AnnotationDraft) => void }) {
  const description = descriptions[action]
  const [text, setText] = useState(image ? "" : initialText)
  const [topic, setTopic] = useState(image ? "" : initialText.split(/\n/).find((line) => line.trim().length > 4)?.trim().slice(0, 120) || "")
  const [instructions, setInstructions] = useState(description.instructions)
  const [language, setLanguage] = useState(defaultLanguage)
  const [ocrLanguage, setOcrLanguage] = useState("eng")
  const [detailed, setDetailed] = useState(true)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState(image ? "Reading the selected area…" : "Ready to review")
  const [reading, setReading] = useState(!!image)
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)
  const dirty = useRef(false)
  const topicDirty = useRef(false)
  useEffect(() => {
    if (!image) return
    let active = true
    let worker: Worker | undefined
    async function extract() {
      setReading(true); setError(""); setProgress(0)
      try {
        const { createWorker, PSM } = await import("tesseract.js")
        worker = await createWorker(ocrLanguage, 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr", workerBlobURL: false, logger: (message) => {
          if (active) { setProgress(Math.round((message.progress || 0) * 100)); setStatus(message.status === "recognizing text" ? "Extracting text from your selection…" : "Loading the OCR reader…") }
        } })
        if (!active) { await worker.terminate(); return }
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
        const { data } = await worker.recognize(image)
        if (!active) return
        const extracted = data.text.trim().slice(0, 12000)
        if (!dirty.current) setText(extracted)
        if (!topicDirty.current) setTopic(extracted.split(/\n/).find((line) => line.trim().length > 4)?.trim().slice(0, 120) || "")
        setStatus(extracted ? `Text extracted · ${Math.round(data.confidence)}% confidence` : "No text detected. Describe the diagram or enter the text below.")
      } catch { if (active) { setError("OCR could not read this image. Retry, change the text language, or enter the selected content yourself."); setStatus("Manual editing is available") } }
      finally { if (active) setReading(false); await worker?.terminate().catch(() => undefined) }
    }
    void extract()
    return () => { active = false; void worker?.terminate().catch(() => undefined) }
  }, [image, ocrLanguage, attempt])

  function retry() { dirty.current = false; setAttempt((value) => value + 1) }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className="reader-preview-dialog">
    <DialogHeader><DialogTitle>{description.title}</DialogTitle><DialogDescription>{description.about} Review and edit it before submitting.</DialogDescription><p className="text-xs text-muted-foreground">{defaultLanguage} · {proficiencyLevels.find((level) => level.value === defaultProficiency)?.label} reading level</p></DialogHeader>
    <form onSubmit={(event) => { event.preventDefault(); if (text.trim() && !reading) onSubmit({ text: text.trim(), topic: topic.trim(), instructions: instructions.trim(), language, detailed }) }} className="reader-preview-form">
      <div className="reader-preview-source">
        {image && <div className="reader-preview-image"><img src={image} alt="The selected area of your PDF" /></div>}
        <div className="reader-preview-editor">
          <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="ocr-source" className="text-xs font-medium">Selected content · editable</label>{image && <select aria-label="OCR text language" value={ocrLanguage} onChange={(event) => { dirty.current = false; setOcrLanguage(event.target.value) }} className="reader-language-select">{languages.map((item) => <option key={item.ocr} value={item.ocr}>{item.name}</option>)}</select>}</div>
          <Textarea id="ocr-source" dir="auto" value={text} maxLength={12000} onChange={(event) => { dirty.current = true; setText(event.target.value) }} placeholder={reading ? "Extracting text…" : "Enter or correct the content of your selection…"} className="reader-preview-text" />
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span role="status" className="flex items-center gap-2">{reading ? <Spinner className="size-3" /> : <RiScanLine className="size-3" />}{status}</span>{image && !reading && <button type="button" onClick={retry} className="inline-flex items-center gap-1"><RiRestartLine className="size-3" />Read again</button>}</div>
          {reading && <Progress value={progress} className="mt-2" />}
          {error && <p className="mt-2 text-xs text-destructive" role="alert">{error}</p>}
        </div>
      </div>
      <label className="grid gap-2 text-xs font-medium">What should it be about?<Input value={topic} onChange={(event) => { topicDirty.current = true; setTopic(event.target.value) }} maxLength={200} placeholder="The main idea or topic you want to focus on" /></label>
      <label className="grid gap-2 text-xs font-medium">Your instructions<Textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={1500} className="min-h-20" placeholder="Choose a focus, audience, or level of detail…" /></label>
      <div className="flex flex-wrap items-center justify-between gap-4">
        {(action === "translate" || action === "video") && <label className="flex items-center gap-2 text-xs text-muted-foreground">{action === "video" ? "Narration language" : "Translate into"}<select aria-label={action === "video" ? "Narration language" : "Translation language"} value={language} onChange={(event) => setLanguage(event.target.value)} className="reader-language-select">{languages.map((item) => <option key={item.code}>{item.name}</option>)}</select></label>}
        {action === "video" && <label className="flex items-center gap-2 text-xs text-muted-foreground">Lesson length<select aria-label="Video detail" value={detailed ? "detailed" : "short"} onChange={(event) => setDetailed(event.target.value === "detailed")} className="reader-language-select"><option value="detailed">Detailed · 6–8 scenes</option><option value="short">Quick · 3–4 scenes</option></select></label>}
      </div>
      <div className="reader-preview-submit"><p>Only this reviewed selection will be used as the source.</p><Button type="submit" disabled={reading || !text.trim()}>Submit &amp; generate<RiArrowRightLine className="size-4" /></Button></div>
    </form>
  </DialogContent></Dialog>
}
