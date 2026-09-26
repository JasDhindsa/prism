"use client"

import { createPortal } from "react-dom"
import { BarVisualizer, type AgentState } from "@/components/ui/bar-visualizer"
import type { VoicePhase } from "@/hooks/use-voice-conversation"

const labels: Record<VoicePhase, string> = {
  idle: "Ready", connecting: "Connecting…", listening: "Listening",
  transcribing: "Hearing you…", thinking: "Thinking…", speaking: "Speaking", paused: "Paused · tap mic",
}

export function VoiceConversation({ open, phase, error }: { open: boolean; phase: VoicePhase; error: string }) {
  if (!open || typeof document === "undefined") return null
  const state: AgentState | undefined = phase === "connecting" ? "connecting" : phase === "transcribing" ? "initializing" : phase === "thinking" ? "thinking" : phase === "speaking" ? "speaking" : phase === "listening" ? "listening" : undefined
  return createPortal(<aside className="reader-voice-mini" aria-label="Voice conversation" title={error || "Use the header microphone to end the conversation"}>
    <BarVisualizer state={state} demo={phase !== "idle" && phase !== "paused"} barCount={20} minHeight={15} maxHeight={90} className="reader-voice-mini-bars" aria-hidden="true" />
    <span className="reader-voice-mini-status" role={error ? "alert" : "status"}>{error ? "Connection paused · tap mic" : labels[phase]}</span>
    {error && <span className="sr-only">{error}</span>}
  </aside>, document.body)
}
