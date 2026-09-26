"use client"
import { useEffect, useRef, useState } from "react"

export type SelectionSpeechPhase = "idle" | "processing" | "preparing" | "playing" | "paused" | "ended" | "error"
function speechChunks(text: string) {
  const parts: string[] = []
  let remaining = text.trim()
  while (remaining.length > 6000) {
    let at = remaining.lastIndexOf("\n", 6000)
    if (at < 3000) at = remaining.lastIndexOf(" ", 6000)
    if (at < 3000) at = 6000
    parts.push(remaining.slice(0, at).trim()); remaining = remaining.slice(at).trim()
  }
  if (remaining) parts.push(remaining)
  return parts
}

export function useSelectionSpeech() {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [phase, setPhase] = useState<SelectionSpeechPhase>("idle")
  const [error, setError] = useState("")
  const [data, setData] = useState<number[]>([])
  const [duration, setDuration] = useState(0)
  const [position, setPosition] = useState(0)
  const mounted = useRef(true)
  const phaseRef = useRef<SelectionSpeechPhase>("idle")
  const context = useRef<AudioContext | null>(null)
  const buffer = useRef<AudioBuffer | null>(null)
  const source = useRef<AudioBufferSourceNode | null>(null)
  const queued = useRef<AudioBufferSourceNode[]>([])
  const nextTime = useRef(0)
  const streaming = useRef(false)
  const controller = useRef<AbortController | null>(null)
  const offset = useRef(0)
  const started = useRef(0)
  const frame = useRef(0)
  const playbackVersion = useRef(0)

  function transition(value: SelectionSpeechPhase) { phaseRef.current = value; if (mounted.current) setPhase(value) }
  function stopSource() {
    playbackVersion.current++; cancelAnimationFrame(frame.current)
    for (const node of queued.current) { node.onended = null; try { node.stop() } catch { /* Already ended. */ } node.disconnect() }
    queued.current = []
    if (source.current) { source.current.onended = null; try { source.current.stop() } catch { /* Already ended. */ } source.current.disconnect(); source.current = null }
  }
  function release() {
    controller.current?.abort(); streaming.current = false; stopSource(); buffer.current = null
    void context.current?.close().catch(() => undefined); context.current = null
  }
  function close() { release(); transition("idle"); if (mounted.current) setOpen(false) }
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; release() }
    // Resource cleanup reads current refs rather than render-time closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function begin(title: string) {
    release(); controller.current = new AbortController()
    setOpen(true); setLabel(title); setError(""); setData([]); setDuration(0); setPosition(0); offset.current = 0
    transition("processing")
    try {
      const Context = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      context.current = new Context()
      void context.current.resume().catch(() => undefined)
    } catch { setError("This browser could not start audio playback."); transition("error"); controller.current.abort() }
    return controller.current.signal
  }

  async function startAt(time: number) {
    const ctx = context.current, audio = buffer.current
    if (!ctx || !audio) return
    stopSource()
    const version = playbackVersion.current
    try {
      await ctx.resume()
      if (version !== playbackVersion.current || ctx !== context.current) return
      if (ctx.state !== "running") throw new Error("Press play to enable audio in your browser.")
      offset.current = Math.min(Math.max(time, 0), audio.duration)
      const node = ctx.createBufferSource(); node.buffer = audio; node.connect(ctx.destination)
      source.current = node; started.current = ctx.currentTime
      transition("playing"); setError("")
      nextTime.current = ctx.currentTime + Math.max(0, audio.duration - offset.current)
      queued.current = [node]
      attachEnd(node, version)
      node.start(0, offset.current)
      let lastUpdate = 0
      function tick(now: number) {
        if (version !== playbackVersion.current || phaseRef.current !== "playing") return
        if (now - lastUpdate > 100) { setPosition(Math.min(buffer.current?.duration || audio!.duration, offset.current + ctx!.currentTime - started.current)); lastUpdate = now }
        frame.current = requestAnimationFrame(tick)
      }
      frame.current = requestAnimationFrame(tick)
    } catch {
      if (version === playbackVersion.current) { transition("paused"); setError("Press play to enable audio playback.") }
    }
  }
  function attachEnd(node: AudioBufferSourceNode, version: number) {
    node.onended = () => {
      node.disconnect()
      if (version !== playbackVersion.current) return
      queued.current = queued.current.filter((item) => item !== node)
      source.current = queued.current[queued.current.length - 1] || null
      if (source.current) return
      cancelAnimationFrame(frame.current)
      offset.current = buffer.current?.duration || 0; setPosition(offset.current)
      transition(streaming.current ? "preparing" : "ended")
    }
  }
  function queueAudio(audio: AudioBuffer) {
    const ctx = context.current
    if (!ctx) return
    const node = ctx.createBufferSource(); node.buffer = audio; node.connect(ctx.destination)
    queued.current.push(node); source.current = node
    attachEnd(node, playbackVersion.current)
    const time = Math.max(ctx.currentTime, nextTime.current)
    node.start(time); nextTime.current = time + audio.duration
  }
  async function play(text: string, language: string | undefined, signal: AbortSignal) {
    const ctx = context.current
    if (signal.aborted || !ctx) return
    transition("preparing")
    try {
      if (!text.trim()) throw new Error("There is no text to pronounce. Select a readable passage first.")
      streaming.current = true
      const decoded: AudioBuffer[] = []
      let carry: number | undefined
      for (const chunk of speechChunks(text)) {
        const response = await fetch("/api/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: chunk, language, stream: true }), signal })
        if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Speech could not be generated.") }
        if (!response.body) throw new Error("Speech streaming is unavailable.")
        const reader = response.body.getReader()
        try {
          while (!signal.aborted) {
            const { value, done } = await reader.read()
            if (signal.aborted) return
            if (done) break
            const bytes = carry === undefined ? value : new Uint8Array([carry, ...value])
            const sampleCount = Math.floor(bytes.length / 2)
            carry = bytes.length % 2 ? bytes[bytes.length - 1] : undefined
            if (!sampleCount) continue
            const audio = ctx.createBuffer(1, sampleCount, 24000)
            const samples = audio.getChannelData(0)
            const view = new DataView(bytes.buffer, bytes.byteOffset, sampleCount * 2)
            for (let index = 0; index < sampleCount; index++) samples[index] = view.getInt16(index * 2, true) / 32768
            decoded.push(audio)
            // Keep received audio for pause, seeking, and replay while new chunks play.
            const length = decoded.reduce((sum, item) => sum + item.length, 0)
            const combined = ctx.createBuffer(1, length, 24000)
            let at = 0
            for (const item of decoded) { combined.getChannelData(0).set(item.getChannelData(0), at); at += item.length }
            buffer.current = combined
            setDuration(combined.duration)
            const values = combined.getChannelData(0)
            const peaks = Array.from({ length: 96 }, (_, index) => {
              const first = Math.floor(index * length / 96), end = Math.floor((index + 1) * length / 96)
              let peak = 0
              for (let sample = first; sample < end; sample += Math.max(1, Math.floor((end - first) / 160))) peak = Math.max(peak, Math.abs(values[sample]))
              return peak
            })
            const maximum = Math.max(.001, ...peaks)
            setData(peaks.map((peak) => Math.max(.03, peak / maximum)))
            if (phaseRef.current !== "paused") {
              if (!source.current) await startAt(offset.current)
              else queueAudio(audio)
            }
          }
        } finally { await reader.cancel().catch(() => undefined) }
        if (carry !== undefined) throw new Error("The speech stream ended with incomplete audio.")
      }
      streaming.current = false
      if (!decoded.length) throw new Error("ElevenLabs returned no audio.")
      if (!source.current && phaseRef.current !== "paused") transition("ended")
    } catch (caught) {
      if (!signal.aborted) { streaming.current = false; stopSource(); setError(caught instanceof Error ? caught.message : "Speech could not be played."); transition("error") }
    }
  }
  function toggle() {
    if (phaseRef.current === "playing") {
      offset.current += (context.current?.currentTime || 0) - started.current
      stopSource(); setPosition(offset.current); transition("paused")
    } else void startAt(phaseRef.current === "ended" ? 0 : offset.current)
  }
  function seek(time: number) {
    if (!buffer.current) return
    if (phaseRef.current === "playing") void startAt(time)
    else { stopSource(); offset.current = time; setPosition(time); transition("paused") }
  }
  function fail(message: string) { if (mounted.current) { setError(message); transition("error") } }
  return { open, label, phase, error, data, duration, position, begin, play, toggle, seek, close, fail }
}
