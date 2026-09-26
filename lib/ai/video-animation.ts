import { AiError } from "./http"
import type { VideoAnimationFrame, VideoAnimationObject, VideoVisual } from "../reader-types"

const kinds = ["text", "formula", "rectangle", "circle", "line", "arrow", "curve", "grid", "surface"]
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const bounded = (value: unknown, fallback: number, min: number, max: number) => finite(value) ? Math.min(max, Math.max(min, value)) : fallback
const content = (value: unknown, max = 400) => typeof value === "string" ? value.slice(0, max) : ""
function points(value: unknown, max: number) {
  return (Array.isArray(value) ? value : []).filter(object).filter((point) => finite(point.x) && finite(point.y)).slice(0, max).map((point) => ({ x: bounded(point.x, 0, -1e6, 1e6), y: bounded(point.y, 0, -1e6, 1e6) }))
}

// Repair harmless provider formatting differences locally instead of requesting another plan.
export function validateAnimation(value: unknown): VideoAnimationFrame[] {
  const frames = (Array.isArray(value) ? value : []).filter(object).filter((frame) => Array.isArray(frame.objects)).slice(0, 8)
  const result: VideoAnimationFrame[] = frames.map((frame, index) => {
    const objects: VideoAnimationObject[] = (frame.objects as unknown[]).filter(object).slice(0, 24).map((item, itemIndex) => {
      const aliases: Record<string, string> = { equation: "formula", rect: "rectangle", plot: "curve", heatmap: "grid", mesh: "surface" }
      const requested = content(item.kind).toLowerCase()
      const kind = (kinds.includes(aliases[requested] || requested) ? aliases[requested] || requested : "text") as VideoAnimationObject["kind"]
      let text = content(item.text)
      if (kind === "formula") text = text.replaceAll("\\\\", "\\").replace(/^\$|\$$/g, "")
      // These commands are not part of the supported mathematical language.
      if (kind === "formula" && /\\(?:input|include|write|openout|read|def|usepackage|href)\b/.test(text)) text = ""
      const samples = (Array.isArray(item.values) ? item.values : []).filter(finite).slice(0, 144).map((value) => bounded(value, 0, 0, 1))
      const columns = Math.round(bounded(item.columns, 2, 2, 12))
      if (kind === "grid" || kind === "surface") {
        const length = Math.min(columns * 12, Math.max(columns * 2, Math.ceil(samples.length / columns) * columns))
        while (samples.length < length) samples.push(samples[samples.length - 1] ?? 0)
        samples.length = length
      }
      const vertices = points(item.points, kind === "curve" ? 120 : 2)
      if (["line", "arrow", "curve"].includes(kind) && vertices.length < 2) vertices.push(...[{ x: -1, y: 0 }, { x: 1, y: 0 }].slice(vertices.length))
      return { id: `${content(item.id, 40) || `object-${itemIndex}`}-${kind}`, kind, text, x: bounded(item.x, 0, -5.8, 5.8), y: bounded(item.y, 0, -1.95, 1.05), width: bounded(item.width, 3, 0.1, 11.6), height: bounded(item.height, 1, 0.1, 2.9), color: /^#[0-9a-fA-F]{6}$/.test(content(item.color)) ? content(item.color) : "#6ADFD4", points: vertices, values: samples, columns }
    })
    const ids = new Set<string>()
    return { at: frames.length > 1 ? index / (frames.length - 1) * 0.8 : 0, objects: objects.filter((item) => { if (ids.has(item.id)) return false; ids.add(item.id); return true }) }
  }).filter((frame) => frame.objects.length)
  if (!result.length) throw new AiError("The animation contains no drawable objects.")
  return result
}

export function normalizeVideoVisual(value: unknown, fallback: string): VideoVisual {
  const raw = object(value) ? value : {}
  const labels = (Array.isArray(raw.labels) ? raw.labels : []).filter((label): label is string => typeof label === "string" && !!label.trim()).slice(0, 4).map((label) => label.slice(0, 400))
  const values = (Array.isArray(raw.values) ? raw.values : []).filter(finite).slice(0, 4)
  const vertices = points(raw.points, 20)
  const aliases: Record<string, string> = { custom: "animation", animated: "animation", formula: "equation", plot: "graph", bar: "bars", bar_chart: "bars", flowchart: "flow", number_line: "numberline" }
  const requested = content(raw.type).toLowerCase()
  let type = (aliases[requested] || requested) as VideoVisual["type"]
  if (Array.isArray(raw.frames) && raw.frames.length) {
    try { return { type: "animation", frames: validateAnimation(raw.frames), labels: [], values: [], points: [], illustrative: raw.illustrative === true } }
    catch {
      // Preserve the generated explanatory text if a custom diagram is incomplete.
      for (const frame of raw.frames.filter(object)) {
        for (const item of (Array.isArray(frame.objects) ? frame.objects : []).filter(object)) {
          if (typeof item.text === "string" && item.text.trim() && labels.length < 4) labels.push(item.text.slice(0, 400))
        }
      }
    }
  }
  if (type === "graph" && (vertices.length < 2 || new Set(vertices.map((point) => point.x)).size < 2)) type = "comparison"
  if (type === "triangle" && (values.length < 2 || values.slice(0, 2).some((value) => value <= 0))) type = "equation"
  if (type === "bars" && (!values.length || values.some((value) => value <= 0))) type = "comparison"
  if (type === "numberline" && !values.length) type = "comparison"
  if (!["flow", "graph", "bars", "comparison", "numberline", "triangle", "equation"].includes(type)) type = "comparison"
  if (!labels.length) labels.push(fallback)
  if (type === "graph") { while (labels.length < 2) labels.push(labels.length === 0 ? "x" : "y") }
  if (type === "triangle") { labels.splice(0, labels.length, ...["a", "b", "c"]); values.length = 2 }
  if (type === "bars" || type === "numberline") {
    while (labels.length < values.length) labels.push(`Value ${labels.length + 1}`)
    labels.length = values.length
  }
  return { type, labels, values, points: vertices, illustrative: raw.illustrative === true }
}
