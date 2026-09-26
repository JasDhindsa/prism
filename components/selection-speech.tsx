"use client"
import { createPortal } from "react-dom"
import { RiCloseLine, RiPauseLine, RiPlayLine } from "@remixicon/react"
import { AudioScrubber, Waveform } from "@/components/ui/waveform"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import type { useSelectionSpeech } from "@/hooks/use-selection-speech"

type Props = { player: ReturnType<typeof useSelectionSpeech> }
export function SelectionSpeech({ player }: Props) {
  if (!player.open || typeof document === "undefined") return null
  const loading = player.phase === "processing" || player.phase === "preparing"
  return createPortal(<aside className="reader-selection-audio" aria-label={player.label}>
    <div className="reader-selection-audio-heading"><span>{player.label}</span><Button variant="ghost" size="icon-xs" aria-label="Close audio player" onClick={player.close}><RiCloseLine className="size-3.5" /></Button></div>
    <div className="reader-selection-audio-body">
      <Button variant="ghost" size="icon-sm" aria-label={player.phase === "playing" ? "Pause audio" : "Play audio"} onClick={player.toggle} disabled={loading || !player.data.length}>{loading ? <Spinner className="size-3.5" /> : player.phase === "playing" ? <RiPauseLine className="size-4" /> : <RiPlayLine className="size-4" />}</Button>
      {player.data.length ? <AudioScrubber data={player.data} currentTime={player.position} duration={player.duration} onSeek={player.seek} height={32} barWidth={2} barGap={2} barColor="#ffffff" showHandle={false} className="reader-selection-waveform" aria-label="Audio playback position" aria-valuetext={`${Math.floor(player.position)} of ${Math.floor(player.duration)} seconds`} onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "Home" || event.key === "End") {
          event.preventDefault()
          player.seek(event.key === "Home" ? 0 : event.key === "End" ? player.duration : Math.max(0, Math.min(player.duration, player.position + (event.key === "ArrowRight" ? 5 : -5))))
        }
      }} /> : <Waveform data={Array(60).fill(.05)} height={32} barWidth={2} barGap={2} barColor="#ffffff" className="reader-selection-waveform" aria-hidden="true" />}
    </div>
    <span role="status" className="reader-selection-audio-status">{player.phase === "processing" ? "Reading your selection…" : player.phase === "preparing" ? "Preparing audio…" : player.phase === "ended" ? "Finished" : player.phase === "paused" ? "Paused" : player.phase === "playing" ? `${Math.floor(player.position / 60)}:${String(Math.floor(player.position % 60)).padStart(2, "0")} / ${Math.floor(player.duration / 60)}:${String(Math.floor(player.duration % 60)).padStart(2, "0")}` : "Audio unavailable"}</span>
    {player.error && <p role="alert" className="reader-selection-audio-error">{player.error}</p>}
  </aside>, document.body)
}
