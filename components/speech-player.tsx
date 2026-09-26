"use client"
import { RiCloseLine, RiPauseLine, RiPlayLine, RiVolumeUpLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useSelectionSpeech } from "@/hooks/use-selection-speech"

export function SpeechPlayer({ text, label = "Read aloud", language }: { text: string; label?: string; language?: string }) {
  const player = useSelectionSpeech()
  const loading = player.phase === "processing" || player.phase === "preparing"
  function speak() {
    const signal = player.begin(label)
    void player.play(text, language, signal)
  }
  return <div className="mt-3">
    {player.open && player.phase !== "error" ? <div className="flex items-center gap-2" role="group" aria-label={label}>
      <Button variant="secondary" size="icon-sm" disabled={loading} aria-label={player.phase === "playing" ? "Pause audio" : "Play audio"} onClick={player.toggle}>{loading ? <Spinner className="size-3.5" /> : player.phase === "playing" ? <RiPauseLine className="size-3.5" /> : <RiPlayLine className="size-3.5" />}</Button>
      <input type="range" min={0} max={player.duration || 1} step={0.1} value={player.position} disabled={!player.duration} onChange={(event) => player.seek(Number(event.target.value))} aria-label="Audio playback position" className="min-w-0 flex-1" />
      <span className="text-xs tabular-nums" role="status">{loading ? "Streaming…" : `${Math.floor(player.position)} / ${Math.floor(player.duration)}s`}</span>
      <Button variant="ghost" size="icon-sm" aria-label="Stop audio" onClick={player.close}><RiCloseLine className="size-3.5" /></Button>
    </div> : <Button variant="secondary" size="sm" onClick={speak}><RiVolumeUpLine className="size-3.5" />{label}</Button>}
    {player.error && <p role="alert" className="mt-2 text-xs leading-5 text-destructive">{player.error}</p>}
  </div>
}
