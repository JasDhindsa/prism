"use client"

import { useRouter } from "next/navigation"
import { BookCover } from "@/components/book-cover"
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react"
import {
  RiAddLine, RiArrowDownSLine, RiBookOpenLine, RiDeleteBinLine,
  RiDownloadLine, RiMore2Line, RiSearchLine, RiUploadCloud2Line,
} from "@remixicon/react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { deleteLibraryPdf, getLibraryPdfs, saveLibraryPdf, type LibraryPdf } from "@/lib/library"

type Filter = "all" | "opened" | "unopened"
type Sort = "recent" | "title" | "oldest"

function titleFromFilename(name: string) {
  return name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Untitled document"
}

function formatSize(size: number) {
  return size < 1048576 ? Math.max(1, Math.round(size / 1024)) + " KB" : (size / 1048576).toFixed(1) + " MB"
}

export default function Home() {
  const router = useRouter()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pdfs, setPdfs] = useState<LibraryPdf[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<Sort>("recent")
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    getLibraryPdfs()
      .then(setPdfs)
      .catch(() => setError("Your local library could not be loaded. Please refresh and try again."))
      .finally(() => setLoading(false))
  }, [])

  const openedCount = pdfs.filter((pdf) => pdf.lastOpenedAt !== null).length
  const visiblePdfs = useMemo(() => {
    const query = search.trim().toLocaleLowerCase()
    return pdfs
      .filter((pdf) => !query || pdf.title.toLocaleLowerCase().includes(query) || pdf.name.toLocaleLowerCase().includes(query))
      .filter((pdf) => filter === "all" || (filter === "opened" ? pdf.lastOpenedAt !== null : pdf.lastOpenedAt === null))
      .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "oldest" ? a.addedAt - b.addedAt : b.addedAt - a.addedAt)
  }, [pdfs, search, filter, sort])

  async function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files)
    if (!incoming.length) return
    setError("")
    setAdding(true)
    const added: LibraryPdf[] = []
    let invalid = 0
    for (const file of incoming) {
      try {
        const signature = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer())
        if (!file.name.toLowerCase().endsWith(".pdf") || signature !== "%PDF-") {
          invalid++
          continue
        }
        const pdf: LibraryPdf = {
          id: crypto.randomUUID(), name: file.name, title: titleFromFilename(file.name),
          size: file.size, addedAt: Date.now(), lastOpenedAt: null, file,
        }
        await saveLibraryPdf(pdf)
        added.push(pdf)
      } catch {
        setError("A PDF could not be saved. Your browser storage may be full.")
      }
    }
    if (added.length) {
      setPdfs((current) => [...current, ...added])
      setFilter("all")
      setSearch("")
    }
    if (invalid) setError(invalid + (invalid === 1 ? " file was skipped because it is" : " files were skipped because they are") + " not a valid PDF.")
    setAdding(false)
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void addFiles(event.target.files)
    event.target.value = ""
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragging(false)
    void addFiles(event.dataTransfer.files)
  }

  function readPdf(pdf: LibraryPdf) {
    router.push(`/books/${encodeURIComponent(pdf.id)}/read`)
  }

  function openPdf(pdf: LibraryPdf) {
    router.push(`/books/${encodeURIComponent(pdf.id)}`)
  }

  function downloadPdf(pdf: LibraryPdf) {
    const url = URL.createObjectURL(pdf.file)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = pdf.name
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  async function removePdf(pdf: LibraryPdf) {
    if (!window.confirm("Remove “" + pdf.title + "” from your library?")) return
    try {
      await deleteLibraryPdf(pdf.id)
      setPdfs((current) => current.filter((item) => item.id !== pdf.id))
    } catch {
      setError("This PDF could not be removed. Please try again.")
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground"
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }}
      onDrop={onDrop}>
      <input ref={fileInput} className="sr-only" type="file" accept=".pdf,application/pdf" multiple onChange={onFileChange} aria-label="Choose PDF files" />
      {dragging && <div className="pointer-events-none fixed inset-3 z-50 flex flex-col items-center justify-center gap-3 rounded-2xl bg-background/95 text-lg font-medium shadow-2xl ring-2 ring-inset ring-primary/50"><RiUploadCloud2Line className="size-10 text-primary" /><span>Drop PDFs to add them to your library</span></div>}

      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <header className="flex h-[72px] items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-foreground text-background"><RiBookOpenLine className="size-5" /></div>
            <span className="text-[17px] font-semibold tracking-[-0.045em]">prism<span className="text-primary">.</span></span>
          </div>
        </header>

        <section className="flex items-center justify-between gap-6 pb-5 pt-7 text-center">
          <div className="flex flex-col items-start">
            <h1 className="font-heading text-4xl font-medium  sm:text-5xl">The Library</h1>
            <p className="mt-3 text-sm text-muted-foreground">A quiet place for everything you want to read.</p>
          </div>
          <Button size="lg" className="h-10 gap-2 rounded-xl bg-foreground px-4 text-background hover:bg-foreground/85" disabled={adding} onClick={() => fileInput.current?.click()}>
            <RiAddLine className="size-4" />{adding ? "Adding PDFs…" : "Add new PDF"}
          </Button>
        </section>

        {pdfs.length > 0 && <section aria-label="Library controls" className="mb-7 mt-7 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center">
          <div className="relative w-full sm:max-w-64">
            <RiSearchLine className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground" />
            <Input className="h-9 rounded-lg border-0 bg-muted/60 pl-10 placeholder:text-muted-foreground/70 focus-visible:ring-1" placeholder="Search your library..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search your library" />
          </div>
          <Tabs className="justify-self-center" value={filter} onValueChange={(value) => setFilter(value as Filter)}>
            <TabsList className="h-9 bg-muted/60">
              <TabsTrigger value="all">All <span className="text-xs opacity-55">{pdfs.length}</span></TabsTrigger>
              <TabsTrigger value="opened">Opened <span className="text-xs opacity-55">{openedCount}</span></TabsTrigger>
              <TabsTrigger value="unopened">Unread <span className="text-xs opacity-55">{pdfs.length - openedCount}</span></TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="justify-self-center sm:justify-self-end">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" className="h-9 justify-between gap-2 rounded-lg bg-muted/40 px-3" />}>
                {sort === "recent" ? "Recently added" : sort === "oldest" ? "Oldest first" : "Title A–Z"}<RiArrowDownSLine />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSort("recent")}>Recently added</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSort("oldest")}>Oldest first</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSort("title")}>Title A–Z</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </section>}

        {error && <div role="alert" className="mb-6 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

        {loading ? <div className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 pb-20 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => <div key={index}><Skeleton className="aspect-[0.77] w-full rounded-xl" /><Skeleton className="mt-4 h-4 w-3/4" /><Skeleton className="mt-2 h-3 w-1/2" /></div>)}
        </div> : visiblePdfs.length ? <div className="grid grid-cols-2 gap-x-5 gap-y-10 pb-20 sm:grid-cols-3 sm:gap-x-7 lg:grid-cols-4 xl:grid-cols-5">
          {visiblePdfs.map((pdf) => <article key={pdf.id} className="group min-w-0">
            <button className="block w-full rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/60" onClick={() => openPdf(pdf)} aria-label={"Open " + pdf.title}><BookCover pdf={pdf} /></button>
            <div className="mt-4 flex min-w-0 items-start justify-between gap-2">
              <div className="min-w-0">
                <button className="block max-w-full truncate text-left text-[15px] font-medium tracking-[-0.02em] transition-colors hover:text-primary" onClick={() => openPdf(pdf)}>{pdf.title}</button>
                <p className="mt-1.5 text-xs text-muted-foreground">{pdf.lastOpenedAt ? "Opened" : "Not started"} <span className="mx-1.5 text-border">·</span> {formatSize(pdf.size)}</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="-mr-1 -mt-1 shrink-0 rounded-lg text-muted-foreground" aria-label={"More options for " + pdf.title} />}><RiMore2Line /></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => readPdf(pdf)}><RiBookOpenLine /> Read PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => downloadPdf(pdf)}><RiDownloadLine /> Download</DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => void removePdf(pdf)}><RiDeleteBinLine /> Remove from library</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </article>)}
        </div> : pdfs.length === 0 ? <div className="flex min-h-[calc(100vh-220px)] flex-col items-center justify-center pb-12 text-center">
          <div className="relative mb-8 h-52 w-64" aria-hidden="true">
            <div className="absolute left-[4%] top-[18%] h-40 w-28 -rotate-[15deg] rounded-lg bg-[#b87662] p-3.5 text-[#29201e] shadow-xl">
              <div className="h-full border border-current/40 p-2"><div className="mt-8 h-px w-8 bg-current" /><div className="mt-2 w-14 font-serif text-[10px] font-bold leading-tight">NOTES<br />FROM HERE</div></div>
            </div>
            <div className="absolute left-[27%] top-[3%] z-10 h-48 w-32 rotate-[2deg] rounded-lg bg-[#68786e] p-3.5 text-[#f1ead7] shadow-2xl">
              <div className="flex h-full flex-col justify-between border border-current/40 p-2.5"><span className="text-[7px] font-bold tracking-[.18em]">A SMALL COLLECTION</span><span className="font-serif text-[17px] font-semibold leading-[1.05]">The art<br />of slowing<br />down</span><span className="border-t border-current/50 pt-2 text-[7px] tracking-[.18em]">VOLUME 01</span></div>
            </div>
            <div className="absolute left-[58%] top-[20%] h-40 w-28 rotate-[13deg] rounded-lg bg-[#d5b77b] p-3.5 text-[#332a1d] shadow-xl">
              <div className="flex h-full flex-col justify-between border border-current/40 p-2"><span className="text-[7px] font-bold tracking-[.18em]">FIELD NOTES</span><span className="font-serif text-[13px] font-semibold leading-tight">A study<br />in light</span><span className="text-[10px]">✳</span></div>
            </div>
          </div>
          <h1 className="text-xl font-medium tracking-[-.04em]">No PDFs added</h1>
        </div> : <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <span>No PDFs match this search or filter.</span>
          <Button variant="link" className="h-auto p-0 text-foreground" onClick={() => { setSearch(""); setFilter("all") }}>Clear filters</Button>
        </div>}

      </div>
    </main>
  )
}
