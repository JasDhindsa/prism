"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from "react"
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist"
import {
  RiArrowLeftLine, RiCheckLine, RiCloseLine, RiCropLine,
  RiLayoutLeftLine, RiMicLine, RiSearchLine, RiSendPlane2Line, RiSparklingLine,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ButtonGroup } from "@/components/ui/button-group"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea } from "@/components/ui/input-group"
import { Message, MessageContent, MessageHeader } from "@/components/ui/message"
import { MessageScroller, MessageScrollerContent, MessageScrollerItem, MessageScrollerProvider, MessageScrollerViewport } from "@/components/ui/message-scroller"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { getLibraryPdf, saveLibraryPdf, type LibraryPdf } from "@/lib/library"
import "./reader.css"

type Rect = { x: number; y: number; width: number; height: number }
type Selection = { page: number; text: string; rects: Rect[]; image?: string }
type Kind = "quiz" | "adaptation" | "translation" | "pronunciation" | "highlight"
type Annotation = { id: string; kind: Kind; title: string; text: string; createdAt: number; page: number; quote?: string; rects?: Rect[] }
type Action = "ask" | "explain" | "quiz" | "translate" | "pronunciation"
type Result = { page: number; snippet: string }

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

function PdfPage({ pdf, number, zoom, areaEnabled, onSelect, onError }: { pdf: PDFDocumentProxy; number: number; zoom: number; areaEnabled: boolean; onSelect: (selection: Selection) => void; onError: (message: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(800)
  const [dimensions, setDimensions] = useState({ width: 800, height: 1060 })
  const [drag, setDrag] = useState<Rect | null>(null)
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
    </div>
  </div>
}

function LazyPdfPage({ pdf, number, zoom, areaEnabled, scrollRoot, onSelect, onError }: { pdf: PDFDocumentProxy; number: number; zoom: number; areaEnabled: boolean; scrollRoot: React.RefObject<HTMLDivElement | null>; onSelect: (selection: Selection) => void; onError: (message: string) => void }) {
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
    {visible ? <PdfPage pdf={pdf} number={number} zoom={zoom} areaEnabled={areaEnabled} onSelect={onSelect} onError={onError} /> : <div className="reader-page-placeholder" style={height ? { minHeight: Math.max(300, height - 28) } : undefined} aria-hidden="true" />}
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
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [prompt, setPrompt] = useState("")
  const [answer, setAnswer] = useState("")
  const [busy, setBusy] = useState(false)
  const [listening, setListening] = useState(false)
  const recognition = useRef<{ start: () => void; stop: () => void } | null>(null)
  const stage = useRef<HTMLDivElement>(null)

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
      if (Array.isArray(saved)) queueMicrotask(() => { if (active) setAnnotations(saved) })
    } catch { /* Invalid saved notes should not block reading. */ }
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
      if (event.key === "Escape") { setSelection(null); setAssistantOpen(false); setAreaEnabled(false) }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") { event.preventDefault(); setSearchOpen(true) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [goToPage, page])

  function saveAnnotation(annotation: Annotation) {
    const next = [annotation, ...annotations]
    try { localStorage.setItem(`prism-annotations:${id}`, JSON.stringify(next)); setAnnotations(next) }
    catch { setError("This annotation could not be saved. Browser storage may be full.") }
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

  async function askAi(action: Action) {
    if (!selection && !prompt.trim()) { setError("Select a passage or ask a question first."); return }
    setBusy(true); setError(""); setAnswer(""); setAssistantOpen(true)
    try {
      const pageText = pdf ? (await (await pdf.getPage(selection?.page ?? page)).getTextContent()).items.map((item) => "str" in item ? item.str : "").join(" ").slice(0, 10000) : ""
      const response = await fetch("/api/reader", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, selection: selection?.text ?? "", image: selection?.image, context: pageText, prompt }) })
      const data = await response.json() as { answer?: string; error?: string }
      if (!response.ok || !data.answer) throw new Error(data.error || "The AI did not respond.")
      setAnswer(data.answer)
      if (selection && action !== "ask") {
        const kind: Kind = action === "explain" ? "adaptation" : action === "translate" ? "translation" : action
        saveAnnotation({ id: crypto.randomUUID(), kind, title: `${action === "explain" ? "Explanation" : action[0].toUpperCase() + action.slice(1)} · Page ${selection.page}`, text: data.answer, page: selection.page, quote: selection.text, rects: selection.rects, createdAt: Date.now() })
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The AI request failed.") }
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

    <div className="reader-body">
      {sidebar && pdf && <aside className="reader-sidebar" aria-label="Page thumbnails">
        <div className="reader-sidebar-top"><span>Pages</span><span>{pdf.numPages}</span></div>
        <ScrollArea className="reader-thumbnails">{Array.from({ length: pdf.numPages }, (_, index) => <Thumbnail key={index + 1} pdf={pdf} number={index + 1} active={page === index + 1} onClick={() => goToPage(index + 1)} />)}</ScrollArea>
      </aside>}

      <div className="reader-workspace">
        {searchOpen && <div className="reader-search">
          <form onSubmit={searchPdf} className="flex items-center gap-1"><InputGroup className="flex-1 bg-transparent"><InputGroupAddon><RiSearchLine className="size-4" /></InputGroupAddon><InputGroupInput autoFocus value={search} onChange={(event) => { setSearch(event.target.value); setSearched(false); setResults([]) }} placeholder="Search this PDF" aria-label="Search this PDF" /></InputGroup><Button type="submit" size="sm" disabled={searching}>{searching ? "Searching…" : "Search"}</Button><IconButton label="Close search" onClick={() => setSearchOpen(false)}><RiCloseLine className="size-4" /></IconButton></form>
          {results.length > 0 && <ScrollArea className="reader-search-results">{results.map((result) => <Button key={result.page} variant="ghost" className="reader-search-result" onClick={() => { goToPage(result.page); setSearchOpen(false) }}><strong>Page {result.page}</strong><span>{result.snippet}</span></Button>)}</ScrollArea>}
          {!searching && search.trim() && results.length === 0 && <p className="reader-search-empty">{searched ? "No matches found." : "Press Search to find matching pages."}</p>}
        </div>}
        <div ref={stage} className="reader-stage">
          {loading ? <div className="reader-loading"><Skeleton className="h-[65vh] w-full max-w-3xl rounded-sm" /></div> : !pdf ? <div className="reader-error"><h1>Couldn’t open this PDF</h1><p>{error || "This book is no longer in your library."}</p><Link href={`/books/${encodeURIComponent(id)}`}>Back to book</Link></div> : <div className="reader-pages">
            {Array.from({ length: pdf.numPages }, (_, index) => <LazyPdfPage key={index + 1} pdf={pdf} number={index + 1} zoom={zoom} areaEnabled={areaEnabled} scrollRoot={stage} onSelect={(value) => { setSelection(value); setAreaEnabled(false); setAssistantOpen(true); setAnswer(""); setError("") }} onError={setError} />)}
          </div>}
        </div>
        {areaEnabled && <p className="reader-area-hint">Drag over a page to select an area <span>· Esc to cancel</span></p>}
        {pdf && <div className="reader-page-indicator">Page {page} <span>/ {pdf.numPages}</span></div>}
        {error && !assistantOpen && pdf && <p role="alert" className="reader-global-error">{error}</p>}
      </div>

      {assistantOpen && <Card size="sm" className="reader-assistant gap-0 p-0 ring-0" role="complementary" aria-label="Prism AI assistant">
        <CardHeader className="reader-assistant-head"><div className="flex items-center gap-2"><span className="reader-ai-mark"><RiSparklingLine className="size-4" /></span><div><strong>Prism AI</strong><span>Reading companion</span></div></div><IconButton label="Close assistant" onClick={() => setAssistantOpen(false)}><RiCloseLine className="size-4" /></IconButton></CardHeader>
        <CardContent className="reader-assistant-body">
          {selection ? <div className="reader-selection"><span>SELECTED AREA · PAGE {selection.page}</span><p>Selected area of this page</p><IconButton label="Clear selection" className="reader-selection-clear" onClick={() => setSelection(null)}><RiCloseLine className="size-4" /></IconButton></div> : !answer && !busy && <p className="reader-assistant-intro">Ask about this page, or select an area for a closer look.</p>}
          {selection && <ButtonGroup className="reader-quick-actions"><Button variant="ghost" size="sm" onClick={() => void askAi("explain")}>Explain</Button><Button variant="ghost" size="sm" onClick={() => void askAi("quiz")}>Quiz me</Button><Button variant="ghost" size="sm" onClick={() => void askAi("translate")}>Translate</Button><Button variant="ghost" size="sm" onClick={() => void askAi("pronunciation")}>Pronounce</Button></ButtonGroup>}
          {(busy || answer || error) && <MessageScrollerProvider autoScroll><MessageScroller className="reader-messages"><MessageScrollerViewport className="reader-messages-viewport"><MessageScrollerContent className="min-h-0 gap-3">
            {busy && <MessageScrollerItem messageId="thinking"><div className="reader-ai-thinking"><Spinner /> Reading your selection…</div></MessageScrollerItem>}
            {answer && <MessageScrollerItem messageId="answer" scrollAnchor><Message><MessageContent><MessageHeader className="px-0"><RiCheckLine className="mr-1 size-4" /> Prism</MessageHeader><Bubble variant="muted" className="max-w-full"><BubbleContent className="w-full whitespace-pre-wrap rounded-xl">{answer}</BubbleContent></Bubble></MessageContent></Message></MessageScrollerItem>}
            {error && <MessageScrollerItem messageId="error" scrollAnchor><Alert variant="destructive" className="border-0 p-3"><AlertDescription>{error}</AlertDescription></Alert></MessageScrollerItem>}
          </MessageScrollerContent></MessageScrollerViewport></MessageScroller></MessageScrollerProvider>}
        </CardContent>
        <form onSubmit={(event) => { event.preventDefault(); void askAi("ask") }}><InputGroup className="reader-prompt"><InputGroupTextarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask about this page…" aria-label="Ask Prism AI" className="min-h-12 px-3" /><InputGroupAddon align="block-end" className="justify-between pt-0 pb-1.5"><InputGroupText className="text-[11px]">{selection ? `Page ${selection.page} attached` : `Page ${page} context`}</InputGroupText><InputGroupButton size="icon-sm" aria-label="Send question" type="submit" disabled={busy || (!prompt.trim() && !selection)}><RiSendPlane2Line className="size-4" /></InputGroupButton></InputGroupAddon></InputGroup></form>
      </Card>}
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
