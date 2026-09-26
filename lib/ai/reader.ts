import type { ReaderInput, ReaderQuiz, ReaderResponse, VideoPlan, VideoScene, VideoVisual } from "../reader-types"
import { isReadingProficiency } from "../reader-preferences"
import { AiError } from "./http"
import { generateContent } from "./gemini"

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
  if (value.proficiency !== undefined && !isReadingProficiency(value.proficiency)) throw new AiError("Invalid reading proficiency.", 400)
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
const videoSchema = { type: "OBJECT", required: ["title", "summary", "scenes"], properties: {
  title: s, summary: s,
  scenes: { type: "ARRAY", minItems: 3, maxItems: 8, items: { type: "OBJECT", required: ["heading", "caption", "narration", "visual"], properties: {
    heading: s, caption: s, narration: s,
    visual: { type: "OBJECT", required: ["type", "labels", "values", "points"], properties: {
      type: { type: "STRING", enum: ["flow", "graph", "bars", "comparison", "numberline", "triangle", "equation"] },
      labels: { type: "ARRAY", minItems: 2, maxItems: 4, items: s },
      values: { type: "ARRAY", maxItems: 4, items: { type: "NUMBER" } },
      points: { type: "ARRAY", maxItems: 20, items: { type: "OBJECT", required: ["x", "y"], properties: { x: { type: "NUMBER" }, y: { type: "NUMBER" } } } },
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
    adapt: "Adapt only selectedContent, which is freshly extracted OCR of the selected area, into targetLanguage at readerProficiency. Return only the adapted passage; no introduction, instructions, pronunciation guide, summary, or discussion of your process. Preserve every important fact, relationship, qualification, name, number, and argument. Basic: short sentences and common words, with essential technical terms explained naturally inline. Intermediate: natural phrasing, full reasoning, and brief inline definitions of unfamiliar terms. Advanced: precise technical vocabulary, sophisticated phrasing, and all nuance; do not simplify into beginner language or add unsupported information. Help the reader develop their language skills by retaining useful subject vocabulary and making its meaning understandable in context. If source language differs from targetLanguage, use natural forms of politeness, register, and communication conventions in targetLanguage. When a difficult concept benefits from an analogy, weave in a brief explicitly illustrative comparison from everyday life or language usage familiar to speakers of targetLanguage. Keep the analogy distinct from document claims; do not infer personal nationality or cultural identity. Use Markdown and math only where useful.",
    translate: "Translate the selected passage into targetLanguage (default English). Preserve its meaning and terminology. Return only the faithfully translated passage as plain text, with no prefacing text. Match the chosen language proficiency without omitting facts or changing the source meaning. Do not replace source examples with cultural analogies in a translation.",
  }[(input.action === "explain" ? "adapt" : input.action) as "ask" | "adapt" | "translate"]
  if (!instruction) throw new AiError("Use video generation for video requests.", 400)
  return { answer: await generateContent(input, instruction) }
}
export async function generateVideoPlan(input: ReaderInput): Promise<VideoPlan> {
  const detailed = input.detailed !== false
  const minimum = detailed ? 6 : 3
  const maximum = detailed ? 8 : 4
  const schema = { ...videoSchema, properties: { ...videoSchema.properties, scenes: { ...videoSchema.properties.scenes, minItems: minimum, maxItems: maximum } } }
  const data = parseJson(await generateContent(input, `Create a ${minimum}-${maximum} scene narrated visual lesson grounded specifically in the reviewed selection. Follow the reader's topic and instructions. Write narration in targetLanguage (English when unspecified or auto). ${detailed ? "Make a detailed 2-4 minute lesson: introduce the question, unpack the key definitions, develop the reasoning in small steps, show a worked example or useful analogy, explain a subtle point or common misconception, connect the ideas, and finish with a recap. Cover the important details of this specific passage, not just its general subject. Use 40-70 words of narration per scene." : "Make a concise lesson with 20-40 words of narration per scene."} Use mathematical animation: dark backgrounds, color-coded geometry, transformations, and step-by-step visual reasoning. Every scene needs a heading (max 75 characters), a caption (max 180 characters), and narration (max 1000 characters). Visuals support: flow (2-4 ordered labels connected by arrows), comparison (2-4 labeled concepts), bars (2-4 labels plus matching positive numeric values), graph (two axis labels plus 3-20 ordered x/y points), numberline (2-4 labels with matching numeric values), triangle (right triangle with squares on the sides; labels a, b, c and exactly the two positive leg lengths in values), equation (2-4 equation steps as Unicode text in labels, no LaTeX). Prefer triangle and transforming equations for geometry. Vary the visuals to actually teach the concept. Every visual must include labels, values, and points; use empty arrays for irrelevant fields. Labels max 60 characters. Source facts must be faithful; do not invent statistics. A worked example with invented simple numbers is allowed only when the narration and caption clearly label it as an illustrative example. Explain the visual in the narration instead of merely reading its labels. Keep terminology, names, and quantities from the selection accurate. No Python code or executable expressions: your storyboard will be compiled into Manim code.`, schema))
  if (!Array.isArray(data.scenes) || data.scenes.length < minimum || data.scenes.length > maximum) throw new AiError("The AI returned an incomplete storyboard. Try again.")
  const scenes: VideoScene[] = data.scenes.map((raw) => {
    if (!isObject(raw) || !isObject(raw.visual)) throw new AiError("The AI returned an invalid scene.")
    const visual = raw.visual
    if (!["flow", "graph", "bars", "comparison", "numberline", "triangle", "equation"].includes(visual.type as string) || !Array.isArray(visual.labels) || visual.labels.length < 2 || visual.labels.length > 4 || !Array.isArray(visual.values) || visual.values.length > 4 || !Array.isArray(visual.points) || visual.points.length > 20) throw new AiError("The AI returned an unsupported visual.")
    const labels = visual.labels.map((label) => text(label, 60, "visual label"))
    const values = visual.values as number[]
    if (values.some((value) => typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e6)) throw new AiError("The AI returned invalid visual values.")
    const points = visual.points.map((point) => {
      if (!isObject(point) || typeof point.x !== "number" || typeof point.y !== "number" || !Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > 1e6 || Math.abs(point.y) > 1e6) throw new AiError("The AI returned invalid graph points.")
      return { x: point.x, y: point.y }
    })
    if (visual.type === "graph" && (points.length < 3 || new Set(points.map((point) => point.x)).size < 2)) throw new AiError("The AI returned an empty graph.")
    if (["bars", "numberline"].includes(visual.type as string) && (values.length !== labels.length || (visual.type === "bars" && values.some((value) => value <= 0)))) throw new AiError("The AI returned mismatched visual labels and values.")
    if (visual.type === "triangle" && (values.length !== 2 || values.some((value) => value <= 0))) throw new AiError("The AI returned invalid triangle dimensions.")
    return { heading: text(raw.heading, 100, "scene heading"), caption: text(raw.caption, 220, "caption"), narration: text(raw.narration, 1000, "narration"), visual: { type: visual.type as VideoVisual["type"], labels, values, points } }
  })
  return { title: text(data.title, 100, "video title"), summary: text(data.summary, 1200, "video summary"), language: input.language || "English", scenes }
}
