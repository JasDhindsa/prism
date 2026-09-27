# Prism

A local PDF library with an AI reading companion. Select a region of a PDF to get an explanation in your chosen language and response depth, create an interactive quiz, translate it, hear pronunciation, or generate a narrated visual lesson. Ask follow-up questions about the current page, including scanned pages and diagrams. Chat supports Markdown, tables, code, and mathematical notation. Use the microphone for a multilingual spoken conversation with a transcript of both sides.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. PDFs stay in IndexedDB and library state is managed with Zustand, so the reader can load a saved PDF directly after a refresh. Annotations stay in browser storage. The selected PDF region or page is sent to Gemini when an AI action is requested. Text requested for narration is sent to ElevenLabs. Voice conversations stream microphone audio directly to Gemini Live using short-lived credentials issued by the server. The page context and live transcripts are also sent to Gemini. Server credentials are never sent to the browser.

Configure these **server-only** variables in `.env.local` (or `.env`):

```dotenv
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.8-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash
GEMINI_LIVE_MODEL=gemini-3.8-live
GEMINI_LIVE_VOICE=Kore
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=ogwqBH5bbF03DSbNiRNN
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
ELEVENLABS_STT_MODEL_ID=scribe_v2
DATA_DIR=.data
```

The header keeps AI answer language and response depth settings side by side in one row: **Simple**, **Balanced**, and **In depth**. Response depth controls the wording and detail of AI output in the selected answer language; it does not measure proficiency in the PDF language or change the PDF. These preferences apply to explanations, quiz wording and feedback, translations, video captions/narration, and chat. When the document is in another language, explanatory content follows the chosen answer language’s natural register and social conventions, with relatable linguistic and everyday analogies where useful. It does not assume a reader’s nationality or replace source facts.

**Video** opens a dialog with the selected image, an optional focus, and instructions. Gemini reads that image directly without browser OCR. Text-only selections remain editable. **Quiz** previews the selected image centered in its dialog and sends it directly to Gemini without OCR, together with your optional focus and instructions. Text-only selections remain editable. **Explain** reads the selected passage and saves an explanation of its ideas, terminology, and reasoning, with examples where useful. Response depth controls how detailed and technical the explanation is. **Pronounce** reruns OCR and sends that exact text directly to ElevenLabs in its original language, without a Gemini rewrite or pronunciation guide, then opens its audio annotation. **Translate** saves a faithful translation in the header language and speaks it. Neither Pronounce nor Translate opens a review dialog.

Translation playback uses the official ElevenLabs UI **Waveform / AudioScrubber** component in a compact bottom-right player with white bars. Pronunciation playback and errors appear in the annotation card with the ElevenLabs UI scrolling waveform and no passage text. Pronunciation, translation, and chat read-aloud use ElevenLabs HTTP streaming with 24 kHz PCM: playback starts as audio arrives. Longer selections use bounded text chunks. Received audio remains available for pause, seeking, and replay; closing the player cancels the stream. Pins have space between them, source outlines, and connecting lines; hover, focus, or open a pin to highlight its selected area.

For explanation, translation, and pronunciation, selected images are read locally with Tesseract.js OCR; its worker and WASM files are copied into `public/ocr` during install/dev/build setup. Language data downloads from Tesseract’s CDN on first use. Direct actions run fresh OCR using English plus the preferred language, and show a useful error when no readable text is found. Pronunciation bypasses Gemini entirely; explanation and translation receive only the extracted passage as authoritative context.

The header microphone opens a 300 × 76 px voice tile with white bars fixed to the bottom-right viewport corner and connects directly to **Gemini Live** for native audio conversations, using the existing server-side `GEMINI_API_KEY`. The default `gemini-3.8-live` has the same published audio rates as Flash Live ($3 per million input audio tokens, $12 per million output audio tokens), and an available free tier subject to quotas; see [current Google pricing](https://ai.google.dev/gemini-api/docs/pricing). Set `GEMINI_LIVE_MODEL` to override it. ElevenLabs is still used for annotation pronunciation and video narration; it is not used for conversations.

ElevenLabs UI is installed through its official `@elevenlabs/cli` package and shadcn registry sources. The UI works with Gemini audio streams and does not require an ElevenLabs Agents subscription.

Audio is captured using an AudioWorklet, resampled to 16 kHz mono PCM, and streamed over a WebSocket. Gemini streams back 24 kHz PCM and transcripts of both speakers. Voice conversation submits a turn automatically after roughly 900 ms of quiet, with 300 ms of pre-roll to preserve the beginning of speech. The microphone remains enabled for follow-up questions, and speaking can interrupt a reply. The same header microphone also provides a manual safety toggle: click again to mute and send immediately in noisy surroundings, then click to unmute. Manual muting disables the microphone track and flushes the final partial audio packet before sending the turn boundary; no background audio is streamed while manually muted. Press Escape to end the conversation and release the microphone. The 300 × 76 px voice tile with white bars fixed to the bottom-right viewport corner uses the official ElevenLabs UI `BarVisualizer` and `Conversation` components. The card follows the ElevenLabs demo configuration: 20 bars, minimum height 15, maximum height 90, and animated demo bars. Its state follows the live session automatically; these bars illustrate conversation state rather than measuring audio amplitude. Voice transcripts remain in the session history for context, while the tile displays only the visualizer and a short state label. The voice card has no stop, interrupt, language, or state-selection buttons. Speak naturally for automatic turn detection, or use the header microphone to mute and send; press Escape to end the session. Languages are detected automatically.

The backend mints a single-session ephemeral token through the `v1alpha` REST endpoint and connects to the matching constrained WebSocket endpoint. The REST request uses `bidiGenerateContentSetup` and a field mask to lock the configured model, audio response modality, and output limit. Provider errors include their HTTP status and sanitized details. The long-lived API key stays server-side. Sessions pause after 60 seconds of inactivity or 8 minutes total; Resume starts a fresh session with a bounded recent chat history. Replies are limited to 512 output tokens and the session context uses a sliding window to contain growth. These are usage controls, not a guaranteed spending cap. Browser microphone access, WebSocket connectivity, and AudioWorklet support on HTTPS or localhost are required.

## Advanced think in chat

The chat composer has an **Advanced think** toggle for document-level questions. It searches cached passages across the PDF, then sends up to six relevant full-page images with page-labeled text evidence to Gemini. The current page and explicit page references are included where possible; broad questions without clear keyword matches use pages sampled across the document. Answers are prompted to cite page numbers, and **Pages consulted** buttons jump to those pages.

For scanned pages or pages with very little extractable text, Gemini creates searchable visual descriptions in batches. Those descriptions and the PDF text index are cached in memory for the open document, so the first request on a scanned PDF takes longer and uses additional model calls. Final answers inspect the retrieved page images directly. Retrieval uses keyword ranking over text and visual descriptions rather than vector embeddings; it does not guarantee that every relevant page is found. With the toggle off, chat retains its current-page behavior.

## Manim videos

Prism sends the selected image directly to Gemini and retrieves up to six related page-labeled text passages from the PDF. One model call creates a storyboard with formulas and animations suited to the subject. There are no separate analysis or review calls and no quality-based regeneration loops. Harmless formatting differences are normalized locally: extra labels, omitted fields, visual type aliases, frame timing, colors, and dimensions. An incomplete visual uses its available explanatory text rather than failing the entire lesson.

The trusted Manim renderer supports custom keyframes with typeset formulas, moving geometry, curves, pixel grids, and projected height surfaces, alongside the existing graph, triangle, flow, comparison, bar, and number-line templates. Persistent objects transform over the narration timeline. Mathematical lessons are prompted to include formulas alongside diagrams and meaningful custom animations. Illustrative numerical examples are allowed and visibly labeled; they must not be presented as measurements from the source. Source chart values may come from the selected image or retrieved text. The model is instructed to preserve source facts; the app does not independently prove every formula, numerical sample, or narrative claim. The server executes a trusted renderer template, never arbitrary model-written Python.

On macOS, install the renderer dependencies with Homebrew and `uv`:

```bash
brew install cairo pango pkg-config ffmpeg
uv venv --python 3.13 .venv-manim
uv pip install --python .venv-manim/bin/python -r scripts/requirements-manim.txt
```

The Python architecture must match the installed Cairo/Pango libraries (use native Apple Silicon Python with ARM Homebrew). On other systems, see [Manim installation](https://docs.manim.community/en/stable/installation/uv.html). No LaTeX installation is needed: formulas use Matplotlib Mathtext, while Manim draws the geometry and data. Optionally set `MANIM_PYTHON` to an absolute Python executable path and `FFMPEG_PATH` to an FFmpeg executable.

Detailed lessons use 6–8 scenes with definitions, reasoning, worked examples, and a recap; a quick 3–4 scene option is also available. Video generation runs in the background after submitting the selected image or text. ElevenLabs narration is generated per scene, and its timestamps determine the scene duration. Manim embeds the audio in the MP4. The player shows render progress and supports chapter seeking, a narration transcript, captions, fullscreen, video downloads, an in-app source viewer, and downloading the actual `.py` source or a ZIP containing source and narration. If speech is unavailable, the video renders with captions and an explicit message. Failed renders can be retried from the player.

Generated jobs, videos, source, audio, and captions are stored in `.data/ai/` (ignored by Git). Keep this directory to preserve existing annotation playback. New videos render at 1080p and 30 fps. The downloaded Python source can be rendered using `manim -qh --fps 30 prism-lesson.py PrismLesson`; it renders silently if the narration files are absent. For a narrated render, download the source ZIP, extract it, and run `manim -qh --fps 30 scene.py PrismLesson` with the MP3s beside the source. Temporary Gemini failures trigger a retry and fallback to the configured fallback model, then Gemini 2.5 Flash.

This implementation is intended for a trusted local, persistent Node.js server. Video jobs require local Python, child processes, and writable persistent storage. A deployment on ephemeral/serverless hosting needs a separate persistent render worker; a public multi-user deployment also needs authentication and per-user asset ownership. Requests are bounded, same-origin checked, and rate limited, but the local app does not have a user account system.

## Validation

```bash
npx tsc --noEmit
npm run build
node tests/ai-smoke.mjs
PRISM_TEST_LIVE=1 node tests/ai-smoke.mjs
```

The smoke test requires the app to be running; `PRISM_TEST_URL` overrides its URL. Live tests call the configured providers and consume API credits: they cover explanation, structured quizzes, translation, pronunciation, contextual chat, ElevenLabs speech/transcription, and creating a video job. Set `PRISM_TEST_IMAGE` to a JPEG path to exercise image reading. Results are saved under `.data/`. Provider errors are surfaced to the reader instead of returning mock answers.
