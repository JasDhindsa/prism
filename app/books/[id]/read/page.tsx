"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from "react"
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist"
import {
  RiArrowLeftLine, RiArrowUpLine, RiCloseLine, RiCropLine,
  RiLayoutLeftLine, RiMicLine, RiResetLeftLine, RiSearchLine, RiSparklingLine, RiMessage2Line,
  RiCursorLine, RiEraserLine, RiMarkPenLine, RiPencilLine, RiStickyNoteLine, RiArrowGoBackLine,
} from "@remixicon/react"
import { MarkupLayer, type MarkupTool, type PageMarkup } from "./markup-layer"
import { AnnotationCard } from "./annotation-card"
import { AnnotationTypeIcon } from "@/components/annotation-type-icon"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ButtonGroup } from "@/components/ui/button-group"
import { Kbd } from "@/components/ui/kbd"
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useLibraryStore } from "@/lib/library-store"
import { readPdfPageText } from "@/lib/pdf-text"
import { retrieveDocumentPassages } from "@/lib/document-retrieval"
import type { AnnotationRect, ReaderAction, ReaderAnnotation, ReaderInput, ReaderResponse } from "@/lib/reader-types"
import { SpeechPlayer } from "@/components/speech-player"
import { MarkdownMessage } from "@/components/markdown-message"
import { AnnotationPreview, type AnnotationDraft } from "@/components/annotation-preview"
import { VoiceConversation } from "@/components/voice-conversation"
import { useVoiceConversation, type VoiceContext } from "@/hooks/use-voice-conversation"
import { languages, speechLanguageCode } from "@/lib/languages"
import { proficiencyLevels, isReadingProficiency, type ReadingProficiency } from "@/lib/reader-preferences"
import { readSelectionImage } from "@/lib/selection-ocr"
import { SelectionSpeech } from "@/components/selection-speech"
import { useSelectionSpeech } from "@/hooks/use-selection-speech"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import "./reader.css"

type Selection = { page: number; text: string; rects: AnnotationRect[]; image?: string }
type Result = { page: number; snippet: string }
type ChatMessage = { id: string; role: "user" | "assistant"; text: string; speechText?: string; voice?: boolean }
type SpeechPlayer = ReturnType<typeof useSelectionSpeech>

const annotationColors = ["#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#0ea5e9", "#f97316", "#14b8a6", "#6366f1", "#f43f5e", "#84cc16"] as const
const annotationColor = (index?: number) => annotationColors[index ?? 0] ?? annotationColors[0]
const markupColors = ["#facc15", "#fb7185", "#60a5fa", "#4ade80", "#a78bfa"] as const

function restoreAnnotationColors(annotations: ReaderAnnotation[]): ReaderAnnotation[] {
  const ordered = [...annotations].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id))
  const assigned = new Map<string, number>()
  const usedByPage = new Map<number, Set<number>>()
  for (const annotation of ordered) {
    const used = usedByPage.get(annotation.page) ?? new Set<number>()
    const available = annotationColors.findIndex((_, index) => !used.has(index))
    const colorIndex = Number.isInteger(annotation.colorIndex) && annotation.colorIndex! >= 0 && annotation.colorIndex! < annotationColors.length
      ? annotation.colorIndex!
      : available >= 0 ? available : assigned.size % annotationColors.length
    assigned.set(annotation.id, colorIndex)
    used.add(colorIndex)
    usedByPage.set(annotation.page, used)
  }
  return annotations.map((annotation) => ({ ...annotation, colorIndex: assigned.get(annotation.id) }))
}

function IconButton({ label, className = "", children, ...props }: React.ComponentProps<typeof Button> & { label: string }) {
  return <Button variant="ghost" size="icon-sm" aria-label={label} title={label} className={`reader-icon ${className}`} {...props}>{children}</Button>
}

function ReaderToolButton({ label, shortcut, className = "", children, ...props }: React.ComponentProps<typeof Button> & { label: string; shortcut: string }) {
  return <Tooltip>
    <TooltipTrigger render={<Button variant="ghost" size="icon-sm" className={`reader-tool-button ${className}`} aria-label={label} aria-keyshortcuts={shortcut.toLowerCase()} {...props} />}>{children}</TooltipTrigger>
    <TooltipContent side="bottom">{label}<Kbd>{shortcut}</Kbd></TooltipContent>
  </Tooltip>
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

// Place pins in page pixels so their spacing survives zoom and narrow screens.
function layoutAnnotationPins(annotations: ReaderAnnotation[], width: number, height: number) {
  const occupied: { x: number; y: number }[] = []
  const margin = 16, spacing = 32
  const grid: { x: number; y: number }[] = []
  for (let y = margin; y <= height - margin; y += spacing) {
    for (let x = margin; x <= width - margin; x += spacing) grid.push({ x, y })
  }
  return [...annotations].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id)).map((annotation) => {
    const rect = annotation.rects![0]
    const target = { x: (rect.x + rect.width) * width, y: (rect.y + rect.height / 2) * height }
    const preferred = { x: Math.max(margin, Math.min(width - margin, target.x + 18)), y: Math.max(margin, Math.min(height - margin, target.y)) }
    const available = (point: { x: number; y: number }) => occupied.every((other) => Math.hypot(point.x - other.x, point.y - other.y) >= spacing)
    const distance = (point: { x: number; y: number }) => (point.x - preferred.x) ** 2 + (point.y - preferred.y) ** 2
    const position = available(preferred) ? preferred : grid.filter(available).sort((a, b) => distance(a) - distance(b))[0]
    // A completely full page keeps the source outline accessible without stacking pins.
    if (!position) return { annotation, target, position: undefined }
    occupied.push(position)
    return { annotation, target, position }
  })
}

function PdfPage({ pdf, number, zoom, areaEnabled, selection, annotations, markups, markupTool, markupColor, openMarkupNoteId, onAddMarkup, onUpdateMarkup, onDeleteMarkup, onOpenMarkupNote, openAnnotationId, audioAnnotationId, speechPlayer, onSelect, onClearSelection, onSelectionAction, onOpenAnnotation, onCloseAnnotation, onDeleteAnnotation, onSpeakAnnotation, onError }: { pdf: PDFDocumentProxy; number: number; zoom: number; areaEnabled: boolean; selection: Selection | null; annotations: ReaderAnnotation[]; markups: PageMarkup[]; markupTool: MarkupTool; markupColor: string; openMarkupNoteId: string | null; onAddMarkup: (mark: PageMarkup) => void; onUpdateMarkup: (mark: PageMarkup) => void; onDeleteMarkup: (id: string) => void; onOpenMarkupNote: (id: string | null) => void; openAnnotationId: string | null; audioAnnotationId: string | null; speechPlayer: SpeechPlayer; onSelect: (selection: Selection) => void; onClearSelection: () => void; onSelectionAction: (action: Exclude<ReaderAction, "ask">) => void; onOpenAnnotation: (annotation: ReaderAnnotation) => void; onCloseAnnotation: (id: string) => void; onDeleteAnnotation: (annotation: ReaderAnnotation) => void; onSpeakAnnotation: (annotation: ReaderAnnotation) => void; onError: (message: string) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(800)
  const [dimensions, setDimensions] = useState({ width: 800, height: 1060 })
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null)
  const pins = useMemo(() => layoutAnnotationPins(annotations.filter((annotation) => annotation.page === number && annotation.rects?.length), dimensions.width, dimensions.height), [annotations, number, dimensions.width, dimensions.height])
  const activeAnnotationId = hoveredAnnotationId || openAnnotationId
  const sourceAreas = new Map<string, { rect: AnnotationRect; active: boolean; color: string }>()
  for (const { annotation } of pins) for (const rect of annotation.rects || []) {
    const key = `${rect.x}:${rect.y}:${rect.width}:${rect.height}`
    const active = annotation.id === activeAnnotationId
    if (!sourceAreas.get(key)?.active || active) sourceAreas.set(key, { rect, active, color: annotationColor(annotation.colorIndex) })
  }
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
    const factor = Math.min(2, 2000 / Math.max(source.width * rect.width, source.height * rect.height))
    crop.width = Math.max(1, Math.round(source.width * rect.width * factor))
    crop.height = Math.max(1, Math.round(source.height * rect.height * factor))
    crop.getContext("2d")?.drawImage(source, source.width * rect.x, source.height * rect.y, source.width * rect.width, source.height * rect.height, 0, 0, crop.width, crop.height)
    onSelect({ page: number, text: "Selected area of the PDF", rects: [rect], image: crop.toDataURL("image/jpeg", 0.9) })
  }

  return <div ref={wrap} className="reader-page-wrap">
    <div className="reader-page" style={{ width: dimensions.width, height: dimensions.height }}>
      <canvas ref={canvas} className="reader-page-canvas" />
      {!areaEnabled && <MarkupLayer page={number} width={dimensions.width} height={dimensions.height} tool={markupTool} color={markupColor} marks={markups} openNoteId={openMarkupNoteId} onAdd={onAddMarkup} onUpdate={onUpdateMarkup} onDelete={onDeleteMarkup} onOpenNote={onOpenMarkupNote} />}
      {areaEnabled && <div className="reader-area-layer" aria-label="Drag to select an area" onPointerDown={(event) => { dragStart.current = point(event); event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={(event) => { if (!dragStart.current) return; const end = point(event), start = dragStart.current; setDrag({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) }) }} onPointerUp={finishArea} onPointerCancel={() => { dragStart.current = null; setDrag(null) }}>
        {drag && <span className="reader-area-rect" style={{ left: `${drag.x * 100}%`, top: `${drag.y * 100}%`, width: `${drag.width * 100}%`, height: `${drag.height * 100}%` }} />}
      </div>}
      {!areaEnabled && selection?.page === number && selection.rects.map((rect, index) => <span key={index} className="reader-area-selected" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }} />)}
      {!areaEnabled && selection?.page === number && <div className="reader-selection-menu" style={{ left: Math.max(8, Math.min(dimensions.width - 400, selection.rects[0].x * dimensions.width)), top: Math.max(8, Math.min(dimensions.height - 44, (selection.rects[0].y + selection.rects[0].height) * dimensions.height + 10)) }}>
        <ButtonGroup aria-label="Create annotation"><Button variant="ghost" size="sm" onClick={() => onSelectionAction("adapt")}>Adapt</Button><Button variant="ghost" size="sm" onClick={() => onSelectionAction("quiz")}>Quiz</Button><Button variant="ghost" size="sm" onClick={() => onSelectionAction("translate")}>Translate</Button><Button variant="ghost" size="sm" onClick={() => onSelectionAction("pronunciation")}>Pronounce</Button><Button variant="ghost" size="sm" onClick={() => onSelectionAction("video")}>Video</Button><IconButton label="Clear selection" onClick={onClearSelection}><RiCloseLine className="size-4" /></IconButton></ButtonGroup>
      </div>}
      {!areaEnabled && <svg className="reader-annotation-targets" width={dimensions.width} height={dimensions.height} aria-hidden="true">
        {[...sourceAreas].map(([key, { rect, active, color }]) => <rect key={key} className={active ? "reader-annotation-area reader-annotation-area-active" : "reader-annotation-area"} style={{ "--annotation-color": color } as React.CSSProperties} x={rect.x * dimensions.width} y={rect.y * dimensions.height} width={rect.width * dimensions.width} height={rect.height * dimensions.height} rx={3} />)}
        {pins.map(({ annotation, position, target }) => position && <path key={annotation.id} className={annotation.id === activeAnnotationId ? "reader-annotation-link reader-annotation-link-active" : "reader-annotation-link"} style={{ "--annotation-color": annotationColor(annotation.colorIndex) } as React.CSSProperties} d={`M ${target.x} ${target.y} L ${position.x} ${position.y}`} />)}
      </svg>}
      {!areaEnabled && pins.map(({ annotation, position }) => {
        if (!position) return null
        const isOpen = openAnnotationId === annotation.id
        return <Popover key={annotation.id} open={isOpen} onOpenChange={(open, details) => { if (open) onOpenAnnotation(annotation); else if (["trigger-press", "escape-key", "close-press"].includes(details.reason)) onCloseAnnotation(annotation.id) }}>
          <PopoverTrigger render={<Button size="icon-xs" variant="secondary" className="reader-note-pin" data-annotation-id={annotation.id} style={{ left: position.x, top: position.y, "--annotation-color": annotationColor(annotation.colorIndex) } as React.CSSProperties} aria-label={`Open ${annotation.kind}: ${annotation.title}, selected area on page ${number}`} title={`${annotation.kind}: ${annotation.title}`} aria-pressed={isOpen} onPointerEnter={() => setHoveredAnnotationId(annotation.id)} onPointerLeave={() => setHoveredAnnotationId(null)} onFocus={() => setHoveredAnnotationId(annotation.id)} onBlur={() => setHoveredAnnotationId(null)}><AnnotationTypeIcon kind={annotation.kind} className="size-3" /></Button>} />
          <PopoverContent side="right" align="start" sideOffset={14} className="reader-note-popover">
            <AnnotationCard annotation={annotation} progressKey={`prism-quiz-progress:${pdf.fingerprints[0]}:${annotation.id}`} onClose={() => onCloseAnnotation(annotation.id)} onDelete={() => onDeleteAnnotation(annotation)} onSpeak={() => onSpeakAnnotation(annotation)} pronunciationPlayer={audioAnnotationId === annotation.id ? speechPlayer : undefined} />
          </PopoverContent>
        </Popover>
      })}
    </div>
  </div>
}

function LazyPdfPage({ pdf, number, zoom, areaEnabled, selection, annotations, markups, markupTool, markupColor, openMarkupNoteId, onAddMarkup, onUpdateMarkup, onDeleteMarkup, onOpenMarkupNote, openAnnotationId, audioAnnotationId, speechPlayer, scrollRoot, onSelect, onClearSelection, onSelectionAction, onOpenAnnotation, onCloseAnnotation, onDeleteAnnotation, onSpeakAnnotation, onError }: { pdf: PDFDocumentProxy; number: number; zoom: number; areaEnabled: boolean; selection: Selection | null; annotations: ReaderAnnotation[]; markups: PageMarkup[]; markupTool: MarkupTool; markupColor: string; openMarkupNoteId: string | null; onAddMarkup: (mark: PageMarkup) => void; onUpdateMarkup: (mark: PageMarkup) => void; onDeleteMarkup: (id: string) => void; onOpenMarkupNote: (id: string | null) => void; openAnnotationId: string | null; audioAnnotationId: string | null; speechPlayer: SpeechPlayer; scrollRoot: React.RefObject<HTMLDivElement | null>; onSelect: (selection: Selection) => void; onClearSelection: () => void; onSelectionAction: (action: Exclude<ReaderAction, "ask">) => void; onOpenAnnotation: (annotation: ReaderAnnotation) => void; onCloseAnnotation: (id: string) => void; onDeleteAnnotation: (annotation: ReaderAnnotation) => void; onSpeakAnnotation: (annotation: ReaderAnnotation) => void; onError: (message: string) => void }) {
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
    {visible || annotations.some((annotation) => annotation.page === number && annotation.id === openAnnotationId) || markups.some((mark) => mark.id === openMarkupNoteId) ? <PdfPage pdf={pdf} number={number} zoom={zoom} areaEnabled={areaEnabled} selection={selection} annotations={annotations} markups={markups} markupTool={markupTool} markupColor={markupColor} openMarkupNoteId={openMarkupNoteId} onAddMarkup={onAddMarkup} onUpdateMarkup={onUpdateMarkup} onDeleteMarkup={onDeleteMarkup} onOpenMarkupNote={onOpenMarkupNote} openAnnotationId={openAnnotationId} audioAnnotationId={audioAnnotationId} speechPlayer={speechPlayer} onSelect={onSelect} onClearSelection={onClearSelection} onSelectionAction={onSelectionAction} onOpenAnnotation={onOpenAnnotation} onCloseAnnotation={onCloseAnnotation} onDeleteAnnotation={onDeleteAnnotation} onSpeakAnnotation={onSpeakAnnotation} onError={onError} /> : <div className="reader-page-placeholder" style={height ? { minHeight: Math.max(300, height - 28) } : undefined} aria-hidden="true" />}
    <span className="reader-page-caption">{number}</span>
  </section>
}

export default function ReaderPage() {
  const { id } = useParams<{ id: string }>()
  const book = useLibraryStore((state) => state.books[id] ?? null)
  const loadBook = useLibraryStore((state) => state.loadOne)
  const saveBook = useLibraryStore((state) => state.save)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const [error, setError] = useState("")
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [sidebar, setSidebar] = useState(false)
  const [areaEnabled, setAreaEnabled] = useState(false)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [savedAnnotations, setSavedAnnotations] = useState<ReaderAnnotation[]>([])
  const [markups, setMarkups] = useState<PageMarkup[]>([])
  const [markupTool, setMarkupTool] = useState<MarkupTool>("cursor")
  const [markupColor, setMarkupColor] = useState<string>(markupColors[0])
  const [openMarkupNoteId, setOpenMarkupNoteId] = useState<string | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [openAnnotationId, setOpenAnnotationId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState("")
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatError, setChatError] = useState("")
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [busyLabel, setBusyLabel] = useState("")
  const [language, setLanguage] = useState("English")
  const [proficiency, setProficiency] = useState<ReadingProficiency>("intermediate")
  const [preferencesReady, setPreferencesReady] = useState(false)
  const selectionSpeech = useSelectionSpeech()
  const [audioAnnotationId, setAudioAnnotationId] = useState<string | null>(null)
  const directController = useRef<AbortController | null>(null)
  const [pendingAnnotation, setPendingAnnotation] = useState<{ action: Exclude<ReaderAction, "ask">; selection: Selection } | null>(null)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const voiceHistory = useRef<ChatMessage[]>([])
  const chatHistory = useRef<ChatMessage[]>([])
  const voice = useVoiceConversation({
    language: speechLanguageCode(language) || "auto",
    proficiency,
    contextKey: `${id}:${page}:${language}:${proficiency}:${selection?.page || ""}:${selection?.text || ""}:${selection?.rects?.map((rect) => `${rect.x},${rect.y},${rect.width},${rect.height}`).join(";") || ""}`,
    onTranscript: updateVoiceTranscript,
    getContext: getVoiceContext,
  })
  const voiceStop = useRef(voice.stop)
  useEffect(() => { voiceStop.current = voice.stop }, [voice.stop])
  const stage = useRef<HTMLDivElement>(null)
  const openedDeepLink = useRef<string | null>(null)
  const annotations = savedAnnotations

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      try {
        const saved = JSON.parse(localStorage.getItem("prism-reader-preferences") || "null") as { language?: string; proficiency?: string } | null
        if (saved?.language && languages.some((item) => item.name === saved.language)) setLanguage(saved.language)
        if (isReadingProficiency(saved?.proficiency)) setProficiency(saved.proficiency)
      } catch { /* Use defaults when stored preferences are unavailable. */ }
      setPreferencesReady(true)
    })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (preferencesReady) try { localStorage.setItem("prism-reader-preferences", JSON.stringify({ language, proficiency })) } catch { /* Preferences still apply in this session. */ }
  }, [language, proficiency, preferencesReady])
  useEffect(() => () => directController.current?.abort(), [])

  useEffect(() => {
    let active = true
    let loadingTask: PDFDocumentLoadingTask | undefined
    queueMicrotask(() => { if (active) { setPdf(null); setLoading(true); setError("") } })
    async function open() {
      const result = await loadBook(id, { fresh: true })
      if (!active) return
      if (!result) throw new Error("This book is no longer in your library.")
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist")
      if (!active) return
      GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
      let loaded: PDFDocumentProxy | undefined
      for (let attempt = 0; attempt < 2; attempt++) {
        const bytes = new Uint8Array(await result.file.arrayBuffer())
        if (!active) return
        loadingTask = getDocument({ data: bytes })
        try { loaded = await loadingTask.promise; break }
        catch (cause) {
          await loadingTask.destroy().catch(() => undefined)
          loadingTask = undefined
          if (!active) return
          if (attempt === 1) throw cause
        }
      }
      if (!loaded) return
      if (!active) { await loadingTask?.destroy(); return }
      setPdf(loaded)
      const updated = { ...result, lastOpenedAt: Date.now() }
      void saveBook(updated).catch(() => undefined)
      setLoading(false)
    }
    void open().catch((cause: unknown) => { if (active) { setError(cause instanceof Error ? cause.message : "This PDF could not be opened."); setLoading(false) } })
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(`prism-annotations:${id}`) ?? "[]")
      if (Array.isArray(saved)) {
        const realAnnotations = (saved as ReaderAnnotation[]).filter((annotation) => !annotation.id?.startsWith("demo-columbian-") && !("demo" in annotation && annotation.demo))
        const restored = restoreAnnotationColors(realAnnotations)
        if (realAnnotations.length !== saved.length || restored.some((annotation, index) => annotation.colorIndex !== realAnnotations[index].colorIndex)) {
          try { localStorage.setItem(`prism-annotations:${id}`, JSON.stringify(restored)) } catch { /* Keep colors stable for this session if storage is unavailable. */ }
        }
        queueMicrotask(() => { if (active) setSavedAnnotations(restored) })
      }
    } catch { /* Invalid saved notes should not block reading. */ }
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(`prism-markups:${id}`) ?? "[]")
      if (Array.isArray(saved)) queueMicrotask(() => { if (active) setMarkups(saved.filter((mark): mark is PageMarkup => !!mark && typeof mark === "object" && typeof mark.id === "string" && Number.isInteger(mark.page) && ["highlight", "pen", "note"].includes(mark.kind))) })
    } catch { /* Invalid markup data should not block reading. */ }
    return () => { active = false; void loadingTask?.destroy() }
  }, [id, loadBook, saveBook, reloadKey])

  useEffect(() => {
    if (!pdf || !stage.current) return
    const targetId = new URLSearchParams(window.location.search).get("annotation")
    if (!targetId || openedDeepLink.current === targetId) return
    const target = savedAnnotations.find((annotation) => annotation.id === targetId)
    if (!target) return

    const scrollWithinReader = (element: HTMLElement, offset: number) => {
      const container = stage.current
      if (!container) return
      const top = container.scrollTop + element.getBoundingClientRect().top - container.getBoundingClientRect().top - offset
      container.scrollTo({ top: Math.max(0, top), behavior: "auto" })
    }
    let frame = 0
    let attempts = 0
    const scrollToAnnotation = () => {
      const pin = Array.from(stage.current?.querySelectorAll<HTMLElement>("[data-annotation-id]") ?? [])
        .find((element) => element.dataset.annotationId === targetId)
      if (pin) {
        scrollWithinReader(pin, (stage.current?.clientHeight ?? 0) * 0.35)
        openedDeepLink.current = targetId
      } else if (++attempts < 30) {
        frame = requestAnimationFrame(scrollToAnnotation)
      } else {
        const section = stage.current?.querySelector<HTMLElement>(`#reader-page-${target.page}`)
        if (section) scrollWithinReader(section, 24)
        openedDeepLink.current = targetId
      }
    }
    frame = requestAnimationFrame(() => {
      window.scrollTo(0, 0)
      const section = stage.current?.querySelector<HTMLElement>(`#reader-page-${target.page}`)
      if (section) scrollWithinReader(section, 24)
      setPage(target.page)
      setAreaEnabled(false)
      setSelection(null)
      setOpenAnnotationId(target.id)
      frame = requestAnimationFrame(scrollToAnnotation)
    })
    return () => cancelAnimationFrame(frame)
  }, [pdf, savedAnnotations])

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

  function saveAnnotation(annotation: ReaderAnnotation, open = true): boolean {
    const usedOnPage = new Set(savedAnnotations.filter((item) => item.page === annotation.page).map((item) => item.colorIndex))
    const available = annotationColors.findIndex((_, index) => !usedOnPage.has(index))
    const colorIndex = available >= 0 ? available : (Math.max(-1, ...savedAnnotations.map((item) => item.colorIndex ?? -1)) + 1) % annotationColors.length
    const next = [{ ...annotation, colorIndex }, ...savedAnnotations]
    try { localStorage.setItem(`prism-annotations:${id}`, JSON.stringify(next)); setSavedAnnotations(next); if (open) setOpenAnnotationId(annotation.id); return true }
    catch { setError("This annotation could not be saved. Browser storage may be full."); return false }
  }

  function persistMarkups(next: PageMarkup[]) {
    try { localStorage.setItem(`prism-markups:${id}`, JSON.stringify(next)); setMarkups(next) }
    catch { setError("Your PDF marks could not be saved. Browser storage may be full.") }
  }

  function addMarkup(mark: PageMarkup) { persistMarkups([...markups, mark]) }
  function updateMarkup(mark: PageMarkup) { persistMarkups(markups.map((item) => item.id === mark.id ? mark : item)) }
  function deleteMarkup(markId: string) { persistMarkups(markups.filter((item) => item.id !== markId)); setOpenMarkupNoteId((current) => current === markId ? null : current) }
  function chooseMarkupTool(tool: MarkupTool) { setMarkupTool(tool); setAreaEnabled(false); setSelection(null); setOpenMarkupNoteId(null) }

  function openAnnotation(annotation: ReaderAnnotation) {
    voice.stop(); setVoiceOpen(false)
    if (audioAnnotationId && audioAnnotationId !== annotation.id) { selectionSpeech.close(); setAudioAnnotationId(null) }
    setOpenAnnotationId(annotation.id)
    setAssistantOpen(false)
  }

  function closeAnnotation(annotationId: string) {
    if (audioAnnotationId === annotationId) { selectionSpeech.close(); setAudioAnnotationId(null) }
    setOpenAnnotationId((current) => current === annotationId ? null : current)
  }

  function toggleAreaSelection() {
    if (!areaEnabled && openAnnotationId) closeAnnotation(openAnnotationId)
    if (!areaEnabled) { setMarkupTool("cursor"); setOpenMarkupNoteId(null) }
    setAreaEnabled(!areaEnabled)
  }

  function deleteAnnotation(annotation: ReaderAnnotation) {
    try {
      const next = savedAnnotations.filter((item) => item.id !== annotation.id)
      localStorage.setItem(`prism-annotations:${id}`, JSON.stringify(next))
      setSavedAnnotations(next)
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
        const text = await readPdfPageText(await pdf.getPage(number))
        const index = text.toLocaleLowerCase().indexOf(query)
        if (index !== -1) found.push({ page: number, snippet: text.slice(Math.max(0, index - 48), Math.min(text.length, index + query.length + 88)).trim() })
        if (found.length >= 50) break
      }
      setResults(found)
    } catch { setError("Search could not read this PDF.") }
    finally { setSearching(false); setSearched(true) }
  }

  async function pageImage(number: number) {
    if (!pdf) return undefined
    const pdfPage = await pdf.getPage(number)
    const viewport = pdfPage.getViewport({ scale: Math.min(1.5, 1400 / pdfPage.getViewport({ scale: 1 }).width) })
    const canvas = document.createElement("canvas")
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
    const context = canvas.getContext("2d")
    if (!context) return undefined
    await pdfPage.render({ canvas, canvasContext: context, viewport }).promise
    return canvas.toDataURL("image/jpeg", 0.8)
  }

  async function requestAi(input: ReaderInput, signal?: AbortSignal): Promise<ReaderResponse> {
    const response = await fetch("/api/reader", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, language: input.language || language, proficiency: input.proficiency || proficiency }), signal })
    const data = await response.json()
    if (!response.ok) throw new Error(data.error || "Prism could not complete this request.")
    return data as ReaderResponse
  }

  function appendChat(message: ChatMessage) {
    chatHistory.current = [...chatHistory.current, message]
    setChatMessages(chatHistory.current)
  }

  function prepareAnnotation(action: Exclude<ReaderAction, "ask">) {
    if (!selection || busyRef.current) return
    if (voice.active) voice.stop()
    setVoiceOpen(false)
    selectionSpeech.close()
    setAudioAnnotationId(null)
    setAssistantOpen(false); setError("")
    if (action === "video" || action === "quiz") setPendingAnnotation({ action, selection })
    else void createDirectAnnotation(action, selection)
  }

  async function createAnnotation(action: Exclude<ReaderAction, "ask">, selected: Selection, draft: AnnotationDraft) {
    if (busyRef.current) return
    busyRef.current = true
    setPendingAnnotation(null); setAssistantOpen(false)
    setBusy(true); setBusyLabel(action === "video" ? "Finding relevant passages in this PDF…" : "Generating from your reviewed selection…"); setError("")
    try {
      const documentPassages = action === "video" && pdf ? await retrieveDocumentPassages(pdf, draft.text, draft.topic, selected.page) : undefined
      if (action === "video") setBusyLabel("Planning your animated lesson…")
      const result = await requestAi({ action, selection: draft.text, context: action === "video" ? undefined : draft.text, documentPassages, image: selected.image, prompt: [draft.topic ? `Focus: ${draft.topic}` : "", draft.instructions].filter(Boolean).join("\n"), language: draft.language, sourceConfirmed: action !== "video" || !selected.image, detailed: draft.detailed })
      const kind = (action === "adapt" || action === "explain") ? "adaptation" : action === "translate" ? "translation" : action
      const title = result.title || draft.topic || { adapt: `Adapted · ${proficiencyLevels.find((level) => level.value === proficiency)?.label}`, explain: "Adapted passage", quiz: "Check your understanding", translate: `${draft.language} translation`, pronunciation: "How to say it", video: "See it in motion" }[action]
      if (saveAnnotation({ id: crypto.randomUUID(), kind, title, text: result.answer, page: selected.page, quote: draft.text, rects: selected.rects, quiz: result.quiz, speechText: result.speechText, language: draft.language, proficiency, video: result.video ? { jobId: result.video.id } : undefined, createdAt: Date.now() })) setSelection(null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The annotation could not be created.") }
    finally { busyRef.current = false; setBusy(false); setBusyLabel("") }
  }

  async function createDirectAnnotation(action: Exclude<ReaderAction, "ask" | "quiz" | "video">, selected: Selection) {
    if (busyRef.current) return
    busyRef.current = true
    const spoken = action === "pronunciation" || action === "translate"
    directController.current?.abort()
    const requestSignal = spoken ? selectionSpeech.begin(action === "translate" ? `Translation · ${language}` : "Pronunciation") : (directController.current = new AbortController()).signal
    setBusy(true); setBusyLabel("Reading your selection…"); setOpenAnnotationId(null); setError("")
    try {
      if (requestSignal.aborted) { if (action === "pronunciation") setError("This browser could not start audio playback."); return }
      const extracted = selected.image ? await readSelectionImage(selected.image, language, requestSignal, { fresh: true }) : selected.text
      if (requestSignal.aborted) return
      if (!extracted.trim()) throw new Error("No readable text was found in this area. Select a clearer passage and try again.")
      setBusyLabel(action === "adapt" || action === "explain" ? "Adapting the selected passage…" : action === "translate" ? `Translating into ${language}…` : "Preparing pronunciation…")
      const result: ReaderResponse = action === "pronunciation"
        ? { answer: extracted, speechText: extracted, title: "Pronunciation" }
        : await requestAi({ action, selection: extracted, sourceConfirmed: true }, requestSignal)
      if (requestSignal.aborted) return
      const adapted = action === "adapt" || action === "explain"
      const title = result.title || (adapted ? `Adapted · ${proficiencyLevels.find((level) => level.value === proficiency)?.label}` : action === "translate" ? `${language} translation` : "Pronunciation")
      const annotationId = crypto.randomUUID()
      if (action === "pronunciation") setAudioAnnotationId(annotationId)
      const saved = saveAnnotation({ id: annotationId, kind: adapted ? "adaptation" : action === "translate" ? "translation" : "pronunciation", title, text: action === "pronunciation" ? "" : result.answer, speechText: result.speechText || (action === "translate" ? result.answer : undefined), speechLanguage: action === "translate" ? speechLanguageCode(language) : result.speechLanguage, page: selected.page, language, proficiency, quote: extracted || undefined, rects: selected.rects, createdAt: Date.now() }, adapted || action === "pronunciation")
      if (!saved) { if (spoken) selectionSpeech.close(); if (action === "pronunciation") setAudioAnnotationId(null); return }
      setSelection(null)
      if (spoken) {
        setBusyLabel("Preparing audio…")
        await selectionSpeech.play(action === "translate" ? result.answer : result.speechText || extracted, action === "translate" ? speechLanguageCode(language) : result.speechLanguage, requestSignal)
      }
    } catch (caught) {
      if (!requestSignal.aborted) {
        const message = caught instanceof Error ? caught.message : "This selection could not be processed."
        if (spoken) { selectionSpeech.fail(message); if (action === "pronunciation") setError(message) }
        else setError(message)
      }
    } finally { busyRef.current = false; setBusy(false); setBusyLabel("") }
  }

  async function speakAnnotation(annotation: ReaderAnnotation) {
    if (busyRef.current) return
    voice.stop(); setVoiceOpen(false)
    if (annotation.kind === "pronunciation") {
      setOpenAnnotationId(annotation.id)
      if (audioAnnotationId === annotation.id && selectionSpeech.open && selectionSpeech.data.length && selectionSpeech.phase !== "error") { selectionSpeech.toggle(); return }
      setAudioAnnotationId(annotation.id)
    } else { setOpenAnnotationId(null); setAudioAnnotationId(null) }
    const text = annotation.kind === "pronunciation"
      ? annotation.quote || annotation.speechText || annotation.text
      : annotation.speechText || annotation.text
    const signal = selectionSpeech.begin(annotation.kind === "pronunciation" ? "Pronunciation" : annotation.kind === "translation" ? `Translation · ${annotation.language || language}` : "Read aloud")
    try {
      await selectionSpeech.play(text, annotation.kind === "pronunciation" ? annotation.speechLanguage : speechLanguageCode(annotation.language || language), signal)
    } catch (caught) {
      if (!signal.aborted) selectionSpeech.fail(caught instanceof Error ? caught.message : "Audio could not be played.")
    }
  }

  function updateVoiceTranscript(messageId: string, role: "user" | "assistant", text: string) {
    const existing = voiceHistory.current.findIndex((message) => message.id === messageId)
    const message: ChatMessage = { id: messageId, role, text, speechText: role === "assistant" ? text : undefined, voice: true }
    voiceHistory.current = existing === -1 ? [...voiceHistory.current, message] : voiceHistory.current.map((item, index) => index === existing ? message : item)
  }

  async function getVoiceContext(signal: AbortSignal): Promise<VoiceContext> {
    const selected = selection
    const number = selected?.page || page
    const pageText = !selected && pdf ? await readPdfPageText(await pdf.getPage(number), 6000).catch(() => "") : ""
    const image = selected?.image || (!selected && !pageText.trim() ? await pageImage(number) : undefined)
    if (signal.aborted) throw new DOMException("Conversation ended", "AbortError")
    return { text: selected ? `AI response language: ${language}. Response depth: ${proficiency}. Match this detail level in the response language and use relatable examples without assuming nationality.\nSelected area on page ${number}:\n${selected.image ? "Read the cropped image below." : selected.text}` : `AI response language: ${language}. Response depth: ${proficiency}. Match this detail level in the response language and use relatable examples without assuming nationality.\nPage ${number}:\n${pageText}`, image, history: voiceHistory.current.slice(-6).map(({ role, text }) => ({ role, text: text.slice(0, 2000) })) }
  }

  function toggleVoice() {
    if (voiceOpen) {
      if (voice.phase === "paused" || voice.phase === "idle") { void voice.start(); return }
      voice.stop(); setVoiceOpen(false); return
    }
    if (busyRef.current) return
    selectionSpeech.close()
    setVoiceOpen(true); setAssistantOpen(false); setOpenAnnotationId(null)
    void voice.start()
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.isComposing || event.repeat) return
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      if (target instanceof Element && target.closest('[contenteditable="true"], [role="dialog"], [role="listbox"], [role="option"], [data-slot="select-content"]')) return
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f") {
        event.preventDefault()
        event.stopPropagation()
        setSearchOpen(true)
        return
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const key = event.key.toLowerCase()
      if (!["p", "/", "s", "v", "a"].includes(key)) {
        if (target instanceof Element && target.closest('[data-slot="select-trigger"], button, a')) return
        if (event.key === "ArrowRight") goToPage(page + 1)
        if (event.key === "ArrowLeft") goToPage(page - 1)
        if (event.key === "Escape") { voiceStop.current(); setVoiceOpen(false); setSelection(null); setAssistantOpen(false); setAreaEnabled(false); setMarkupTool("cursor"); setOpenMarkupNoteId(null); setOpenAnnotationId(null) }
        return
      }
      event.preventDefault()
      event.stopPropagation()
      switch (key) {
        case "p": setSidebar((value) => !value); break
        case "/": setSearchOpen((value) => !value); break
        case "s": toggleAreaSelection(); break
        case "v": if (!busyRef.current) toggleVoice(); break
        case "a": voice.stop(); setVoiceOpen(false); setAssistantOpen((value) => !value); break
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  })

  async function askAi() {
    const question = prompt.trim()
    if (!question || busyRef.current || voice.active) return
    busyRef.current = true
    setBusy(true); setBusyLabel("Thinking…"); setChatError(""); setPrompt(""); setAssistantOpen(true)
    appendChat({ id: crypto.randomUUID(), role: "user", text: question })
    try {
      const selected = selection
      const number = selected?.page || page
      const pageText = pdf ? await readPdfPageText(await pdf.getPage(number), 10000).catch(() => "") : ""
      const image = selected?.image || await pageImage(number)
      const result = await requestAi({ action: "ask", prompt: question, context: selected?.image ? undefined : pageText, selection: selected && !selected.image ? selected.text : undefined, image, history: chatHistory.current.slice(0, -1).slice(-10).map(({ role, text }) => ({ role, text: text.slice(0, 6000) })) })
      appendChat({ id: crypto.randomUUID(), role: "assistant", text: result.answer })
    } catch (caught) { setPrompt(question); setChatError(caught instanceof Error ? caught.message : "The question could not be answered.") }
    finally { busyRef.current = false; setBusy(false); setBusyLabel("") }
  }

  return <main className="reader-shell">
    <SelectionSpeech player={selectionSpeech} />
    <VoiceConversation open={voiceOpen} phase={voice.phase} error={voice.error} />
    {pendingAnnotation && <AnnotationPreview key={`${pendingAnnotation.action}:${pendingAnnotation.selection.page}`} action={pendingAnnotation.action} image={pendingAnnotation.selection.image} initialText={pendingAnnotation.selection.text} defaultLanguage={language} defaultProficiency={proficiency} onClose={() => setPendingAnnotation(null)} onSubmit={(draft) => void createAnnotation(pendingAnnotation.action, pendingAnnotation.selection, draft)} />}
    <header className="reader-topbar">
      <div className="reader-document-title">
        <Link href={`/books/${encodeURIComponent(id)}`} aria-label="Back to book" className="reader-back"><RiArrowLeftLine className="size-5" /></Link>
        <div className="min-w-0"><strong className="block truncate">{book?.title || "Opening PDF…"}</strong><span>{pdf ? `${pdf.numPages} pages` : "Your document"}</span></div>
      </div>
      <TooltipProvider><ButtonGroup className="reader-toolbar" aria-label="Reader tools">
        <ReaderToolButton label="Toggle page thumbnails" shortcut="P" variant={sidebar ? "secondary" : "ghost"} aria-pressed={sidebar} onClick={() => setSidebar((value) => !value)}><RiLayoutLeftLine className="size-[18px]" /></ReaderToolButton>
        <ReaderToolButton label="Search PDF" shortcut="/" variant={searchOpen ? "secondary" : "ghost"} aria-pressed={searchOpen} onClick={() => setSearchOpen((value) => !value)}><RiSearchLine className="size-[18px]" /></ReaderToolButton>
        <ReaderToolButton label="Select an area" shortcut="S" variant={areaEnabled ? "secondary" : "ghost"} aria-pressed={areaEnabled} onClick={toggleAreaSelection}><RiCropLine className="size-[18px]" /></ReaderToolButton>
        <ReaderToolButton label={voiceOpen ? voice.phase === "paused" || voice.phase === "idle" ? "Resume voice conversation" : "End voice conversation" : "Start voice conversation"} shortcut="V" variant={voiceOpen ? "secondary" : "ghost"} className={voiceOpen ? "reader-mic-active" : ""} aria-pressed={voiceOpen} disabled={busy} onClick={toggleVoice}><RiMicLine className="size-[18px]" /></ReaderToolButton>
        <ReaderToolButton label="Ask Prism AI" shortcut="A" variant={assistantOpen ? "secondary" : "ghost"} className="reader-ai-toggle" aria-pressed={assistantOpen} onClick={() => { voice.stop(); setVoiceOpen(false); setAssistantOpen((value) => !value) }}><RiSparklingLine className="size-[18px]" /></ReaderToolButton>
      </ButtonGroup></TooltipProvider>
      <div className="reader-header-end">
        <div className="reader-preferences" aria-label="AI response preferences">
          <Select value={language} items={languages.map((item) => ({ value: item.name, label: item.name }))} onValueChange={(value) => { if (typeof value === "string") setLanguage(value) }}><SelectTrigger size="sm" aria-label="AI answer language" title="Language for AI answers and narration" className="reader-preference-trigger"><SelectValue /></SelectTrigger><SelectContent align="end"><SelectGroup><SelectLabel>AI answer language</SelectLabel>{languages.map((item) => <SelectItem key={item.code} value={item.name}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select>
          <Select value={proficiency} items={proficiencyLevels.map((level) => ({ value: level.value, label: level.label }))} onValueChange={(value) => { if (isReadingProficiency(value)) setProficiency(value) }}><SelectTrigger size="sm" aria-label={`AI response depth in ${language}`} title={`How detailed AI answers are in ${language}; the PDF is unchanged`} className="reader-preference-trigger"><span className="text-muted-foreground">Depth</span><SelectValue /></SelectTrigger><SelectContent align="end" className="min-w-64"><SelectGroup><SelectLabel>AI response depth in {language}<span className="block font-normal">Changes AI output, not the PDF.</span></SelectLabel>{proficiencyLevels.map((level) => <SelectItem key={level.value} value={level.value}><span className="flex min-w-0 flex-col"><span>{level.label}</span><span className="text-xs font-normal whitespace-normal text-muted-foreground">{level.description}</span></span></SelectItem>)}</SelectGroup></SelectContent></Select>
        </div>
      <ButtonGroup className="reader-zoom"><Button variant="ghost" size="icon-sm" aria-label="Zoom out" title="Zoom out" disabled={zoom <= 0.7} onClick={() => setZoom((value) => Math.max(0.7, +(value - 0.1).toFixed(1)))}>−</Button><Button variant="ghost" size="sm" className="reader-fit-button" aria-label={zoom === 1 ? "Fit to available width" : `${Math.round(zoom * 100)} percent of fit width. Reset to fit.`} title="Fit to width" onClick={() => setZoom(1)}>{zoom === 1 ? "Fit" : `${Math.round(zoom * 100)}%`}</Button><Button variant="ghost" size="icon-sm" aria-label="Zoom in" title="Zoom in" disabled={zoom >= 1.6} onClick={() => setZoom((value) => Math.min(1.6, +(value + 0.1).toFixed(1)))}>+</Button></ButtonGroup></div>
    </header>

    <Sheet open={sidebar} onOpenChange={setSidebar}><SheetContent side="left" showCloseButton className="reader-pages-sheet"><SheetHeader className="reader-pages-sheet-head"><SheetTitle>Pages</SheetTitle><span>{pdf?.numPages ?? 0}</span></SheetHeader>{pdf && <ScrollArea className="reader-thumbnails">{Array.from({ length: pdf.numPages }, (_, index) => <Thumbnail key={index + 1} pdf={pdf} number={index + 1} active={page === index + 1} onClick={() => { setSidebar(false); goToPage(index + 1) }} />)}</ScrollArea>}</SheetContent></Sheet>

    <div className="reader-body">
      <TooltipProvider><aside className="reader-markup-rail" aria-label="PDF markup tools">
        <div className="reader-markup-rail-title">MARKUP</div>
        {([
          ["cursor", "Cursor", RiCursorLine], ["highlight", "Highlight", RiMarkPenLine], ["pen", "Draw with pen", RiPencilLine], ["note", "Sticky note", RiStickyNoteLine], ["eraser", "Erase marks", RiEraserLine],
        ] as const).map(([tool, label, Icon]) => <Tooltip key={tool}><TooltipTrigger render={<button type="button" className="reader-markup-tool" aria-label={label} aria-pressed={markupTool === tool} onClick={() => chooseMarkupTool(tool)}><Icon className="size-[19px]" /></button>} /><TooltipContent side="right">{label}</TooltipContent></Tooltip>)}
        <div className="reader-markup-divider" />
        <div className="reader-markup-colors" aria-label="Markup color">
          {markupColors.map((color, index) => <button key={color} type="button" className="reader-markup-color" style={{ backgroundColor: color }} aria-label={`Color ${index + 1}`} aria-pressed={markupColor === color} onClick={() => setMarkupColor(color)} />)}
        </div>
        <div className="reader-markup-rail-spacer" />
        <Tooltip><TooltipTrigger render={<button type="button" className="reader-markup-tool" aria-label="Undo last mark" disabled={!markups.length} onClick={() => { const latest = [...markups].sort((a, b) => b.createdAt - a.createdAt)[0]; if (latest) deleteMarkup(latest.id) }}><RiArrowGoBackLine className="size-[19px]" /></button>} /><TooltipContent side="right">Undo last mark</TooltipContent></Tooltip>
      </aside></TooltipProvider>
      <div className="reader-workspace">
        {searchOpen && <div className="reader-search" role="search" aria-label="Search this PDF">
          <form onSubmit={searchPdf} className="reader-search-form">
            <RiSearchLine className="reader-search-icon" aria-hidden="true" />
            <input autoFocus value={search} onChange={(event) => { setSearch(event.target.value); setSearched(false); setResults([]) }} onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false) }} placeholder="Find in document" aria-label="Search this PDF" />
            <button type="submit" className="reader-search-submit" disabled={searching || !search.trim()}>{searching ? "Finding…" : "Find"}</button>
            <button type="button" className="reader-search-close" onClick={() => setSearchOpen(false)} aria-label="Close search"><RiCloseLine className="size-4" /></button>
          </form>
          {results.length > 0 && <><div className="reader-search-meta">{results.length} {results.length === 1 ? "page" : "pages"} found</div><div className="reader-search-results">{results.map((result) => <Button key={result.page} variant="ghost" className="reader-search-result" onClick={() => { goToPage(result.page); setSearchOpen(false) }}><strong>Page {result.page}</strong><span>{result.snippet}</span></Button>)}</div></>}
          {!searching && searched && results.length === 0 && <p className="reader-search-empty">No matches found.</p>}
        </div>}
        <div ref={stage} className="reader-stage">
          {loading ? <div className="reader-loading"><Skeleton className="h-[65vh] w-full max-w-3xl rounded-sm" /></div> : !pdf ? <div className="reader-error"><h1>Couldn’t open this PDF</h1><p>{error || "This book is no longer in your library."}</p><Button variant="secondary" onClick={() => setReloadKey((value) => value + 1)}>Try again</Button><Link href={`/books/${encodeURIComponent(id)}`}>Back to book</Link></div> : <div className="reader-pages">
            {Array.from({ length: pdf.numPages }, (_, index) => <LazyPdfPage key={index + 1} pdf={pdf} number={index + 1} zoom={zoom} areaEnabled={areaEnabled} selection={selection} annotations={annotations} markups={markups} markupTool={markupTool} markupColor={markupColor} openMarkupNoteId={openMarkupNoteId} onAddMarkup={addMarkup} onUpdateMarkup={updateMarkup} onDeleteMarkup={deleteMarkup} onOpenMarkupNote={setOpenMarkupNoteId} openAnnotationId={openAnnotationId} audioAnnotationId={audioAnnotationId} speechPlayer={selectionSpeech} scrollRoot={stage} onSelect={(value) => { setSelection(value); setAreaEnabled(false); setError("") }} onClearSelection={() => setSelection(null)} onSelectionAction={prepareAnnotation} onOpenAnnotation={openAnnotation} onCloseAnnotation={closeAnnotation} onDeleteAnnotation={deleteAnnotation} onSpeakAnnotation={speakAnnotation} onError={setError} />)}
          </div>}
        </div>
        {areaEnabled && <p className="reader-area-hint">Drag over a page to select an area <span>· Esc to cancel</span></p>}
        {pdf && <div className="reader-page-indicator">Page {page} <span>/ {pdf.numPages}</span></div>}
        {busy && !assistantOpen && <div role="status" aria-live="polite" className="reader-annotation-progress"><span className="reader-annotation-progress-icon"><Spinner className="size-4" /></span><div><strong>Creating annotation</strong><span>{busyLabel}</span></div></div>}
        {error && !assistantOpen && pdf && <p role="alert" className="reader-global-error">{error}</p>}
      </div>

      {assistantOpen && <MessageScrollerProvider autoScroll>
        <Card className="reader-assistant gap-0" role="complementary" aria-label="Prism AI assistant">
          <CardHeader className="gap-1 border-b">
            <CardTitle>Prism AI</CardTitle>
            <CardDescription>How can I help with this page?</CardDescription>
            <CardAction className="flex gap-2">
              <Button variant="outline" size="icon" aria-label="Reset conversation" title="Reset conversation" onClick={() => { chatHistory.current = []; setChatMessages([]); setChatError("") }} disabled={busy || voice.active || chatMessages.length === 0}><RiResetLeftLine /></Button>
              <Button variant="outline" size="icon" aria-label="Close assistant" title="Close assistant" onClick={() => setAssistantOpen(false)}><RiCloseLine /></Button>
            </CardAction>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
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
                    <Message align={message.role === "user" ? "end" : "start"}><MessageContent><Bubble variant={message.role === "user" ? "default" : "muted"}><BubbleContent>{message.role === "assistant" ? <MarkdownMessage text={message.text} /> : <p className="whitespace-pre-wrap" dir="auto">{message.text}</p>}{message.role === "assistant" && !message.voice && !voice.active && <SpeechPlayer text={message.speechText || message.text} />}</BubbleContent></Bubble></MessageContent></Message>
                  </MessageScrollerItem>)}
                  {busy && <MessageScrollerItem messageId="thinking"><div role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Spinner />{busyLabel}</div></MessageScrollerItem>}
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
                  <InputGroupButton type="submit" variant="default" size="icon-sm" disabled={busy || voice.active || !prompt.trim()} className="ml-auto" aria-label="Send question"><RiArrowUpLine /></InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
            </form>
          </CardFooter>
        </Card>
      </MessageScrollerProvider>}
    </div>
  </main>
}
