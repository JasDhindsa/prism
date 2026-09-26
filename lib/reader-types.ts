import type { ReadingProficiency } from "./reader-preferences"

export type AnnotationKind = "quiz" | "adaptation" | "translation" | "pronunciation" | "highlight" | "video"
export type AnnotationRect = { x: number; y: number; width: number; height: number }
export type QuizQuestion =
  | { id: string; type: "multiple-choice"; prompt: string; options: { id: string; label: string }[]; answer: string; explanation: string }
  | { id: string; type: "fill-blank"; prompt: string; answer: string; explanation: string }
export type ReaderQuiz = { questions: QuizQuestion[] }
export type VideoAnimationObject = {
  id: string
  kind: "text" | "formula" | "rectangle" | "circle" | "line" | "arrow" | "curve" | "grid" | "surface"
  text: string
  x: number
  y: number
  width: number
  height: number
  color: string
  points: { x: number; y: number }[]
  values: number[]
  columns: number
}
export type VideoAnimationFrame = { at: number; objects: VideoAnimationObject[] }
export type VideoVisual = { frames?: VideoAnimationFrame[]; illustrative?: boolean; type: "flow" | "graph" | "bars" | "comparison" | "numberline" | "triangle" | "equation" | "animation"; labels: string[]; values: number[]; points: { x: number; y: number }[] }
export type VideoScene = { heading: string; caption: string; narration: string; visual: VideoVisual }
export type VideoPlan = { title: string; summary: string; language?: string; scenes: VideoScene[] }
export type VideoJob = {
  id: string
  status: "queued" | "narrating" | "rendering" | "ready" | "failed"
  stage: string
  progress: number
  createdAt: number
  title: string
  summary: string
  narration: boolean
  language?: string
  chapters?: { heading: string; narration: string; start: number; duration: number }[]
  sourceUrl?: string
  bundleUrl?: string
  videoUrl?: string
  captionsUrl?: string
  error?: string
  warning?: string
}
export type ReaderVideo = { jobId: string }
export type ReaderAnnotation = {
  id: string
  kind: AnnotationKind
  title: string
  text: string
  createdAt: number
  page: number
  quote?: string
  rects?: AnnotationRect[]
  colorIndex?: number
  quiz?: ReaderQuiz
  video?: ReaderVideo
  speechText?: string
  speechLanguage?: string
  language?: string
  proficiency?: ReadingProficiency
}
export type ReaderAction = "ask" | "adapt" | "explain" | "quiz" | "translate" | "pronunciation" | "video"
export type ReaderInput = {
  action: ReaderAction
  selection?: string
  context?: string
  documentPassages?: { page: number; text: string }[]
  prompt?: string
  image?: string
  language?: string
  proficiency?: ReadingProficiency
  sourceConfirmed?: boolean
  detailed?: boolean
  mode?: "text" | "voice"
  history?: { role: "user" | "assistant"; text: string }[]
}
export type ReaderResponse = { answer: string; title?: string; quiz?: ReaderQuiz; speechText?: string; speechLanguage?: string; video?: VideoJob }
