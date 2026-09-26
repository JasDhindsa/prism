import { copyFile, mkdir, readdir } from "node:fs/promises"
import { createRequire } from "node:module"
import path from "node:path"
const require = createRequire(import.meta.url)
const destination = path.resolve("public/ocr")
const workerRoot = path.dirname(require.resolve("tesseract.js/package.json"))
const coreRoot = path.dirname(require.resolve("tesseract.js-core/package.json"))
await mkdir(destination, { recursive: true })
await copyFile(path.join(workerRoot, "dist/worker.min.js"), path.join(destination, "worker.min.js"))
for (const file of await readdir(coreRoot)) {
  if (/^tesseract-core.*\.(wasm|wasm\.js)$/.test(file)) await copyFile(path.join(coreRoot, file), path.join(destination, file))
}
console.log("Prism OCR assets are ready.")
