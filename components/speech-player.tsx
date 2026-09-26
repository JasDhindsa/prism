"use client"
import { useEffect, useRef, useState } from "react"
import { RiVolumeUpLine } from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function SpeechPlayer({ text, label = "Read aloud", language }: { text: string; label?: string; language?: string }) {
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const controller = useRef<AbortController | null>(null)
  useEffect(() => () => { controller.current?.abort() }, [])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  async function speak() {
    if (loading) return
    setLoading(true); setError("")
    controller.current = new AbortController()
    try {
      const response = await fetch("/api/speech", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language }), signal: controller.current.signal })
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Speech could not be generated.") }
      setUrl(URL.createObjectURL(await response.blob()))
    } catch (caught) {
      if (!controller.current.signal.aborted) setError(caught instanceof Error ? caught.message : "Speech could not be generated.")
    } finally { if (!controller.current.signal.aborted) setLoading(false) }
  }
  return <div className="mt-3">
    {url ? <audio controls autoPlay src={url} className="h-9 w-full max-w-full" aria-label={label} onError={() => setError("This browser could not play the audio.")} /> : <Button variant="secondary" size="sm" disabled={loading} onClick={() => void speak()}>{loading ? <Spinner className="size-3.5" /> : <RiVolumeUpLine className="size-3.5" />}{loading ? "Preparing audio…" : label}</Button>}
    {error && <p role="alert" className="mt-2 text-xs leading-5 text-destructive">{error}</p>}
  </div>
}
