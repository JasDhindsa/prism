export type LibraryPdf = {
  id: string
  name: string
  title: string
  size: number
  addedAt: number
  lastOpenedAt: number | null
  file: Blob
}

const DB_NAME = "prism-library"
const STORE = "pdfs"

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function query<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode)
    const request = action(transaction.objectStore(STORE))
    let result: T
    request.onsuccess = () => { result = request.result }
    transaction.oncomplete = () => { db.close(); resolve(result) }
    transaction.onerror = () => { db.close(); reject(transaction.error) }
    transaction.onabort = () => { db.close(); reject(transaction.error) }
  })
}

export const getLibraryPdfs = () => query<LibraryPdf[]>("readonly", (store) => store.getAll())
export const getLibraryPdf = (id: string) => query<LibraryPdf | undefined>("readonly", (store) => store.get(id))
export const saveLibraryPdf = (pdf: LibraryPdf) => query<IDBValidKey>("readwrite", (store) => store.put(pdf))
export const deleteLibraryPdf = (id: string) => query<undefined>("readwrite", (store) => store.delete(id))
