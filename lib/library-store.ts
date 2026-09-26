"use client"

import { create } from "zustand"
import { deleteLibraryPdf, getLibraryPdf, getLibraryPdfs, saveLibraryPdf, type LibraryPdf } from "./library"

type LibraryState = {
  books: Record<string, LibraryPdf>
  ids: string[]
  loadAll: () => Promise<void>
  loadOne: (id: string, options?: { fresh?: boolean }) => Promise<LibraryPdf | undefined>
  save: (book: LibraryPdf) => Promise<void>
  remove: (id: string) => Promise<void>
}

const pendingBooks = new Map<string, Promise<LibraryPdf | undefined>>()
let pendingAll: Promise<void> | null = null

export const useLibraryStore = create<LibraryState>((set, get) => ({
  books: {},
  ids: [],
  loadAll: () => {
    if (pendingAll) return pendingAll
    pendingAll = getLibraryPdfs().then((books) => {
      set({ books: Object.fromEntries(books.map((book) => [book.id, book])), ids: books.map((book) => book.id) })
    }).finally(() => { pendingAll = null })
    return pendingAll
  },
  loadOne: (id, options) => {
    const fresh = options?.fresh === true
    const cached = fresh ? undefined : get().books[id]
    if (cached) return Promise.resolve(cached)
    const pending = fresh ? undefined : pendingBooks.get(id)
    if (pending) return pending
    const request = getLibraryPdf(id).catch(() => undefined).then(async (book) => {
      // A full-store lookup recovers entries when a direct IndexedDB read fails.
      const found = book ?? (await getLibraryPdfs()).find((item) => item.id === id)
      if (found) set((state) => ({ books: { ...state.books, [id]: found }, ids: state.ids.includes(id) ? state.ids : [...state.ids, id] }))
      return found
    }).finally(() => { if (!fresh) pendingBooks.delete(id) })
    if (!fresh) pendingBooks.set(id, request)
    return request
  },
  save: async (book) => {
    await saveLibraryPdf(book)
    set((state) => ({ books: { ...state.books, [book.id]: book }, ids: state.ids.includes(book.id) ? state.ids : [...state.ids, book.id] }))
  },
  remove: async (id) => {
    await deleteLibraryPdf(id)
    set((state) => {
      const books = { ...state.books }
      delete books[id]
      return { books, ids: state.ids.filter((item) => item !== id) }
    })
  },
}))
