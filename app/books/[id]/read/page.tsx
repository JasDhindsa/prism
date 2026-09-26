"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react"
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist"
import {
  RiArrowLeftLine, RiArrowUpLine, RiCloseLine, RiCropLine,
  RiLayoutLeftLine, RiMicLine, RiResetLeftLine, RiSearchLine, RiSparklingLine, RiMessage2Line,
} from "@remixicon/react"
import { AnnotationCard } from "./annotation-card"
import { AnnotationTypeIcon } from "@/components/annotation-type-icon"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ButtonGroup } from "@/components/ui/button-group"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group"
import { Message, MessageContent } from "@/components/ui/message"
import { MessageScroller, MessageScrollerButton, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { getLibraryPdf, saveLibraryPdf, type LibraryPdf } from "@/lib/library"
import { getDemoAnnotations, getMockQuiz, getMockReaderAnswer, getMockVideo, type AnnotationRect, type ReaderAction, type ReaderAnnotation } from "@/lib/mock-annotations"
import "./reader.css"

type Selection = { page: number; text: string; rects: AnnotationRect[]; image?: string }
type Result = { page: number; snippet: string }
type ChatMessage = { id: string; role: "user" | "assistant"; text: string }

function IconButton({ label, className = "", children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return <Button variant="ghost" size="icon-sm" aria-label={label} title={label} className={`reader-icon ${className}`} {...props}>{children}</Button>
}

function Thumbnail({ pdf, number, active, onClick }: { pdf: PDFDocumentProxy; number: number; active: boolean; onClick: () => void }) {
  const root = useRef<HTMLButtonElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const target = root.current
    if (!target) return
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) setVisible(true) }, { rootMargin: "350px" })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible || !canvas.current) return
    let cancelled = false
    let task: ReturnType<PDFPageProxy["render"]> | undefined
    pdf.getPage(number).then((page) => {
      if (cancelled || !canvas.current) return
      const viewport = page.getViewport({ scale: 132 / page.getViewport({ scale: 1 }).width })
      const context = canvas.current.getContext("2d")
      if (!context) return
      canvas.current.width = Math.ceil(viewport.width)
      canvas.current.height = Math.ceil(viewport.height)
      task = page.render({ canvas: canvas.current, canvasContext: context, viewport })
      void task.promise.catch(() => undefined)
    }).catch(() => undefined)
    return () => { cancelled = true; task?.cancel() }
  }, [pdf, number, visible])
  useEffect(() => { if (active) root.current?.scrollIntoView({ block: "nearest" }) }, [active])
  return <button ref={root} type="button" className={`reader-thumb ${active ? "reader-thumb-active" : ""}`} aria-label={`Go to page ${number}`} aria-current={active ? "page" : undefined} onClick={onClick}>
    <span className="reader-thumb-paper"><canvas ref={canvas} /></span><span className="reader-thumb-number">{number}</span>
  </button>
}

function PdfPage({ pdf, number, zoom, areaEnabled, selection, annotations, openAnnotationId, onSelect, onClearSelection, onSelectionAction, onOpenAnnotation, onCloseAnnotation, onDeleteAnnotation, onError }: { pdf: PDFDocumentProxy; number: number; zoom: number; areaEnabled: boolean; selection: Selection | null; annotations: ReaderAnnotation[]; openAnnotationId: string | null; onSelect: (selection: Selection) => void; onClearSelection: () => void; onSelectionAction: (action: Exclude<ReaderAction, "ask">) => void; onOpenAnnotation: (annotation: ReaderAnnotation) => void; onCloseAnnotation: (id: string) => void; onDeleteAnnotation: (annotation: ReaderAnnotation) => void; onError: (message: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(800)
  const [dimensions, setDimensions] = useState({ width: 800, height: 1060 })
  const [drag, setDrag] = useState<AnnotationRect | null>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const target = wrap.current
    if (!target) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.min(920, entry.contentRect.width - 32))))
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    let renderTask: ReturnType<PDFPageProxy["render"]> | undefined
    async function render() {
      const page = await pdf.getPage(number)
      if (cancelled || !canvas.current) return
      const viewport = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * zoom })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const target = canvas.current
      const context = target.getContext("2d")
      if (!context) return
      target.width = Math.floor(viewport.width * ratio)
      target.height = Math.floor(viewport.height * ratio)
      target.style.width = `${viewport.width}px`
      target.style.height = `${viewport.height}px`
      setDimensions({ width: viewport.width, height: viewport.height })
      renderTask = page.render({ canvas: target, canvasContext: context, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      await renderTask.promise
    }
    void render().catch((error: unknown) => { if (!cancelled && (error as Error)?.name !== "RenderingCancelledException") onError("This PDF page could not be rendered.") })
    return () => { cancelled = true; renderTask?.cancel() }
  }, [pdf, number, width, zoom, onError])

  function point(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
  }

  function finishArea(event: PointerEvent<HTMLDivElement>) {
    if (!dragStart.current || !canvas.current) return
    const end = point(event)
    const start = dragStart.current
    dragStart.current = null
    setDrag(null)
    const rect = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) }
    if (rect.width < 0.015 || rect.height < 0.015) return
    const crop = document.createElement("canvas")
    const source = canvas.current
    const factor = Math.min(1, 1200 / Math.max(source.width * rect.width, source.height * rect.height))
    crop.width = Math.max(1, Math.round(source.width * rect.width * factor))
    crop.height = Math.max(1, Math.round(source.height * rect.height * factor))
    crop.getContext("2d")?.drawImage(source, source.width * rect.x, source.height * rect.y, source.width * rect.width, source.height * rect.height, 0, 0, crop.width, crop.height)
    onSelect({ page: number, text: "Selected area of the PDF", rects: [rect], image: crop.toDataURL("image/jpeg", 0.78) })
  }

  return <div ref={wrap} className="reader-page-wrap">
    <div className="reader-page" style={{ width: dimensions.width, height: dimensions.height }}>
      <canvas ref={canvas} className="reader-page-canvas" />
      {areaEnabled && <div className="reader-area-layer" aria-label="Drag to select an area" onPointerDown={(event) => { dragStart.current = point(event); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => { if (!dragStart.current) return; const end = point(event), start = dragStart.current; setDrag({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) }) }} onPointerUp={finishArea} onPointerCancel={() => { dragStart.current = null; setDrag(null) }}>
        {drag && <span className="reader-area-rect" style={{ left: `${drag.x * 100}%`, top: `${drag.y * 100}%`, width: `${drag.width * 100}%`, height: `${drag.height * 100}%` }} />}
      </div>}
      {!areaEnabled && selection?.page === number && selection.rects.map((rect, index) => <span key={index} className="reader-area-selected" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />)}
      {!areaEnabled && selection?.page === number && <div className="reader-selection-menu" style={{ left: Math.max(8, Math.min(dimensions.width - 400, selection.rects[0].x * dimensions.width)), top: Math.max(8, Math.min(dimensions.height - 44, (selection.rects[0].y + selection.rects[0].height) * dimensions.height + 10)) }}>
        <ButtonGroup aria-label="Create annotation"><Button variant="ghost" size="sm" onClick={() => onSelectionAction("explain")}>Explain</Button><Button variant="ghost" size="sm" onClick={() => onSelectionAction("quiz")}>Quiz</Button><Button variant="ghost" size="sm" onClick={() => onSelectionAction("translate")}>Translate</Button><Button variant="ghost" size="sm" onClick={() => onSelectionAction("pronunciation")}>Pronounce</Button><Button variant="ghost" size="sm" onClick={() => onSelectionAction("video")}>Video</Button><IconButton label="Clear selection" onClick={onClearSelection}><RiCloseLine className="size-4" /></IconButton></ButtonGroup>
      </div>}
      {!areaEnabled && annotations.filter((annotation) => annotation.page === number && annotation.rects?.length).map((annotation) => {
        const rect = annotation.rects![0]
        const isOpen = openAnnotationId === annotation.id
        return <Popover key={annotation.id} open={isOpen} onOpenChange={(open, details) => { if (open) onOpenAnnotation(annotation); else if (["trigger-press", "escape-key", "close-press"].includes(details.reason)) onCloseAnnotation(annotation.id) }}>
          <PopoverTrigger render={<Button size="icon-xs" variant="secondary" className="reader-note-pin" style={{ left: `${Math.min(96, (rect.x + rect.width) * 100)}%`, top: `${Math.min(96, (rect.y + rect.height / 2) * 100)}%` }} aria-label={`Open ${annotation.kind}: ${annotation.title}`} title={`${annotation.kind}: ${annotation.title}`} aria-pressed={isOpen}><AnnotationTypeIcon kind={annotation.kind} className="size-3" /></Button>} />
          <PopoverContent side="right" align="start" sideOffset={14} className="reader-note-popover">
            <AnnotationCard annotation={annotation} progressKey={`prism-quiz-progress:${pdf.fingerprints[0]}:${annotation.id}`} onClose={() => onCloseAnnotation(annotation.id)} onDelete={() => onDeleteAnnotation(annotation)} />
          </PopoverContent>
        </Popover>
      })}
    </div>
  </div>
}

function LazyPdfPage({ pdf, number, zoom, areaEnabled, selection, annotations, openAnnotationId, scrollRoot, onSelect, onClearSelection, onSelectionAction, onOpenAnnotation, onCloseAnnotation, onDeleteAnnotation, onError }: { pdf: PDFDocumentProxy; number: number; zoom: number; areaEnabled: boolean; selection: Selection | null; annotations: ReaderAnnotation[]; openAnnotationId: string | null; scrollRoot: React.RefObject<HTMLDivElement | null>; onSelect: (selection: Selection) => void; onClearSelection: () => void; onSelectionAction: (action: Exclude<ReaderAction, "ask">) => void; onOpenAnnotation: (annotation: ReaderAnnotation) => void; onCloseAnnotation: (id: string) => void; onDeleteAnnotation: (annotation: ReaderAnnotation) => void; onError: (message: string) => void }) {
  const section = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(number <= 2)
  const [height, setHeight] = useState<number | null>(null)

  useEffect(() => {
    const target = section.current
    if (!target) return
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { root: scrollRoot.current, rootMargin: "900px 0px" })
    observer.observe(target)
    return () => observer.disconnect()
  }, [scrollRoot])

  useEffect(() => {
    const target = section.current
    if (!visible || !target) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 200) setHeight(entry.contentRect.height)
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [visible])

  return <section ref={section} id={`reader-page-${number}`} data-page-number={number} className="reader-page-section" style={!visible && height ? { minHeight: height } : undefined} aria-label={`Page ${number}`}>
    {visible || annotations.some((annotation) => annotation.page === number && annotation.id === openAnnotationId) ? <PdfPage pdf={pdf} number={number} zoom={zoom} areaEnabled={areaEnabled} selection={selection} annotations={annotations} openAnnotationId={openAnnotationId} onSelect={onSelect} onClearSelection={onClearSelection} onSelectionAction={onSelectionAction} onOpenAnnotation={onOpenAnnotation} onCloseAnnotation={onCloseAnnotation} onDeleteAnnotation={onDeleteAnnotation} onError={onError} /> : <div className="reader-page-placeholder" style={height ? { minHeight: Math.max(300, height - 28) } : undefined} aria-hidden="true" />}
    <span className="reader-page-caption">{number}</span>
  </section>
}

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>()
  const [book, setBook] = useState<LibraryPdf | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [sidebar, setSidebar] = useState(false)
  const [areaEnabled, setAreaEnabled] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [savedAnnotations, setSavedAnnotations] = useState<ReaderAnnotation[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [openAnnotationId, setOpenAnnotationId] = useState<string | null>(null)
  const [hiddenDemoIds, setHiddenDemoIds] = useState<string[]>([])
  const [prompt, setPrompt] = useState("")
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatError, setChatError] = useState("")
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const recognition = useRef<{ start: () => void; stop: () => void } | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const annotations = useMemo(() => [...savedAnnotations, ...getDemoAnnotations(book?.title ?? "", pdf?.numPages).filter((annotation) => !hiddenDemoIds.includes(annotation.id))], [savedAnnotations, hiddenDemoIds, book?.title, pdf?.numPages])

  useEffect(() => {
    let active = true
    let loadingTask: PDFDocumentLoadingTask | undefined
    async function open() {
      const result = await getLibraryPdf(id)
      if (!result || !active) { if (active) setLoading(false); return }
      setBook(result)
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist")
      GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
      const bytes = new Uint8Array(await result.file.arrayBuffer())
      loadingTask = getDocument({ data: bytes })
      const loaded = await loadingTask.promise
      if (!active) { await loadingTask.destroy(); return }
      setPdf(loaded)
      const updated = { ...result, lastOpenedAt: Date.now() }
      void saveLibraryPdf(updated).catch(() => undefined)
      setLoading(false)
    }
    void open().catch(() => { if (active) { setError("This PDF could not be opened. Try an unencrypted PDF."); setLoading(false) } })
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(`prism-annotations:${id}`) ?? "[]")
      if (Array.isArray(saved)) queueMicrotask(() => { if (active) setSavedAnnotations(saved as ReaderAnnotation[]) })
    } catch { /* Invalid saved notes should not block reading. */ }
    try {
      const hidden: unknown = JSON.parse(localStorage.getItem(`prism-hidden-demo-annotations:${id}`) ?? "[]")
      if (Array.isArray(hidden)) queueMicrotask(() => { if (active) setHiddenDemoIds(hidden as string[]) })
    } catch { /* Invalid preview state should not block reading. */ }
    return () => { active = false; void loadingTask?.destroy() }
  }, [id])

  const goToPage = useCallback((number: number) => {
    if (!pdf) return
    const target = Math.max(1, Math.min(pdf.numPages, number))
    setPage(target)
    setSelection(null)
    setAreaEnabled(false)
    document.getElementById(`reader-page-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [pdf])

  useEffect(() => {
    const container = stage.current
    if (!pdf || !container) return
    let frame = 0
    function updateCurrentPage() {
      if (!container) return
      const anchor = container.getBoundingClientRect().top + Math.min(220, container.clientHeight * 0.35)
      let current = 1
      for (const element of container.querySelectorAll<HTMLElement>("[data-page-number]")) {
        if (element.getBoundingClientRect().top > anchor) break
        current = Number(element.dataset.pageNumber)
      }
      setPage((previous) => previous === current ? previous : current)
    }
    function onScroll() { cancelAnimationFrame(frame); frame = requestAnimationFrame(updateCurrentPage) }
    container.addEventListener("scroll", onScroll, { passive: true })
    return () => { container.removeEventListener("scroll", onScroll); cancelAnimationFrame(frame) }
  }, [pdf])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return
      if (event.key === "ArrowRight") goToPage(page + 1)
      if (event.key === "ArrowLeft") goToPage(page - 1)
      if (event.key === "Escape") { setSelection(null); setAssistantOpen(false); setAreaEnabled(false); setOpenAnnotationId(null) }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") { event.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goToPage, page])

  function saveAnnotation(annotation: ReaderAnnotation) {
    const next = [annotation, ...savedAnnotations]
    try { localStorage.setItem(`prism-annotations:${id}`, JSON.stringify(next)); setSavedAnnotations(next); setOpenAnnotationId(annotation.id) }
    catch { setError("This annotation could not be saved. Browser storage may be full.") }
  }

  function openAnnotation(annotation: ReaderAnnotation) {
    setOpenAnnotationId(annotation.id)
    setAssistantOpen(false)
  }

  function closeAnnotation(annotationId: string) {
    setOpenAnnotationId((current) => current === annotationId ? null : current)
  }

  function deleteAnnotation(annotation: ReaderAnnotation) {
    try {
      if (annotation.id.startsWith("demo-columbian-")) {
        const next = [...hiddenDemoIds, annotation.id]
        localStorage.setItem(`prism-hidden-demo-annotations:${id}`, JSON.stringify(next))
        setHiddenDemoIds(next)
      } else {
        const next = savedAnnotations.filter((item) => item.id !== annotation.id)
        localStorage.setItem(`prism-annotations:${id}`, JSON.stringify(next))
        setSavedAnnotations(next)
      }
      closeAnnotation(annotation.id)
    } catch { setError("This annotation could not be deleted. Browser storage may be unavailable.") }
  }

  async function searchPdf(event: FormEvent) {
    event.preventDefault()
    if (!pdf || !search.trim()) { setResults([]); setSearched(false); return }
    setSearching(true)
    setSearched(false)
    const query = search.trim().toLocaleLowerCase()
    const found: Result[] = []
    try {
      for (let number = 1; number <= pdf.numPages; number++) {
        const text = (await (await pdf.getPage(number)).getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ")
        const index = text.toLocaleLowerCase().indexOf(query)
        if (index !== -1) found.push({ page: number, snippet: text.slice(Math.max(0, index - 48), Math.min(text.length, index + query.length + 88)).trim() })
        if (found.length >= 50) break
      }
      setResults(found)
    } catch { setError("Search could not read this PDF.") }
    finally { setSearching(false); setSearched(true) }
  }

  async function createAnnotation(action: Exclude<ReaderAction, "ask">) {
    if (!selection) return
    const selected = selection
    setBusy(true); setError("")
    try {
      const pageText = pdf ? (await (await pdf.getPage(selected.page)).getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ").slice(0, 10000) : ""
      const mockAnswer = getMockReaderAnswer({ action, title: book?.title ?? "this PDF", page: selected.page, context: pageText, prompt: "" })
      const kind = action === "explain" ? "adaptation" : action === "translate" ? "translation" : action
      const title = { explain: "In simpler terms", quiz: "Check your understanding", translate: "Translated passage", pronunciation: "How to say it", video: "See it in motion" }[action]
      saveAnnotation({ id: crypto.randomUUID(), kind, title, text: mockAnswer, page: selected.page, quote: selected.text, rects: selected.rects, quiz: action === "quiz" ? getMockQuiz(book?.title ?? "", selected.page) : undefined, video: action === "video" ? getMockVideo(book?.title ?? "", selected.page) : undefined, createdAt: Date.now(), demo: true })
      setSelection(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The annotation could not be created.") }
    finally { setBusy(false) }
  }

  async function askAi() {
    const question = prompt.trim()
    if (!question || busy) return
    setBusy(true); setChatError(""); setPrompt(""); setAssistantOpen(true)
    setChatMessages((messages) => [...messages, { id: crypto.randomUUID(), role: "user", text: question }])
    try {
      const pageText = pdf ? (await (await pdf.getPage(page)).getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ").slice(0, 10000) : ""
      const answer = getMockReaderAnswer({ action: "ask", title: book?.title ?? "this PDF", page, context: pageText, prompt: question })
      setChatMessages((messages) => [...messages, { id: crypto.randomUUID(), role: "assistant", text: answer }])
    } catch (caught) { setChatError(caught instanceof Error ? caught.message : "The question could not be answered.") }
    finally { setBusy(false) }
  }

  function toggleMic() {
    if (listening) { recognition.current?.stop(); setListening(false); return }
    const SpeechRecognition = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition
    if (!SpeechRecognition) { setError("Voice input is not available in this browser."); return }
    const instance = new SpeechRecognition()
    instance.lang = navigator.language || "en-US"
    instance.onresult = (event) => { setPrompt(event.results[0][0].transcript); setAssistantOpen(true) }
    instance.onerror = () => { setListening(false); setError("The microphone could not capture your question.") }
    instance.onend = () => setListening(false)
    recognition.current = instance
    instance.start()
    setListening(true)
  }

  return <main className="reader-shell">
    <header className="reader-topbar">
      <div className="reader-document-title">
        <Link href={`/books/${encodeURIComponent(id)}`} aria-label="Back to book" className="reader-back"><RiArrowLeftLine className="size-5" /></Link>
        <div className="min-w-0"><strong className="block truncate">{book?.title || "Opening PDF…"}</strong><span>{pdf ? `${pdf.numPages} pages` : "Your document"}</span></div>
      </div>
      <ButtonGroup className="reader-toolbar" aria-label="Reader tools">
        <Button variant={sidebar ? "secondary" : "ghost"} size="icon-sm" className="reader-tool-button" aria-label="Toggle page thumbnails" title="Pages" aria-pressed={sidebar} onClick={() => setSidebar((value) => !value)}><RiLayoutLeftLine className="size-[18px]" /></Button>
        <Button variant={searchOpen ? "secondary" : "ghost"} size="icon-sm" className="reader-tool-button" aria-label="Search PDF" title="Search" aria-pressed={searchOpen} onClick={() => setSearchOpen((value) => !value)}><RiSearchLine className="size-[18px]" /></Button>
        <Button variant={areaEnabled ? "secondary" : "ghost"} size="icon-sm" className="reader-tool-button" aria-label="Select an area" title="Select area" aria-pressed={areaEnabled} onClick={() => setAreaEnabled((value) => !value)}><RiCropLine className="size-[18px]" /></Button>
        <Button variant={listening ? "secondary" : "ghost"} size="icon-sm" className="reader-tool-button" aria-label={listening ? "Stop microphone" : "Ask by voice"} title={listening ? "Stop microphone" : "Voice"} aria-pressed={listening} onClick={toggleMic}><RiMicLine className="size-[18px]" /></Button>
        <Button variant={assistantOpen ? "secondary" : "ghost"} size="icon-sm" className="reader-tool-button reader-ai-toggle" aria-label="Ask Prism AI" title="Ask Prism" aria-pressed={assistantOpen} onClick={() => setAssistantOpen((value) => !value)}><RiSparklingLine className="size-[18px]" /></Button>
      </ButtonGroup>
      <ButtonGroup className="reader-zoom"><Button variant="ghost" size="icon-sm" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 0.7} onClick={() => setZoom((value) => Math.max(0.7, +(value - 0.1).toFixed(1)))}>−</Button><Button variant="ghost" size="sm" className="reader-fit-button" aria-label={zoom === 1 ? "Fit to available width" : `${Math.round(zoom * 100)} percent of fit width. Reset to fit.`} title="Fit to width" onClick={() => setZoom(1)}>{zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}</Button><Button variant="ghost" size="icon-sm" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 1.6} onClick={() => setZoom((value) => Math.min(1.6, +(value + 0.1).toFixed(1)))}>+</Button></ButtonGroup>
    </header>

    <Sheet open={sidebar} onOpenChange={setSidebar}><SheetContent side="left" showCloseButton className="reader-pages-sheet"><SheetHeader className="reader-pages-sheet-head"><SheetTitle>Pages</SheetTitle><span>{pdf?.numPages ?? 0}</span></SheetHeader>{pdf && <ScrollArea className="reader-thumbnails">{Array.from({ length: pdf.numPages }, (_, index) => <Thumbnail key={index + 1} pdf={pdf} number={index + 1} active={page === index + 1} onClick={() => { setSidebar(false); goToPage(index + 1) }} />)}</ScrollArea>}</SheetContent></Sheet>

    <div className="reader-body">
      <div className="reader-workspace">
        {searchOpen && <div className="reader-search" role="search" aria-label="Search this PDF">
          <form onSubmit={searchPdf} className="reader-search-form">
            <RiSearchLine className="reader-search-icon" aria-hidden="true" />
            <input autoFocus value={search} onChange={(event) => { setSearch(event.target.value); setSearched(false); setResults([]) }} placeholder="Find in document" aria-label="Search this PDF" />
            <button type="submit" className="reader-search-submit" disabled={searching || !search.trim()}>{searching ? "Finding…" : "Find"}</button>
            <button type="button" className="reader-search-close" onClick={() => setSearchOpen(false)} aria-label="Close search"><RiCloseLine className="size-4" /></button>
          </form>
          {results.length > 0 && <><div className="reader-search-meta">{results.length} {results.length === 1 ? "page" : "pages"} found</div><div className="reader-search-results">{results.map((result) => <Button key={result.page} variant="ghost" className="reader-search-result" onClick={() => { goToPage(result.page); setSearchOpen(false) }}><strong>Page {result.page}</strong><span>{result.snippet}</span></Button>)}</div></>}
          {!searching && searched && results.length === 0 && <p className="reader-search-empty">No matches found.</p>}
        </div>}
        <div ref={stage} className="reader-stage">
          {loading ? <div className="reader-loading"><Skeleton className="h-[65vh] w-full max-w-3xl rounded-sm" /></div> : !pdf ? <div className="reader-error"><h1>Couldn’t open this PDF</h1><p>{error || "This book is no longer in your library."}</p><Link href={`/books/${encodeURIComponent(id)}`}>Back to book</Link></div> : <div className="reader-pages">
            {Array.from({ length: pdf.numPages }, (_, index) => <LazyPdfPage key={index + 1} pdf={pdf} number={index + 1} zoom={zoom} areaEnabled={areaEnabled} selection={selection} annotations={annotations} openAnnotationId={openAnnotationId} scrollRoot={stage} onSelect={(value) => { setSelection(value); setAreaEnabled(false); setError("") }} onClearSelection={() => setSelection(null)} onSelectionAction={(action) => void createAnnotation(action)} onOpenAnnotation={openAnnotation} onCloseAnnotation={closeAnnotation} onDeleteAnnotation={deleteAnnotation} onError={setError} />)}
          </div>}
        </div>
        {areaEnabled && <p className="reader-area-hint">Drag over a page to select an area <span>· Esc to cancel</span></p>}
        {pdf && <div className="reader-page-indicator">Page {page} <span>/ {pdf.numPages}</span></div>}
        {error && !assistantOpen && pdf && <p role="alert" className="reader-global-error">{error}</p>}
      </div>

      {assistantOpen && <MessageScrollerProvider autoScroll>
        <Card className="reader-assistant gap-0" role="complementary" aria-label="Prism AI assistant">
          <CardHeader className="gap-1 border-b">
            <CardTitle>Prism AI</CardTitle>
            <CardDescription>How can I help with this page?</CardDescription>
            <CardAction className="flex gap-2">
              <Button variant="outline" size="icon" aria-label="Reset conversation" title="Reset conversation" onClick={() => { setChatMessages([]); setChatError("") }} disabled={busy || chatMessages.length === 0}><RiResetLeftLine /></Button>
              <Button variant="outline" size="icon" aria-label="Close assistant" title="Close assistant" onClick={() => setAssistantOpen(false)}><RiCloseLine /></Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex-1 overflow-hidden p-0">
            {chatMessages.length === 0 && !busy && !chatError ? <Empty className="h-full">
              <EmptyHeader>
                <EmptyMedia variant="icon"><RiMessage2Line /></EmptyMedia>
                <EmptyTitle>Start a conversation</EmptyTitle>
                <EmptyDescription>Ask a question about the page you’re reading.</EmptyDescription>
              </EmptyHeader>
            </Empty> : <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent aria-busy={busy} className="p-(--card-spacing)">
                  {chatMessages.map((message) => <MessageScrollerItem key={message.id} messageId={message.id} scrollAnchor={message.role === "user"}>
                    <Message align={message.role === "user" ? "end" : "start"}><MessageContent><Bubble variant={message.role === "user" ? "default" : "muted"}><BubbleContent className="whitespace-pre-wrap">{message.text}</BubbleContent></Bubble></MessageContent></Message>
                  </MessageScrollerItem>)}
                  {busy && <MessageScrollerItem messageId="thinking"><Spinner /></MessageScrollerItem>}
                  {chatError && <MessageScrollerItem messageId="error"><Alert variant="destructive"><AlertDescription>{chatError}</AlertDescription></Alert></MessageScrollerItem>}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>}
          </CardContent>
          <CardFooter className="flex-col gap-2">
            <form onSubmit={(event) => { event.preventDefault(); void askAi() }} className="w-full">
              <InputGroup>
                <InputGroupTextarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask about this page…" aria-label="Ask Prism AI" className="min-h-14 px-3" />
                <InputGroupAddon align="block-end" className="pt-1">
                  <InputGroupButton type="submit" variant="default" size="icon-sm" disabled={busy || !prompt.trim()} className="ml-auto" aria-label="Send question"><RiArrowUpLine /></InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          </CardFooter>
        </Card>
      </MessageScrollerProvider>}
    </div>
  </main>
}

type SpeechRecognitionLike = {
  lang: string
  onresult: ((event: { results: { 0: { 0: { transcript: string } } } }) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
