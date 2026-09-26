"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  RiArrowRightLine, RiCheckLine, RiCloseLine, RiDeleteBin6Line,
  RiPauseLine, RiPictureInPicture2Line, RiPlayLine, RiRestartLine,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Slider } from "@/components/ui/slider"
import type { ReaderAnnotation, ReaderQuiz, ReaderVideo } from "@/lib/mock-annotations"

type QuizProgress = { index: number; responses: Record<string, string> }
const emptyProgress: QuizProgress = { index: 0, responses: {} }

function QuizExperience({ quiz, progress, onProgress }: { quiz: ReaderQuiz; progress: QuizProgress; onProgress: (value: QuizProgress) => void }) {
  const [index, setIndex] = useState(progress.index)
  const [responses, setResponses] = useState<Record<string, string>>(progress.responses)
  const [draft, setDraft] = useState("")
  const [submitted, setSubmitted] = useState(false)
  const reduceMotion = useReducedMotion()
  const question = quiz.questions[index]
  const finished = index >= quiz.questions.length
  const correct = !finished && draft.trim().toLocaleLowerCase() === question.answer.toLocaleLowerCase()
  const score = quiz.questions.filter((item) => responses[item.id]?.trim().toLocaleLowerCase() === item.answer.toLocaleLowerCase()).length

  function advance() {
    if (!question) return
    const nextResponses = { ...responses, [question.id]: draft.trim() }
    setResponses(nextResponses)
    setDraft("")
    setSubmitted(false)
    setIndex(index + 1)
    onProgress({ index: index + 1, responses: nextResponses })
  }

  function restart() { setIndex(0); setResponses({}); setDraft(""); setSubmitted(false); onProgress(emptyProgress) }

  return <div className="reader-quiz" aria-label="Interactive quiz">
    <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground"><span>{finished ? "Complete" : `Question ${index + 1} of ${quiz.questions.length}`}</span><span>{finished ? `${score}/${quiz.questions.length} correct` : `${Math.round((index / quiz.questions.length) * 100)}%`}</span></div>
    <Progress value={(index / quiz.questions.length) * 100} className="mt-3 gap-0 [&_[data-slot=progress-track]]:h-1" />
    <AnimatePresence mode="wait" initial={false}>
      {finished ? <motion.div key="complete" initial={reduceMotion ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="py-6">
        <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-foreground text-background"><RiCheckLine className="size-5" /></div>
        <h4 className="text-xl font-medium tracking-tight">You got {score} of {quiz.questions.length}.</h4>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Revisit the page, or try the quiz again.</p>
        <Button variant="secondary" size="sm" className="mt-5" onClick={restart}><RiRestartLine className="size-4" /> Try again</Button>
      </motion.div> : <motion.div key={question.id} initial={reduceMotion ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? undefined : { opacity: 0, x: -18 }} transition={{ duration: 0.22 }} className="py-5">
        <p className="mb-1 text-[11px] uppercase tracking-widest text-muted-foreground">{question.type === "fill-blank" ? "Fill in the blank" : "Choose one answer"}</p>
        <h4 className="mb-5 text-lg font-medium leading-7 tracking-tight">{question.prompt}</h4>
        {question.type === "multiple-choice" ? <div className="grid gap-2" role="radiogroup" aria-label={question.prompt}>{question.options.map((option, optionIndex) => <Button key={option.id} type="button" role="radio" aria-checked={draft === option.id} variant={draft === option.id ? "secondary" : "ghost"} className="reader-quiz-option" onClick={() => !submitted && setDraft(option.id)} disabled={submitted}><span className="reader-quiz-option-letter">{String.fromCharCode(65 + optionIndex)}</span><span>{option.label}</span>{draft === option.id && <RiCheckLine className="ml-auto size-4" />}</Button>)}</div> : <Input value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && draft.trim() && !submitted) setSubmitted(true) }} disabled={submitted} placeholder="Type your answer" aria-label="Your answer" className="rounded-xl bg-muted/60" />}
        {submitted && <p className={`mt-4 text-sm leading-6 ${correct ? "text-foreground" : "text-muted-foreground"}`} role="status"><strong>{correct ? "That’s right." : `Answer: ${question.type === "multiple-choice" ? question.options.find((option) => option.id === question.answer)?.label : question.answer}.`}</strong> {question.explanation}</p>}
        <Button type="button" size="sm" className="mt-5 w-full" disabled={!draft.trim()} onClick={() => submitted ? advance() : setSubmitted(true)}>{submitted ? index + 1 === quiz.questions.length ? "See results" : "Next question" : "Submit answer"}<RiArrowRightLine className="size-4" /></Button>
      </motion.div>}
    </AnimatePresence>
  </div>
}

function VideoExperience({ video }: { video: ReaderVideo }) {
  const [playing, setPlaying] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [mini, setMini] = useState(false)
  const reduceMotion = useReducedMotion()
  const duration = video.scenes.length * video.secondsPerScene
  const sceneIndex = Math.min(video.scenes.length - 1, Math.floor(seconds / video.secondsPerScene))
  const scene = video.scenes[sceneIndex]
  const sceneProgress = seconds >= duration ? 1 : (seconds % video.secondsPerScene) / video.secondsPerScene
  const formatTime = (value: number) => `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`
  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      setSeconds(Math.min(duration, seconds + 1))
      if (seconds + 1 >= duration) setPlaying(false)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [playing, seconds, duration])

  return <div className="reader-video">
    <div className={`reader-video-frame ${mini ? "reader-video-frame-mini" : ""}`} role="img" aria-label={`Animated preview: ${scene.from} to ${scene.to}`}>
      <AnimatePresence mode="wait" initial={false}><motion.div key={sceneIndex} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.25 }} className="reader-video-scene">
        <strong>{scene.heading}</strong>
        <div className="reader-video-flow"><span>{scene.from}</span><div className="reader-video-path"><motion.span animate={{ left: `${sceneProgress * 100}%` }} transition={{ duration: reduceMotion ? 0 : 0.35, ease: "linear" }} /></div><span>{scene.to}</span></div>
        {!mini && <p>{scene.caption}</p>}
      </motion.div></AnimatePresence>
    </div>
    <div className="reader-video-controls"><Button size="icon-xs" variant="ghost" aria-label={playing ? "Pause preview" : "Play preview"} onClick={() => { if (seconds >= duration) setSeconds(0); setPlaying((current) => !current) }}>{playing ? <RiPauseLine className="size-4" /> : <RiPlayLine className="size-4" />}</Button><Slider value={[seconds]} min={0} max={duration} onValueChange={(value) => setSeconds(typeof value === "number" ? value : value[0])} aria-label="Video preview position" className="reader-video-slider min-w-0 flex-1" /><span className="reader-video-time">{formatTime(seconds)} / {formatTime(duration)}</span><Button size="icon-xs" variant={mini ? "secondary" : "ghost"} aria-label={mini ? "Expand video preview" : "Compact video preview"} title={mini ? "Expand preview" : "Mini player"} onClick={() => setMini((current) => !current)}><RiPictureInPicture2Line className="size-4" /></Button></div>
  </div>
}

export function AnnotationCard({ annotation, progressKey, onClose, onDelete }: { annotation: ReaderAnnotation; progressKey: string; onClose: () => void; onDelete: () => void }) {
  const [quizOpen, setQuizOpen] = useState(false)
  const [progress, setProgress] = useState<QuizProgress>(() => {
    if (typeof window === "undefined") return emptyProgress
    try {
      const saved = JSON.parse(localStorage.getItem(progressKey) ?? "null") as QuizProgress | null
      if (saved && Number.isInteger(saved.index) && saved.index >= 0 && saved.index <= (annotation.quiz?.questions.length ?? 0) && saved.responses && typeof saved.responses === "object") return saved
    } catch { /* An invalid saved attempt should not block the quiz. */ }
    return emptyProgress
  })
  const displayTitle = /^(Quiz|Explanation|Translation|Pronunciation|Video) · Page \d+$/i.test(annotation.title)
    ? { quiz: "Check your understanding", adaptation: "In simpler terms", translation: "Translated passage", pronunciation: "How to say it", highlight: "Saved highlight", video: "See it in motion" }[annotation.kind]
    : annotation.title
  function updateProgress(next: QuizProgress) {
    setProgress(next)
    try { localStorage.setItem(progressKey, JSON.stringify(next)) } catch { /* Quiz can still be completed without storage. */ }
  }

  const score = annotation.quiz?.questions.filter((question) => progress.responses[question.id]?.trim().toLocaleLowerCase() === question.answer.toLocaleLowerCase()).length ?? 0
  return <motion.div layout="position" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 18 }} transition={{ duration: 0.2 }}>
    <Card size="sm" className="reader-annotation-card gap-0 py-0 ring-0">
      <CardHeader className="reader-annotation-card-head"><h3 className="min-w-0 text-sm font-semibold leading-5">{displayTitle}</h3><Button size="icon-sm" variant="ghost" aria-label={`Close ${annotation.title}`} onClick={onClose}><RiCloseLine className="size-4" /></Button></CardHeader>
      <CardContent className="reader-annotation-card-body">{annotation.kind === "quiz" && annotation.quiz ? <div><p className="text-sm leading-6 text-muted-foreground">{progress.index >= annotation.quiz.questions.length ? `Last attempt: ${score} of ${annotation.quiz.questions.length} correct.` : progress.index > 0 ? `Question ${progress.index + 1} of ${annotation.quiz.questions.length} is next.` : `${annotation.quiz.questions.length} quick questions about this page.`}</p><Button size="sm" className="mt-4 w-full" onClick={() => setQuizOpen(true)}>{progress.index >= annotation.quiz.questions.length ? "View results" : progress.index > 0 ? "Resume quiz" : "Start quiz"} <RiArrowRightLine className="size-4" /></Button></div> : annotation.kind === "video" && annotation.video ? <VideoExperience video={annotation.video} /> : <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{annotation.text}</p>}</CardContent>
      <CardFooter className="reader-annotation-card-foot"><Button type="button" variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${annotation.title}`} onClick={onDelete}><RiDeleteBin6Line className="size-4" /> Delete annotation</Button></CardFooter>
    </Card>
    {annotation.quiz && <Dialog open={quizOpen} onOpenChange={setQuizOpen}><DialogContent className="reader-quiz-dialog"><DialogHeader><DialogTitle>{displayTitle}</DialogTitle></DialogHeader><QuizExperience key={quizOpen ? "open" : "closed"} quiz={annotation.quiz} progress={progress} onProgress={updateProgress} /></DialogContent></Dialog>}
  </motion.div>
}
