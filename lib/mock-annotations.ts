import type { AnnotationKind, ReaderAction, ReaderAnnotation, ReaderQuiz, ReaderVideo } from "./reader-types"
export type { AnnotationKind, AnnotationRect, QuizQuestion, ReaderQuiz, ReaderVideo, ReaderAnnotation, ReaderAction } from "./reader-types"

const columbian = {
  explain: "The Columbian Exchange moved plants, animals, people, and diseases between the Americas and the rest of the world after 1492. Crops such as maize and potatoes spread east. Horses, cattle, and wheat spread west. These movements changed diets, trade, landscapes, and populations.",
  quiz: "1. Which crop moved from the Americas to Europe?\nA. Wheat  B. Potato  C. Rice  D. Barley\nAnswer: B. Potato.\n\n2. Which animal moved to the Americas?\nA. Horse  B. Turkey  C. Llama  D. Bison\nAnswer: A. Horse.\n\n3. What else travelled across the Atlantic?\nA. Only food  B. Only tools  C. Diseases  D. Nothing\nAnswer: C. Diseases.",
  translate: "El intercambio colombino trasladó plantas, animales, personas y enfermedades entre América y el resto del mundo después de 1492. Cultivos como el maíz y la papa llegaron a Europa, África y Asia; los caballos, el ganado y el trigo llegaron a América.",
  pronunciation: "Columbian — kuh-LUHM-bee-uhn\nExchange — iks-CHAYNJ\nMaize — MAYZ\nIndigenous — in-DIJ-uh-nuhs",
  video: "A short visual explanation of how crops, animals, and diseases crossed the Atlantic.",
  ask: "This page is about the Columbian Exchange: the movement of crops, animals, people, and diseases across the Atlantic. The arrows in the diagram show the direction of those transfers. This is a preview answer based on the document topic; the selected image has not been analyzed yet.",
} satisfies Record<ReaderAction, string>

const columbianQuiz: ReaderQuiz = { questions: [
  { id: "crop", type: "multiple-choice", prompt: "Which crop moved from the Americas to Europe?", options: [{ id: "wheat", label: "Wheat" }, { id: "potato", label: "Potato" }, { id: "rice", label: "Rice" }, { id: "barley", label: "Barley" }], answer: "potato", explanation: "Potatoes originated in the Americas and spread to Europe." },
  { id: "animal", type: "multiple-choice", prompt: "Which animal moved to the Americas?", options: [{ id: "horse", label: "Horse" }, { id: "turkey", label: "Turkey" }, { id: "llama", label: "Llama" }, { id: "bison", label: "Bison" }], answer: "horse", explanation: "Horses arrived in the Americas from Europe." },
  { id: "disease", type: "fill-blank", prompt: "Along with plants and animals, ______ travelled across the Atlantic.", answer: "diseases", explanation: "Diseases were part of the exchange and had profound effects on populations." },
] }

const columbianVideo: ReaderVideo = { secondsPerScene: 5, scenes: [
  { heading: "A world connects", caption: "After 1492, Atlantic crossings linked ecosystems that had developed apart.", from: "Americas", to: "Europe" },
  { heading: "Crops move east", caption: "Potatoes and maize crossed the ocean and reshaped diets.", from: "Americas", to: "Europe" },
  { heading: "Animals move west", caption: "Horses and cattle arrived in the Americas.", from: "Europe", to: "Americas" },
] }

export function getDemoAnnotations(title: string, pageCount = 2): ReaderAnnotation[] {
  if (!/columbian exchange/i.test(title)) return []
  const page = Math.min(2, Math.max(1, pageCount))
  const entries: { kind: AnnotationKind; title: string; text: string; y: number; quiz?: ReaderQuiz; video?: ReaderVideo }[] = [
    { kind: "adaptation", title: "The exchange, simply explained", text: columbian.explain, y: 0.35 },
    { kind: "quiz", title: "Check your understanding", text: "Three questions about the movement of crops, animals, and diseases.", y: 0.44, quiz: columbianQuiz },
    { kind: "translation", title: "Spanish translation", text: columbian.translate, y: 0.53 },
    { kind: "pronunciation", title: "Names and key terms", text: columbian.pronunciation, y: 0.62 },
    { kind: "video", title: "The exchange in motion", text: "A short visual explanation of how crops and animals crossed the Atlantic.", y: 0.71, video: columbianVideo },
  ]
  return entries.map((entry) => ({
    id: `demo-columbian-${entry.kind}`,
    kind: entry.kind,
    title: entry.title,
    text: entry.text,
    createdAt: 0,
    page,
    rects: [{ x: 0.88, y: entry.y, width: 0.05, height: 0.04 }],
    quiz: entry.quiz,
    video: entry.video,
    demo: true,
  }))
}

export function getMockQuiz(title: string, page: number): ReaderQuiz {
  if (/columbian exchange/i.test(title)) return columbianQuiz
  return { questions: [
    { id: "main-idea", type: "multiple-choice", prompt: `What is the main idea of the selected area on page ${page}?`, options: [{ id: "a", label: "A key concept is introduced" }, { id: "b", label: "A contrasting example is shown" }, { id: "c", label: "A conclusion is presented" }], answer: "a", explanation: "This is a preview question. OCR and AI will generate an answer grounded in the selected area." },
    { id: "recall", type: "fill-blank", prompt: "Write one key term from the selected area.", answer: "concept", explanation: "This is a preview response; the final question will use the actual PDF content." },
  ] }
}

export function getMockVideo(title: string, page: number): ReaderVideo {
  if (/columbian exchange/i.test(title)) return columbianVideo
  return { secondsPerScene: 5, scenes: [
    { heading: "Start with the page", caption: `A visual preview for page ${page} of ${title}.`, from: "Idea", to: "Context" },
    { heading: "Connect the ideas", caption: "The AI video will turn the selected area into a step-by-step visual lesson.", from: "Context", to: "Insight" },
  ] }
}

export function getMockReaderAnswer({ action, title, page, context, prompt }: {
  action: ReaderAction
  title: string
  page: number
  context: string
  prompt: string
}): string {
  if (/columbian exchange/i.test(title)) return columbian[action]

  const excerpt = context.replace(/\s+/g, " ").trim().slice(0, 180)
  const source = excerpt ? `The page begins: “${excerpt}${context.length > 180 ? "…" : ""}”` : "This page may be scanned or image-based."
  switch (action) {
    case "explain": return `Preview explanation for page ${page} of ${title}. ${source}\n\nWhen OCR and AI are connected, this space will explain the exact selected area.`
    case "quiz": return `Preview quiz for page ${page}: What is the main idea of the selected area?\n\n${source}\n\nThe final quiz will be based on the selected image after OCR is connected.`
    case "translate": return `Preview translation for page ${page}. ${source}\n\nThe selected area will be translated after OCR is connected.`
    case "pronunciation": return `Preview pronunciation for page ${page}. ${source}\n\nKey terms and spoken audio will appear here after OCR is connected.`
    case "video": return `Animated video preview for page ${page}. ${source}`
    case "ask": return `Preview answer to “${prompt.trim() || "this page"}” in ${title}. ${source}\n\nThis response is mocked while the AI reader is being built.`
  }
}
