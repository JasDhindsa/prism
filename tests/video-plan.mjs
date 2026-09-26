import assert from "node:assert/strict"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { typescriptLoader } from "./load-typescript.mjs"
const object = (id, kind, text, x = 0) => ({ id, kind, text, x, y: 0, width: 3, height: 1, color: "#6ADFD4", points: [], values: [], columns: 0 })
const animation = { type: "animation", labels: [], values: [], points: [], illustrative: true, frames: [
  { at: 0, objects: [object("formula", "formula", "w=d"), object("pixel", "circle", "", -2)] },
  { at: 0.6, objects: [object("formula", "formula", "w=dr"), object("pixel", "circle", "", 2)] },
] }
const scene = (visual) => ({ heading: "Weights preserve the edge", caption: "Illustrative weight change", narration: "An illustrative example demonstrates how spatial and intensity weights combine.", visual })
const generic = { title: "Bad plan", summary: "Generic labels", scenes: Array.from({ length: 3 }, () => scene({ type: "flow", labels: ["Input", "Output"], values: [], points: [], illustrative: false, frames: [] })) }
const requests = []
const plans = [generic]
const load = typescriptLoader({ "./gemini": { generateContent: async (input, instruction) => { requests.push({ input, instruction }); return JSON.stringify(plans.shift()) } } })
const { generateVideoPlan } = load("lib/ai/reader.ts")
const image = "data:image/jpeg;base64,aGVsbG8="
const plan = await generateVideoPlan({ action: "video", image, detailed: false })
assert.equal(requests.length, 1, "Planning uses one model call")
assert.ok(requests.every((request) => request.input.image === image), "Image is sent directly")
assert.ok(plan.scenes.every((scene) => scene.visual.type === "flow"), "Usable plans are accepted without quality quotas")
const { validateAnimation, normalizeVideoVisual } = load("lib/ai/video-animation.ts")
assert.equal(validateAnimation(animation.frames).length, 2)
assert.equal(validateAnimation(animation.frames.map((frame) => ({ ...frame, at: 0 })))[1].at, 0.8, "Frame timing is repaired locally")
assert.equal(normalizeVideoVisual({ type: "flowchart", labels: ["A", "B", "C", "D", "E"] }, "Idea").labels.length, 4)
assert.equal(normalizeVideoVisual({ type: "unknown", labels: ["Keep this explanation"] }, "Idea").type, "comparison")
assert.equal(validateAnimation(animation.frames.map((frame) => ({ ...frame, objects: [object("f", "formula", "\\input{secret}")] })))[0].objects[0].text, "")
console.log("PASS: one-call planning, direct image input, local visual normalization and safe formula handling")
if (process.env.PRISM_VIDEO_IMAGE) {
  const live = typescriptLoader()("lib/ai/reader.ts")
  const jpeg = readFileSync(process.env.PRISM_VIDEO_IMAGE)
  const result = await live.generateVideoPlan({ action: "video", image: `data:image/jpeg;base64,${jpeg.toString("base64")}`, language: "English", detailed: false, prompt: "Teach the concept in this image with formulas, animated charts and diagrams that make it easy to understand." })
  mkdirSync(".data/video-quality", { recursive: true })
  writeFileSync(".data/video-quality/plan.json", JSON.stringify(result, null, 2))
  console.log("PASS: live image storyboard saved to .data/video-quality/plan.json")
}
