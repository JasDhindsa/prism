"use client"

import { useRef, useState, type PointerEvent } from "react"
import { RiDeleteBin6Line, RiStickyNoteLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type MarkupTool = "cursor" | "highlight" | "pen" | "note" | "eraser"
type Point = { x: number; y: number }
export type PageMarkup = {
  id: string
  page: number
  color: string
  createdAt: number
} & (
  | { kind: "highlight"; rect: { x: number; y: number; width: number; height: number } }
  | { kind: "pen"; points: Point[] }
  | { kind: "note"; point: Point; text: string }
)

export function MarkupLayer({ page, width, height, tool, color, marks, openNoteId, onAdd, onUpdate, onDelete, onOpenNote }: {
  page: number
  width: number
  height: number
  tool: MarkupTool
  color: string
  marks: PageMarkup[]
  openNoteId: string | null
  onAdd: (mark: PageMarkup) => void
  onUpdate: (mark: PageMarkup) => void
  onDelete: (id: string) => void
  onOpenNote: (id: string | null) => void
}) {
  const start = useRef<Point | null>(null)
  const [draft, setDraft] = useState<PageMarkup | null>(null)
  const [noteText, setNoteText] = useState("")
  const pageMarks = marks.filter((mark) => mark.page === page)

  function position(event: PointerEvent<HTMLDivElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    }
  }

  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const point = position(event)
    if (tool === "note") {
      const note: PageMarkup = { id: crypto.randomUUID(), page, kind: "note", point, text: "", color, createdAt: Date.now() }
      onAdd(note)
      setNoteText("")
      onOpenNote(note.id)
      return
    }
    start.current = point
    event.currentTarget.setPointerCapture(event.pointerId)
    if (tool === "pen") setDraft({ id: crypto.randomUUID(), page, kind: "pen", points: [point], color, createdAt: Date.now() })
    if (tool === "highlight") setDraft({ id: crypto.randomUUID(), page, kind: "highlight", rect: { ...point, width: 0, height: 0 }, color, createdAt: Date.now() })
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (!start.current || !draft) return
    const point = position(event)
    if (draft.kind === "pen") {
      const last = draft.points[draft.points.length - 1]
      if (Math.hypot((point.x - last.x) * width, (point.y - last.y) * height) < 2) return
      setDraft({ ...draft, points: [...draft.points, point] })
    } else if (draft.kind === "highlight") {
      const origin = start.current
      setDraft({ ...draft, rect: { x: Math.min(origin.x, point.x), y: Math.min(origin.y, point.y), width: Math.abs(point.x - origin.x), height: Math.abs(point.y - origin.y) } })
    }
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!start.current || !draft) return
    const point = position(event)
    if (draft.kind === "highlight") {
      const origin = start.current
      const rect = { x: Math.min(origin.x, point.x), y: Math.min(origin.y, point.y), width: Math.abs(point.x - origin.x), height: Math.abs(point.y - origin.y) }
      if (rect.width * width > 5 && rect.height * height > 5) onAdd({ ...draft, rect })
    } else if (draft.kind === "pen") {
      onAdd({ ...draft, points: [...draft.points, point] })
    }
    start.current = null
    setDraft(null)
  }

  const visibleMarks = draft ? [...pageMarks, draft] : pageMarks
  return <>
    <svg className={`reader-markup-svg${tool === "eraser" ? " reader-markup-eraser" : ""}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label={tool === "eraser" ? "Click a mark to erase it" : undefined}>
      {visibleMarks.map((mark) => mark.kind === "highlight"
        ? <rect key={mark.id} className="reader-markup-highlight" x={mark.rect.x * width} y={mark.rect.y * height} width={mark.rect.width * width} height={mark.rect.height * height} fill={mark.color} onClick={() => { if (tool === "eraser") onDelete(mark.id) }} />
        : mark.kind === "pen"
          ? <g key={mark.id}><polyline className="reader-markup-pen" points={mark.points.map((point) => `${point.x * width},${point.y * height}`).join(" ")} stroke={mark.color} />{tool === "eraser" && <polyline className="reader-markup-pen-hit" points={mark.points.map((point) => `${point.x * width},${point.y * height}`).join(" ")} onClick={() => onDelete(mark.id)} />}</g>
          : null)}
    </svg>
    {pageMarks.filter((mark): mark is Extract<PageMarkup, { kind: "note" }> => mark.kind === "note").map((note) => <Popover key={note.id} open={openNoteId === note.id} onOpenChange={(open) => {
      if (open) { setNoteText(note.text); onOpenNote(note.id) }
      else if (openNoteId === note.id) { if (!note.text) onDelete(note.id); onOpenNote(null) }
    }}>
      <PopoverTrigger render={<button type="button" className="reader-sticky-pin" style={{ left: `${note.point.x * 100}%`, top: `${note.point.y * 100}%`, backgroundColor: note.color }} aria-label={`Sticky note on page ${page}${note.text ? `: ${note.text.slice(0, 60)}` : ""}`} title={tool === "eraser" ? "Erase sticky note" : "Open sticky note"} onClick={(event) => { if (tool === "eraser") { event.preventDefault(); onDelete(note.id) } else { setNoteText(note.text); onOpenNote(note.id) } }}><RiStickyNoteLine className="size-4" /></button>} />
      <PopoverContent side="right" align="start" sideOffset={12} className="reader-sticky-popover">
        <div className="reader-sticky-heading"><span className="reader-sticky-dot" style={{ backgroundColor: note.color }} />Sticky note · Page {page}</div>
        <textarea autoFocus value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Write a note about this page…" aria-label="Sticky note text" maxLength={2000} />
        <div className="reader-sticky-actions"><Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { onDelete(note.id); onOpenNote(null) }}><RiDeleteBin6Line className="size-4" />Delete</Button><Button size="sm" onClick={() => { if (noteText.trim()) onUpdate({ ...note, text: noteText.trim() }); else onDelete(note.id); onOpenNote(null) }}>Save note</Button></div>
      </PopoverContent>
    </Popover>)}
    {(tool === "highlight" || tool === "pen" || tool === "note") && <div className={`reader-markup-input reader-markup-input-${tool}`} aria-label={tool === "note" ? "Click to place a sticky note" : `Drag to ${tool}`} onPointerDown={begin} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { start.current = null; setDraft(null) }} />}
  </>
}
