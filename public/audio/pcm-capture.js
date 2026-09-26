// Resample microphone audio to 16 kHz mono PCM in the audio thread.
class PrismPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = []
    this.position = 0
    this.chunk = []
  }
  process(inputs) {
    const input = inputs[0]?.[0]
    if (!input) return true
    for (let i = 0; i < input.length; i++) this.samples.push(input[i])
    const ratio = sampleRate / 16000
    while (this.position + 1 < this.samples.length) {
      const index = Math.floor(this.position)
      const fraction = this.position - index
      const value = this.samples[index] * (1 - fraction) + this.samples[index + 1] * fraction
      this.chunk.push(Math.max(-1, Math.min(1, value)))
      this.position += ratio
      if (this.chunk.length === 1600) {
        const pcm = new ArrayBuffer(3200)
        const view = new DataView(pcm)
        let sum = 0
        for (let i = 0; i < this.chunk.length; i++) {
          const value = this.chunk[i]
          sum += value * value
          view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true)
        }
        this.port.postMessage({ pcm, rms: Math.sqrt(sum / this.chunk.length) }, [pcm])
        this.chunk = []
      }
    }
    const consumed = Math.floor(this.position)
    this.samples.splice(0, consumed)
    this.position -= consumed
    return true
  }
}
registerProcessor("prism-pcm-capture", PrismPcmCapture)
