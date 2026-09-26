import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
const require = createRequire(import.meta.url)
const ts = require("typescript")
export function typescriptLoader(overrides = {}) {
  const cache = new Map()
  function load(file) {
    file = path.resolve(file)
    if (cache.has(file)) return cache.get(file).exports
    const compiled = { exports: {} }
    cache.set(file, compiled)
    const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
    const imports = (name) => {
      if (overrides[name]) return overrides[name]
      if (name.startsWith(".")) return load(path.resolve(path.dirname(file), name + ".ts"))
      return require(name)
    }
    new Function("require", "exports", "module", code)(imports, compiled.exports, compiled)
    return compiled.exports
  }
  return load
}
