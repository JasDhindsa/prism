import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import vm from "node:vm"
const require = createRequire(import.meta.url)
const ts = require("typescript")
const starts = [], nodes = [], state = []
const contexts = []
class AudioContext {
  constructor() { contexts.push(this); this.currentTime = 0; this.state = "running"; this.destination = {} }
  async resume() {}
  async close() {}
  createBuffer(channels, length, rate) {
    const samples = new Float32Array(length)
    return { length, duration: length / rate, getChannelData: () => samples }
  }
  createBufferSource() {
    const node = { connect() {}, disconnect() {}, stop() { this.stopped = true }, start(...args) { starts.push({ node: this, args }) } }
    nodes.push(node)
    return node
  }
}
let stream, requestSignal
const compiledModule = { exports: {} }
const code = ts.transpileModule(readFileSync("hooks/use-selection-speech.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
vm.runInNewContext(code, {
  module: compiledModule, exports: compiledModule.exports,
  require: () => ({ useRef: (current) => ({ current }), useState: (initial) => { const index = state.length; state.push(initial); return [initial, (value) => { state[index] = value }] }, useEffect: () => {} }),
  window: { AudioContext }, AbortController, Uint8Array, DataView,
  cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
  fetch: async (url, options) => {
    assert.equal(JSON.parse(options.body).stream, true)
    requestSignal = options.signal
    return { ok: true, body: new ReadableStream({ start(controller) { stream = controller } }) }
  },
})
const tick = () => new Promise((resolve) => setImmediate(resolve))
const player = compiledModule.exports.useSelectionSpeech()
const signal = player.begin("Pronunciation")
let complete = false
const playback = player.play("Hello", "en", signal).then(() => { complete = true })
await tick()
stream.enqueue(new Uint8Array([0, 64, 0])) // Split a PCM sample between packets.
await tick()
assert.equal(starts.length, 1, "Playback must begin before the stream completes")
assert.equal(complete, false)
assert.equal(starts[0].node.buffer.getChannelData(0)[0], 0.5)
stream.enqueue(new Uint8Array([128, 0, 32]))
await tick()
assert.equal(starts.length, 2, "Subsequent audio is queued during playback")
assert.equal(starts[1].node.buffer.getChannelData(0)[0], -1)
assert.equal(starts[1].args[0], starts[0].node.buffer.duration, "Chunks are scheduled continuously")
contexts.at(-1).currentTime = 0.00002
player.toggle()
assert.ok(nodes.every((node) => node.stopped), "Pause stops all scheduled audio")
stream.enqueue(new Uint8Array([0, 16]))
await tick()
assert.equal(starts.length, 2, "New audio must remain paused")
stream.close()
await playback
assert.equal(state[2], "paused")
player.toggle()
await tick()
assert.equal(starts.length, 3)
assert.equal(starts[2].node.buffer.length, 4, "Resume includes audio received during pause")
player.close()
assert.equal(requestSignal.aborted, true, "Close cancels the request")
assert.equal(state[2], "idle")
console.log("PASS: early streaming playback, split PCM samples, continuous queue, pause/resume, and cancellation")
