# Prism

A local PDF library with an AI reading companion. Select a region of a PDF to adapt it to your language and proficiency, create an interactive quiz, translate it, hear pronunciation, or generate a narrated visual lesson. Ask follow-up questions about the current page, including scanned pages and diagrams. Chat supports Markdown, tables, code, and mathematical notation. Use the microphone for a multilingual spoken conversation with a transcript of both sides.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. PDFs and annotations stay in browser storage. The selected PDF region or page is sent to Gemini when an AI action is requested. Text requested for narration is sent to ElevenLabs. Voice conversations stream microphone audio directly to Gemini Live using short-lived credentials issued by the server. The page context and live transcripts are also sent to Gemini. Server credentials are never sent to the browser.

Configure these **server-only** variables in `.env.local` (or `.env`):

```dotenv
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_LIVE_VOICE=Kore
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=JBFqnCBsd6RMkjVDRZzb
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_STT_MODEL_ID=scribe_v2
DATA_DIR=.data
```

The header keeps native language and reading proficiency settings side by side in one row: **Basic**, **Intermediate**, and **Advanced**. These preferences apply to adaptations, quiz wording and feedback, translations, video captions/narration, and chat. When the document is in another language, explanatory content follows the native language’s natural register and social conventions, with relatable linguistic and everyday analogies where useful. It does not assume a reader’s nationality or replace source facts.

**Video and Quiz** open an editable review dialog with OCR text, topic, and instructions before generation. **Adapt** reruns OCR for each request and saves only a rewritten passage matched to the chosen proficiency; Advanced preserves technical vocabulary and nuance rather than simplifying. **Pronounce** reruns OCR and sends that exact text directly to ElevenLabs in its original language, without a Gemini rewrite or pronunciation guide. **Translate** saves a faithful translation in the header language and speaks it. Neither Pronounce nor Translate opens a review dialog or automatically opens an annotation popover.

Pronunciation and translation playback use the official ElevenLabs UI **Waveform / AudioScrubber** component in a compact bottom-right player with white bars. The waveform is computed from the generated audio and supports pause/replay and seeking. Longer selections are synthesized in bounded chunks and played as one decoded audio buffer. Saved annotations use this same waveform player for playback. Pins have space between them, source outlines, and connecting lines; hover, focus, or open a pin to highlight its selected area.

Selected images are read locally with Tesseract.js OCR; its worker and WASM files are copied into `public/ocr` during install/dev/build setup. Language data downloads from Tesseract’s CDN on first use. Direct actions run fresh OCR using English plus the preferred language, and show a useful error when no readable text is found. Pronunciation bypasses Gemini entirely; adaptation and translation receive only the extracted passage as authoritative context.

The header microphone opens a 300 × 76 px voice tile with white bars fixed to the bottom-right viewport corner and connects directly to **Gemini Live** for native audio conversations, using the existing server-side `GEMINI_API_KEY`. The default `gemini-3.8-live` has the same published audio rates as Flash Live ($3 per million input audio tokens, $12 per million output audio tokens), and an available free tier subject to quotas; see [current Google pricing](https://ai.google.dev/gemini-api/docs/pricing). Set `GEMINI_LIVE_MODEL` to override it. ElevenLabs is still used for annotation pronunciation and video narration; it is not used for conversations.

ElevenLabs UI is installed through its official `@elevenlabs/cli` package and shadcn registry sources. The UI works with Gemini audio streams and does not require an ElevenLabs Agents subscription.

Audio is captured using an AudioWorklet, resampled to 16 kHz mono PCM, and streamed over a WebSocket. Gemini streams back 24 kHz PCM and transcripts of both speakers. Microphone silence stays local, with 300 ms of pre-roll and 900 ms of pause detection to preserve spoken phrases. Speaking interrupts a reply; the Interrupt button also clears queued audio. The 300 × 76 px voice tile with white bars fixed to the bottom-right viewport corner uses the official ElevenLabs UI `BarVisualizer` and `Conversation` components. The card follows the ElevenLabs demo configuration: 20 bars, minimum height 15, maximum height 90, and animated demo bars. Its state follows the live session automatically; these bars illustrate conversation state rather than measuring audio amplitude. Voice transcripts remain in the session history for context, while the tile displays only the visualizer and a short state label. The voice card has no stop, interrupt, language, or state-selection buttons. Speak naturally to interrupt; use the header microphone to end or resume the conversation. Languages are detected automatically.

The backend mints a single-session ephemeral token through the `v1alpha` REST endpoint and connects to the matching constrained WebSocket endpoint. The REST request uses `bidiGenerateContentSetup` and a field mask to lock the configured model, audio response modality, and output limit. Provider errors include their HTTP status and sanitized details. The long-lived API key stays server-side. Sessions pause after 60 seconds of inactivity or 8 minutes total; Resume starts a fresh session with a bounded recent chat history. Replies are limited to 512 output tokens and the session context uses a sliding window to contain growth. These are usage controls, not a guaranteed spending cap. Browser microphone access, WebSocket connectivity, and AudioWorklet support on HTTPS or localhost are required.

## Manim videos

Prism generates a source-grounded storyboard with Gemini and compiles it into a complete **Manim Community** Python scene. Visuals include geometry, transforming equations, graphs, animated flows, comparisons, bars, and number lines. Generated text and numbers are validated data; the server does not execute arbitrary model-written Python. The lesson uses a dark background and color-coded animation inspired by 3Blue1Brown. It does not clone a creator's voice.

On macOS, install the renderer dependencies with Homebrew and `uv`:

```bash
brew install cairo pango pkg-config ffmpeg
uv venv --python 3.13 .venv-manim
uv pip install --python .venv-manim/bin/python -r scripts/requirements-manim.txt
```

The Python architecture must match the installed Cairo/Pango libraries (use native Apple Silicon Python with ARM Homebrew). On other systems, see [Manim installation](https://docs.manim.community/en/stable/installation/uv.html). No LaTeX installation is needed: the generated scenes use text, Unicode equations, and geometry. Optionally set `MANIM_PYTHON` to an absolute Python executable path and `FFMPEG_PATH` to an FFmpeg executable.

Detailed lessons use 6–8 scenes with definitions, reasoning, worked examples, and a recap; a quick 3–4 scene option is also available. Video generation runs in the background after submitting the reviewed source. ElevenLabs narration is generated per scene, and its timestamps determine the scene duration. Manim embeds the audio in the MP4. The player shows render progress and supports chapter seeking, a narration transcript, captions, fullscreen, video downloads, an in-app source viewer, and downloading the actual `.py` source or a ZIP containing source and narration. If speech is unavailable, the video renders with captions and an explicit message. Failed renders can be retried from the player.

Generated jobs, videos, source, audio, and captions are stored in `.data/ai/` (ignored by Git). Keep this directory to preserve existing annotation playback. The downloaded Python source can be rendered using `manim -qm prism-lesson.py PrismLesson`; it renders silently if the narration files are absent. For a narrated render, download the source ZIP, extract it, and run `manim -qm scene.py PrismLesson` with the MP3s beside the source. Temporary Gemini failures trigger a retry and fallback to the configured fallback model, then Gemini 2.5 Flash.

This implementation is intended for a trusted local, persistent Node.js server. Video jobs require local Python, child processes, and writable persistent storage. A deployment on ephemeral/serverless hosting needs a separate persistent render worker; a public multi-user deployment also needs authentication and per-user asset ownership. Requests are bounded, same-origin checked, and rate limited, but the local app does not have a user account system.

## Validation

```bash
npx tsc --noEmit
npm run build
node tests/ai-smoke.mjs
PRISM_TEST_LIVE=1 node tests/ai-smoke.mjs
```

The smoke test requires the app to be running; `PRISM_TEST_URL` overrides its URL. Live tests call the configured providers and consume API credits: they cover explanation, structured quizzes, translation, pronunciation, contextual chat, ElevenLabs speech/transcription, and creating a video job. Set `PRISM_TEST_IMAGE` to a JPEG path to exercise image reading. Results are saved under `.data/`. Provider errors are surfaced to the reader instead of returning mock answers.
