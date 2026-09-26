"use client"
import { useEffect, useRef, useState } from "react"
import { RiArrowRightLine, RiScanLine, RiRestartLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { languages } from "@/lib/languages"
import type { ReaderAction } from "@/lib/reader-types"
import { proficiencyLevels, type ReadingProficiency } from "@/lib/reader-preferences"
import type { Worker } from "tesseract.js"

export type AnnotationDraft = { text: string; topic: string; instructions: string; language: string; detailed: boolean }
type Action = Exclude<ReaderAction, "ask">
const descriptions: Record<Action, { title: string; about: string; instructions: string }> = {
  adapt: { title: "Adapt this selection", about: "A version in your chosen AI language and response depth.", instructions: "Adapt the passage to my selected response depth while keeping its full meaning." },
  explain: { title: "Adapt this selection", about: "A version in your chosen AI language and response depth.", instructions: "Adapt the passage to my selected response depth while keeping its full meaning." },
  quiz: { title: "Create a quiz", about: "Questions and answer explanations grounded in this passage.", instructions: "Quiz me on the main ideas and details in this passage." },
  translate: { title: "Translate this selection", about: "A translation of the text below into your chosen language.", instructions: "Preserve the meaning and technical terms." },
  pronunciation: { title: "Practice pronunciation", about: "Pronunciation guides and spoken examples for this selection.", instructions: "Help me pronounce the important names and terms." },
  video: { title: "Create an animated lesson", about: "A narrated Manim lesson that develops these ideas with diagrams, worked examples, and a recap.", instructions: "Build intuition, explain each important detail, show a worked example, and finish with a recap." },
}

export function AnnotationPreview({ action, image, initialText, defaultLanguage, defaultProficiency, onClose, onSubmit }: { action: Action; image?: string; initialText: string; defaultLanguage: string; defaultProficiency: ReadingProficiency; onClose: () => void; onSubmit: (draft: AnnotationDraft) => void }) {
  const description = descriptions[action]
  const [text, setText] = useState(image ? "" : initialText)
  const [topic, setTopic] = useState("")
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
  useEffect(() => {
    const sourceImage = image
    if (!sourceImage) return
    let active = true
    let worker: Worker | undefined
    async function extract(source: string) {
      setReading(true); setError(""); setProgress(0)
      try {
        const { createWorker, PSM } = await import("tesseract.js")
        worker = await createWorker(ocrLanguage, 1, { workerPath: "/ocr/worker.min.js", corePath: "/ocr", workerBlobURL: false, logger: (message) => {
          if (active) { setProgress(Math.round((message.progress || 0) * 100)); setStatus(message.status === "recognizing text" ? "Extracting text from your selection…" : "Loading the OCR reader…") }
        } })
        if (!active) { await worker.terminate(); return }
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
        const { data } = await worker.recognize(source)
        if (!active) return
        const extracted = data.text.trim().slice(0, 12000)
        if (!dirty.current) setText(extracted)
        setStatus(extracted ? `Text extracted · ${Math.round(data.confidence)}% confidence` : "No text detected. Describe the diagram or enter the text below.")
      } catch { if (active) { setError("OCR could not read this image. Retry, change the text language, or enter the selected content yourself."); setStatus("Manual editing is available") } }
      finally { if (active) setReading(false); await worker?.terminate().catch(() => undefined) }
    }
    void extract(sourceImage)
    return () => { active = false; void worker?.terminate().catch(() => undefined) }
  }, [image, ocrLanguage, attempt])

  function retry() { dirty.current = false; setAttempt((value) => value + 1) }
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}><DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
    <DialogHeader><DialogTitle>{description.title}</DialogTitle><DialogDescription>{description.about} Review and edit it before submitting.</DialogDescription><p className="text-xs text-muted-foreground">AI output: {language} · Depth: {proficiencyLevels.find((level) => level.value === defaultProficiency)?.label}</p></DialogHeader>
    <form onSubmit={(event) => { event.preventDefault(); if (text.trim() && !reading) onSubmit({ text: text.trim(), topic: topic.trim(), instructions: instructions.trim(), language, detailed }) }} className="grid gap-6">
      <div className={image ? "grid gap-4 md:grid-cols-2" : "grid gap-4"}>
        {image && <div className="flex min-h-40 items-center justify-center overflow-hidden rounded-2xl border p-4"><img src={image} alt="The selected area of your PDF" className="max-h-64 max-w-full object-contain" /></div>}
        <Field className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel htmlFor="ocr-source">Selected content · editable</FieldLabel>
            {image && <Select value={ocrLanguage} items={languages.map((item) => ({ value: item.ocr, label: item.name }))} onValueChange={(value) => { if (typeof value === "string") { dirty.current = false; setOcrLanguage(value) } }}>
              <SelectTrigger size="sm" aria-label="OCR text language"><SelectValue /></SelectTrigger>
              <SelectContent>{languages.map((item) => <SelectItem key={item.ocr} value={item.ocr}>{item.name}</SelectItem>)}</SelectContent>
            </Select>}
          </div>
          <Textarea id="ocr-source" dir="auto" value={text} maxLength={12000} onChange={(event) => { dirty.current = true; setText(event.target.value) }} placeholder={reading ? "Extracting text…" : "Enter or correct the content of your selection…"} className="h-48 min-h-0 resize-none overflow-y-auto field-sizing-fixed" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldDescription role="status" className="flex items-center gap-2">{reading ? <Spinner className="size-4" /> : <RiScanLine className="size-4" />}{status}</FieldDescription>
            {image && !reading && <Button type="button" variant="ghost" size="sm" onClick={retry}><RiRestartLine />Read again</Button>}
          </div>
          {reading && <Progress value={progress} />}
          {error && <FieldError>{error}</FieldError>}
        </Field>
      </div>
      <Field><FieldLabel htmlFor="annotation-topic">Focus (optional)</FieldLabel><Input id="annotation-topic" value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={200} placeholder="A question or idea to emphasize" /><FieldDescription>Leave blank to cover the full selection.</FieldDescription></Field>
      <Field><FieldLabel htmlFor="annotation-instructions">Your instructions</FieldLabel><Textarea id="annotation-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={1500} className="min-h-20 resize-y" placeholder="Choose a focus, audience, or level of detail…" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {(action === "translate" || action === "video") && <Field>
          <FieldLabel htmlFor="annotation-language">{action === "video" ? "Narration language" : "Translate into"}</FieldLabel>
          <Select value={language} items={languages.map((item) => ({ value: item.name, label: item.name }))} onValueChange={(value) => { if (typeof value === "string") setLanguage(value) }}>
            <SelectTrigger id="annotation-language"><SelectValue /></SelectTrigger>
            <SelectContent>{languages.map((item) => <SelectItem key={item.code} value={item.name}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
        </Field>}
        {action === "video" && <Field>
          <FieldLabel htmlFor="annotation-length">Lesson length</FieldLabel>
          <Select value={detailed ? "detailed" : "short"} items={[{ value: "detailed", label: "Detailed · 6–8 scenes" }, { value: "short", label: "Quick · 3–4 scenes" }]} onValueChange={(value) => setDetailed(value === "detailed")}>
            <SelectTrigger id="annotation-length"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="detailed">Detailed · 6–8 scenes</SelectItem><SelectItem value="short">Quick · 3–4 scenes</SelectItem></SelectContent>
          </Select>
        </Field>}
      </div>
      <Separator />
      <DialogFooter className="items-center sm:justify-between"><p className="text-sm text-muted-foreground">{action === "video" ? "This selection is the focus; relevant passages from this PDF add context." : "Only this reviewed selection will be used as the source."}</p><Button type="submit" disabled={reading || !text.trim()}>Submit &amp; generate<RiArrowRightLine className="size-4" /></Button></DialogFooter>
    </form>
  </DialogContent></Dialog>
}
