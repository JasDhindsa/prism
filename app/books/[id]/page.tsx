"use client"

import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { RiArrowLeftLine, RiArrowRightLine, RiBookOpenLine, RiDeleteBin6Line } from "@remixicon/react"
import { AnnotationTypeIcon } from "@/components/annotation-type-icon"
import { BookCover } from "@/components/book-cover"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLibraryStore } from "@/lib/library-store"
import type { AnnotationKind, ReaderAnnotation } from "@/lib/reader-types"

const categories: { value: AnnotationKind; label: string }[] = [
  { value: "quiz", label: "Quiz" },
  { value: "adaptation", label: "Explanation" },
  { value: "translation", label: "Translation" },
  { value: "pronunciation", label: "Pronunciation" },
  { value: "highlight", label: "Highlight" },
  { value: "video", label: "Video" },
]

function formatSize(size: number) {
  return size < 1048576 ? Math.max(1, Math.round(size / 1024)) + " KB" : (size / 1048576).toFixed(1) + " MB"
}

export default function BookPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const book = useLibraryStore((state) => state.books[id] ?? null)
  const loadBook = useLibraryStore((state) => state.loadOne)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [savedAnnotations, setSavedAnnotations] = useState<ReaderAnnotation[]>([])
  const [filter, setFilter] = useState<AnnotationKind | "all">("all")

  useEffect(() => {
    let active = true
    loadBook(id)
      .catch(() => { if (active) setError("This PDF could not be loaded from your library.") })
      .finally(() => { if (active) setLoading(false) })
    function loadAnnotations() {
      try {
        const saved: unknown = JSON.parse(localStorage.getItem(`prism-annotations:${id}`) ?? "[]")
        if (Array.isArray(saved)) {
          const realAnnotations = (saved as ReaderAnnotation[]).filter((annotation) => !annotation.id?.startsWith("demo-columbian-") && !("demo" in annotation && annotation.demo))
          if (realAnnotations.length !== saved.length) localStorage.setItem(`prism-annotations:${id}`, JSON.stringify(realAnnotations))
          setSavedAnnotations(realAnnotations)
        }
      } catch {
        setError("Your annotations could not be loaded.")
      }
    }
    window.addEventListener("focus", loadAnnotations)
    window.addEventListener("storage", loadAnnotations)
    queueMicrotask(() => { if (active) loadAnnotations() })
    return () => {
      active = false
      window.removeEventListener("focus", loadAnnotations)
      window.removeEventListener("storage", loadAnnotations)
    }
  }, [id, loadBook])

  function readPdf() {
    if (!book) return
    router.push(`/books/${encodeURIComponent(book.id)}/read`)
  }

  function deleteAnnotation(annotation: ReaderAnnotation) {
    try {
      const next = savedAnnotations.filter((item) => item.id !== annotation.id)
      localStorage.setItem(`prism-annotations:${id}`, JSON.stringify(next))
      setSavedAnnotations(next)
    } catch { setError("This annotation could not be deleted.") }
  }

  const annotations = savedAnnotations
  const visibleAnnotations = annotations.filter((item) => filter === "all" || item.kind === filter)
  const heroTitleSize = (book?.title.length ?? 0) > 72
    ? "line-clamp-4 text-[clamp(2.5rem,3.5vw,4rem)] leading-[1.08] tracking-[-.05em]"
    : (book?.title.length ?? 0) > 42
      ? "line-clamp-4 text-[clamp(2.75rem,4.5vw,5rem)] leading-[1.05] tracking-[-.055em]"
      : "max-w-[14ch] text-[clamp(3.25rem,6vw,6.5rem)] leading-[1.02] tracking-[-.065em]"

  return <main className="min-h-screen bg-background text-foreground">
    <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
      <header className="flex h-[72px] items-center">
        <Link href="/" className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background"><RiBookOpenLine className="size-5" /></span>
          <span className="text-[17px] font-semibold tracking-[-0.045em]">prism<span className="text-primary">.</span></span>
        </Link>
      </header>

      {loading ? <div className="grid gap-12 pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)]">
        <div><Skeleton className="h-4 w-24" /><Skeleton className="mt-8 h-16 w-3/4" /><Skeleton className="mt-5 h-5 w-1/2" /></div>
        <Skeleton className="aspect-[0.77] w-full max-w-[420px] rounded-xl" />
      </div> : !book ? <section className="py-28 text-center">
        <h1 className="text-3xl font-medium tracking-tight">Book not found</h1>
        <p className="mt-3 text-muted-foreground">This PDF may have been removed from your library.</p>
        <Button variant="secondary" nativeButton={false} render={<Link href="/" />} className="mt-8">Back to library</Button>
      </section> : <>
        <div className="pt-8 sm:pt-12">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><RiArrowLeftLine className="size-4" /> The Library</Link>
        </div>

        <section className="grid items-start gap-12 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] lg:gap-24" aria-labelledby="book-title">
          <div className="max-w-2xl lg:pt-9">
            <p className="mb-6 text-xs font-medium uppercase tracking-[.2em] text-muted-foreground">Your library / PDF</p>
            <h1 id="book-title" className={`max-w-full break-words font-heading font-medium ${heroTitleSize}`}>{book.title}</h1>
            <p className="mt-7 text-base text-muted-foreground">A place to read, revisit, and make this book your own.</p>
            <div className="mt-10"><Button size="lg" onClick={readPdf} className="h-12 gap-2 rounded-full bg-foreground px-7 text-background hover:bg-foreground/85"><RiBookOpenLine className="size-5" /> Read PDF</Button></div>
            <p className="mt-8 text-sm text-muted-foreground">{formatSize(book.size)} <span className="mx-2">·</span> Added {new Date(book.addedAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}</p>
          </div>
          <div className="group mx-auto w-full max-w-[420px] lg:mx-0"><BookCover pdf={book} /></div>
        </section>

        <section className="border-t border-border/70 py-14 sm:py-20" aria-labelledby="about-title">
          <div className="grid gap-6 md:grid-cols-[280px_minmax(0,1fr)] md:gap-16">
            <div><p className="mb-3 text-xs font-medium uppercase tracking-[.2em] text-muted-foreground">01 / Overview</p><h2 id="about-title" className="text-3xl font-medium tracking-[-.04em]">About this book</h2></div>
            <div className="max-w-2xl text-base leading-8 text-muted-foreground">
              <p><span className="text-foreground">{book.title}</span> is a PDF in your personal library. Open the original document to start reading.</p>
              <p className="mt-5 text-sm">Original file: <span className="break-all text-foreground">{book.name}</span></p>
            </div>
          </div>
        </section>

        <section className="border-t border-border/70 py-14 sm:py-20" aria-labelledby="annotations-title">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-[.2em] text-muted-foreground">02 / Your notes</p>
              <h2 id="annotations-title" className="text-3xl font-medium tracking-[-.04em]">Your annotations <span className="text-muted-foreground">{annotations.length}</span></h2>
              <p className="mt-3 text-sm text-muted-foreground">Saved notes for this book.</p>
            </div>
            <Tabs value={filter} onValueChange={(value) => setFilter(value as AnnotationKind | "all")}>
              <TabsList variant="line" className="max-w-full overflow-x-auto">
                <TabsTrigger value="all">All</TabsTrigger>
                {categories.map((category) => <TabsTrigger key={category.value} value={category.value}>{category.label}</TabsTrigger>)}
              </TabsList>
            </Tabs>
          </div>
          {visibleAnnotations.length ? <div className="mt-9 divide-y divide-border/70">
            {visibleAnnotations.map((annotation) => <article key={annotation.id} className="flex gap-5 py-6">
              <AnnotationTypeIcon kind={annotation.kind} className="mt-1 size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-[.15em] text-muted-foreground">{categories.find((category) => category.value === annotation.kind)?.label} · Page {annotation.page}</p>
                <h3 className="mt-2 text-lg font-medium">{annotation.kind === "adaptation" ? annotation.title.replace(/^Adapted(?: passage)?/i, "Explanation") : annotation.title}</h3>
                {annotation.kind !== "pronunciation" && (annotation.text || annotation.quote) && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground" dir="auto">{annotation.text || annotation.quote}</p>}
                <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/books/${encodeURIComponent(id)}/read?annotation=${encodeURIComponent(annotation.id)}`} />} className="mt-3">
                  {annotation.kind === "video" ? "Open video" : annotation.kind === "pronunciation" ? "Open pronunciation" : "View in reader"}
                  <RiArrowRightLine className="size-4" />
                </Button>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Delete ${annotation.title}`} title="Delete annotation" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteAnnotation(annotation)}><RiDeleteBin6Line className="size-4" /></Button>
            </article>)}
          </div> : <p className="py-14 text-sm text-muted-foreground">{filter === "all" ? "No annotations saved for this book yet." : `No ${categories.find((category) => category.value === filter)?.label.toLowerCase() || filter} annotations yet.`}</p>}
        </section>

      </>}
      {error && <p role="alert" className="pb-8 text-sm text-destructive">{error}</p>}
    </div>

  </main>
}
