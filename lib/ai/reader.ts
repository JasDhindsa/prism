import type { ReaderInput, ReaderQuiz, ReaderResponse, VideoPlan, VideoScene } from "../reader-types"
import { isReadingProficiency } from "../reader-preferences"
import { AiError } from "./http"
import { generateContent } from "./gemini"
import { normalizeVideoVisual } from "./video-animation"

const actions = ["ask", "adapt", "explain", "quiz", "translate", "pronunciation", "video"]
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
function text(value: unknown, max: number, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new AiError(`The AI returned an invalid ${name}. Try again.`)
  return value.trim()
}
export function validateInput(value: unknown): ReaderInput {
  if (!isObject(value) || !actions.includes(value.action as string)) throw new AiError("Unknown reader action.", 400)
  for (const [field, max] of Object.entries({ selection: 12000, context: 16000, prompt: 2000, image: 3000000, language: 80 })) {
    if (value[field] !== undefined && (typeof value[field] !== "string" || (value[field] as string).length > max)) throw new AiError(`Invalid or oversized ${field}.`, 400)
  }
  if (!((value.selection as string)?.trim() || value.image || (value.prompt as string)?.trim())) throw new AiError("Select a passage or ask a question first.", 400)
  if (value.image && !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.image as string)) throw new AiError("The selection image must be a JPEG.", 400)
  if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > 12 || value.history.some((message) => !isObject(message) || !["user", "assistant"].includes(message.role as string) || typeof message.text !== "string" || message.text.length > 6000))) throw new AiError("Invalid conversation history.", 400)
  if (value.documentPassages !== undefined && (!Array.isArray(value.documentPassages) || value.documentPassages.length > 6 || value.documentPassages.some((passage) => !isObject(passage) || !Number.isInteger(passage.page) || (passage.page as number) < 1 || typeof passage.text !== "string" || passage.text.length > 1500))) throw new AiError("Invalid document passages.", 400)
  if (value.documentPassages !== undefined && value.action !== "video") throw new AiError("Document passages are only supported for videos.", 400)
  if (value.proficiency !== undefined && !isReadingProficiency(value.proficiency)) throw new AiError("Invalid response depth.", 400)
  if ((value.sourceConfirmed !== undefined && typeof value.sourceConfirmed !== "boolean") || (value.detailed !== undefined && typeof value.detailed !== "boolean") || (value.mode !== undefined && !["voice", "text"].includes(value.mode as string))) throw new AiError("Invalid generation options.", 400)
  return value as ReaderInput
}
const s = { type: "STRING" }
const quizSchema = { type: "OBJECT", required: ["title", "answer", "questions"], properties: {
  title: s, answer: s,
  questions: { type: "ARRAY", minItems: 3, maxItems: 5, items: { type: "OBJECT", required: ["id", "type", "prompt", "options", "answer", "explanation"], properties: {
    id: s, type: { type: "STRING", enum: ["multiple-choice", "fill-blank"] }, prompt: s,
    options: { type: "ARRAY", items: { type: "OBJECT", required: ["id", "label"], properties: { id: s, label: s } } }, answer: s, explanation: s,
  } } },
} }
const speechSchema = { type: "OBJECT", required: ["title", "answer", "speechText"], properties: { title: s, answer: s, speechText: s } }
const pointSchema = { type: "OBJECT", required: ["x", "y"], properties: { x: { type: "NUMBER" }, y: { type: "NUMBER" } } }
const animationObjectSchema = { type: "OBJECT", required: ["id", "kind", "text", "x", "y", "width", "height", "color", "points", "values", "columns"], properties: {
  id: s, kind: s, text: s, x: { type: "NUMBER" }, y: { type: "NUMBER" }, width: { type: "NUMBER" }, height: { type: "NUMBER" }, color: s,
  points: { type: "ARRAY", items: pointSchema }, values: { type: "ARRAY", items: { type: "NUMBER" } }, columns: { type: "INTEGER" },
} }
const videoSchema = { type: "OBJECT", required: ["title", "summary", "scenes"], properties: {
  title: s, summary: s,
  scenes: { type: "ARRAY", items: { type: "OBJECT", required: ["heading", "caption", "narration", "visual"], properties: {
    heading: s, caption: s, narration: s,
    visual: { type: "OBJECT", required: ["type", "labels", "values", "points", "illustrative", "frames"], properties: {
      type: s, illustrative: { type: "BOOLEAN" },
      labels: { type: "ARRAY", items: s }, values: { type: "ARRAY", items: { type: "NUMBER" } }, points: { type: "ARRAY", items: pointSchema },
      frames: { type: "ARRAY", items: { type: "OBJECT", required: ["at", "objects"], properties: { at: { type: "NUMBER" }, objects: { type: "ARRAY", items: animationObjectSchema } } } },
    } },
  } } },
} }
function parseJson(raw: string): Record<string, unknown> {
  try { const result: unknown = JSON.parse(raw); if (isObject(result)) return result } catch { /* Report a useful error below. */ }
  throw new AiError("The AI returned incomplete structured content. Try again.")
}
function validateQuiz(data: Record<string, unknown>): ReaderQuiz {
  if (!Array.isArray(data.questions) || data.questions.length < 3 || data.questions.length > 5) throw new AiError("The AI returned an invalid quiz.")
  const ids = new Set<string>()
  const questions = data.questions.map((raw) => {
    if (!isObject(raw)) throw new AiError("The AI returned an invalid question.")
    const base = { id: text(raw.id, 80, "question ID"), prompt: text(raw.prompt, 1000, "question"), answer: text(raw.answer, 200, "answer"), explanation: text(raw.explanation, 1200, "explanation") }
    if (ids.has(base.id)) throw new AiError("The AI returned duplicate question IDs.")
    ids.add(base.id)
    if (raw.type === "fill-blank") return { ...base, type: "fill-blank" as const }
    if (raw.type !== "multiple-choice" || !Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 4) throw new AiError("The AI returned invalid quiz options.")
    const options = raw.options.map((option) => {
      if (!isObject(option)) throw new AiError("The AI returned an invalid option.")
      return { id: text(option.id, 80, "option ID"), label: text(option.label, 500, "option") }
    })
    if (new Set(options.map((option) => option.id)).size !== options.length || !options.some((option) => option.id === base.answer)) throw new AiError("The quiz answer does not match its options.")
    return { ...base, type: "multiple-choice" as const, options }
  })
  return { questions }
}
export async function generateReader(input: ReaderInput): Promise<ReaderResponse> {
  if (input.action === "ask" && input.mode === "voice") {
    const data = parseJson(await generateContent(input, "Have a natural spoken conversation with the reader. Respond in their spoken language unless they explicitly choose another language in targetLanguage. Auto means follow the language of their latest utterance; support mixed-language questions. Be warm, direct, and brief (usually 2-4 sentences). Ask a useful follow-up when appropriate. Handle greetings and conversational requests naturally. Ground questions about the PDF in the selected context, and say when that context is insufficient. Put your answer in Markdown when useful. speechText must be the same reply as natural spoken text, with no Markdown, LaTeX, or stage directions; speak equations and symbols in words. Keep speechText under 1500 characters.", speechSchema))
    return { answer: text(data.answer, 6000, "spoken reply"), speechText: text(data.speechText, 1500, "spoken reply") }
  }
  if (input.action === "quiz") {
    const data = parseJson(await generateContent(input, "Create 3 questions based on the selected content: two multiple-choice questions with four options and one fill-in-the-blank with a single exact term as the answer. For multiple-choice the answer MUST be the option ID. Use unique question and option IDs. Include concise factual explanations. The answer field at the top is a short description of the quiz, not an answer key.", quizSchema))
    return { answer: text(data.answer, 1800, "quiz summary"), title: text(data.title, 100, "title"), quiz: validateQuiz(data) }
  }
  if (input.action === "pronunciation") {
    // Pronunciation is a literal readout, never a generative transformation.
    if (!input.selection?.trim()) throw new AiError("Extract the selected text with OCR before pronunciation.", 400)
    return { answer: input.selection, title: "Pronunciation", speechText: input.selection }
  }
  const instruction = {
    ask: "Answer the reader's question using the selected PDF content and relevant conversation history. Use well-formatted Markdown: headings, emphasis, lists, fenced code blocks, and tables when useful. Write math with $inline$ or $$display$$ notation. Respond in the reader's language unless they request another. Keep the answer clear and grounded in the actual passage or diagram.",
    adapt: "Adapt only selectedContent, which is freshly extracted OCR of the selected area, into targetLanguage at responseDepth. Return only the adapted passage; no introduction, instructions, pronunciation guide, summary, or discussion of your process. Preserve every important fact, relationship, qualification, name, number, and argument. Simple (beginner): short sentences and common words, with essential technical terms explained naturally inline. Balanced (intermediate): natural phrasing, full reasoning, and brief inline definitions of unfamiliar terms. In depth (advanced): precise technical vocabulary, sophisticated phrasing, and all nuance; do not simplify into beginner language or add unsupported information. Help the reader develop their language skills by retaining useful subject vocabulary and making its meaning understandable in context. If source language differs from targetLanguage, use natural forms of politeness, register, and communication conventions in targetLanguage. When a difficult concept benefits from an analogy, weave in a brief explicitly illustrative comparison from everyday life or language usage familiar to speakers of targetLanguage. Keep the analogy distinct from document claims; do not infer personal nationality or cultural identity. Use Markdown and math only where useful.",
    translate: "Translate the selected passage into targetLanguage (default English). Preserve its meaning and terminology. Return only the faithfully translated passage as plain text, with no prefacing text. Match the chosen response depth in targetLanguage without omitting facts or changing the source meaning. Do not replace source examples with cultural analogies in a translation.",
  }[(input.action === "explain" ? "adapt" : input.action) as "ask" | "adapt" | "translate"]
  if (!instruction) throw new AiError("Use video generation for video requests.", 400)
  return { answer: await generateContent(input, instruction) }
}
export async function generateVideoPlan(input: ReaderInput): Promise<VideoPlan> {
  const detailed = input.detailed !== false
  const minimum = detailed ? 6 : 3
  const maximum = detailed ? 8 : 4
  const data = parseJson(await generateContent(input, `Create a ${minimum}-${maximum} scene narrated visual lesson. Read the image directly, identify its subject, and choose diagrams that explain it. Center the lesson on the selected image/text; cite page numbers for facts used only from documentPassages. Follow the reader's preferences and targetLanguage. ${detailed ? "Use 40–70 words of narration per scene, developing definitions, mechanisms, a worked demonstration, and a recap." : "Use 20–40 words per scene with a compact worked demonstration."}
Choose visuals that teach THIS subject. Do not substitute generic flowcharts or concept cards for a process, formula, chart, image, geometry, or physical mechanism. Prefer custom animation where useful. For mathematical subjects, include typeset formulas connected to diagrams and show how inputs affect results. Use flow/comparison when relationships are the learning goal.
Every scene: heading <=75 characters, caption <=180, narration <=1000. Every visual: type, labels, values, points, illustrative boolean, frames (empty for fixed templates). Numeric evidence may come from the image, selectedContent, or documentPassages. Illustrative synthetic examples and standard mathematical curves ARE allowed: set illustrative=true and explicitly call them schematic/illustrative in narration. Never imply illustrative values are measured source data. Standard explanatory formulas absent from the source must be introduced as explanatory background, with all symbols defined. Preserve source facts; say when illegible.
Custom type animation uses 2–4 compact keyframes. at is a fraction of chapter duration: first 0, subsequent strictly increasing through max 0.85. Prefer 3–6 objects per frame and small grids (3–6 rows/columns) to keep the lesson compact. Each frame may have up to 24 objects. Same id and kind across frames means that object smoothly transforms; missing IDs fade out and new IDs fade in. Prefer showing a formula together with its diagram, using matching symbols and colors. Animation must show actual changing geometry, curves, values, positions or formulas, not just reveal labels. Objects have id (ASCII name), kind (text/formula/rectangle/circle/line/arrow/curve/grid/surface), text (max400), x,y (center), width,height, color (#RRGGBB), points, values, columns. Every object includes every field; unused text="", points=[], values=[], columns=0. Canvas x=-5.8..5.8 and y=-1.95..1.05. Keep bounding boxes inside that canvas without overlap; width 0.1..11.6, height 0.1..2.9. Reserve space for clear labels and use a consistent palette: #6ADFD4, #F6C977, #B9A5F7, #F49A8A, #F7F7F5. Pair formula on one side with diagram on the other when useful.
formula text is Matplotlib Mathtext LaTeX notation WITHOUT dollar delimiters, supports \\frac, \\sum, \\exp, \\sigma, subscripts/superscripts; no packages, environments, or arbitrary TeX commands. Use typeset fractions/sums rather than "sum(...)" strings. text objects use natural-language labels. rectangle/circle use dimensions. line/arrow have exactly two local x/y points. curve has 2–120 local x/y sample points; these points are fitted to width,height (shape remains proportional) and centered at x,y; draw axes and labels separately. grid/surface have row-major intensity values 0..1, columns=2..12, 2..12 rows. grid renders colored cells; surface renders an oblique height mesh where intensity is height. Keep the same grid dimensions across frames for smooth before/after animation. Multiple surfaces/curves can demonstrate input, kernels, product and output, with matching colored formula terms. Arrays are bounded to 144 values. Numeric examples must be mathematically consistent; compute samples from the described formula, not arbitrary decorative points.
Fixed templates: flow/comparison 2–4 labels; bars 2–4 labels and matching positive values; graph two axis labels and 3–20 x/y points; numberline 2–4 labels and matching values; triangle labels a,b,c and two positive legs; equation 2–4 Unicode expression labels (custom animation formula preferred). Fixed labels <=60 characters. Use no executable code or expressions for numeric geometry. `, videoSchema))
  if (!Array.isArray(data.scenes) || !data.scenes.length) throw new AiError("The AI returned an empty storyboard. Try again.")
  const scenes: VideoScene[] = data.scenes.slice(0, maximum).filter(isObject).map((raw, index) => ({
    heading: typeof raw.heading === "string" && raw.heading.trim() ? raw.heading.slice(0, 100) : `Scene ${index + 1}`,
    caption: typeof raw.caption === "string" ? raw.caption.slice(0, 220) : "",
    narration: typeof raw.narration === "string" ? raw.narration.slice(0, 1000) : "",
    visual: normalizeVideoVisual(raw.visual, typeof raw.heading === "string" ? raw.heading : "Key idea"),
  }))
  if (!scenes.length) throw new AiError("The AI returned an empty storyboard. Try again.")
  return { title: typeof data.title === "string" && data.title.trim() ? data.title.slice(0, 100) : "Visual lesson", summary: typeof data.summary === "string" ? data.summary.slice(0, 1200) : scenes[0].caption, language: input.language || "English", scenes }
}
