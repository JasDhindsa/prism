# Lumen

An adaptive PDF annotation reader powered by Gemini and ElevenLabs. Node.js 22 or newer is required.

## Run locally

1. Open `.env` and fill in `GEMINI_API_KEY` and `ELEVENLABS_API_KEY`. The file already exists and is ignored by Git. `.env.example` is the shareable template.
2. Run `npm install`, then `npm run dev`.
3. Open http://127.0.0.1:3000. Restart the server after changing `.env`.

Get a Gemini key from [Google AI Studio](https://aistudio.google.com/apikey) and an ElevenLabs key from your [ElevenLabs account](https://elevenlabs.io/app/settings/api-keys). Set `ELEVENLABS_VOICE_ID` to a voice available to your account if the default voice is unavailable. The settings dialog can load account voices. The defaults are `gemini-3.8-flash` and `eleven_multilingual_v2`; models and voice are configurable without code changes.

`npm run build` type-checks the app and produces the browser and server builds. `npm start` serves the production build. `npm test` runs mocked provider and HTTP integration tests without charging either API. `npm run sample` rebuilds the three-page sample PDF.

## Features

- PDF file upload, drag and drop, and direct URL import when the source permits browser CORS. PDF.js provides the real text selection layer. Figure mode crops part of the rendered page and sends it to Gemini as image input.
- Adapt at five proficiency levels in eleven selectable languages, with Markdown and LaTeX rendering and a speakable narration script.
- Three to five passage-specific multiple-choice questions, answer explanations, narrated feedback, and prerequisite suggestions grounded in indexed page context.
- Gemini-generated four to six beat visual explainers using eight bounded SVG primitives. Optional ElevenLabs narration drives beat timing; visual-only playback also works. Completed playback contributes to the document score.
- Consistent, configurable ElevenLabs tutor voice across adaptations, feedback, and visual explainers. Audio can be downloaded as MP3. Optional automatic narration for newly generated adaptations.
- Persistent document library and annotations in IndexedDB, colored PDF highlights, page confidence map, local understanding score, and review queue for incorrect answers after 24 hours.
- Gemini study-pack summaries exported as standalone HTML with printable summary, linked annotation sections, interactive quiz choices, answer explanations, and explainer storyboards.
- Link-based study rooms with five-second annotation refresh. Participants import the identical PDF, verified by a SHA-256 fingerprint. Shared annotations and quiz outcomes are stored as atomic JSON files in `.data/rooms`. Original PDFs are not uploaded. Instructor insights aggregate visible quiz outcomes by page.

## API and storage

Keys are read only by Express. Never use `VITE_` variables for secrets. The browser talks to same-origin `/api` endpoints. Gemini uses `generateContent`, JSON-schema constrained outputs, runtime validation, and optional inline figure crops. ElevenLabs returns actual MP3 bytes. Missing keys, invalid permissions, provider quotas, network errors, and invalid model outputs are reported in the UI; there are no simulated AI answers.

The server bounds request sizes, retries transient provider server failures once, deduplicates concurrent Gemini requests, and caches recent generations and audio in memory. API health reports whether credentials are present, not whether the account has been verified. Tests use isolated fake provider responses; live provider access requires your keys and account quota.

The default host is loopback. To use study rooms across devices, run on a reachable host (`HOST=0.0.0.0`) behind your own trusted HTTPS service. A room link is a bearer link: anyone with it can read and add notes. An author token stored in the browser controls updates to their existing notes. This hackathon app has no account authentication, instructor role enforcement, or public multi-tenant deployment hardening.

## Deliberate implementation limits

Animate uses the plan's narrated SVG fallback, not server-side Manim or downloadable video. Study packs contain explainer storyboards; MP3s can be downloaded separately. The browser's review queue is checked when you use the app; it does not send background reminders. Instructor insights cover the current document/study room, not a roster across courses. Text is indexed for the first 200 pages and bounded to 40,000 characters of context per request. Password-protected PDFs are not supported. Clearing browser storage removes the local library and author token.

Selected passages, page context, figure crops, and study-pack annotation content are sent to Gemini when you generate; narration text is sent to ElevenLabs when you request audio. Shared notes are stored on the server. Keep private readings in a private local instance.
