import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Annotation } from '../shared/contracts.js';
import { ApiError } from './providers.js';
type Room = { id: string; documentId: string; documentName: string; createdAt: number; annotations: Record<string, { owner: string; annotation: Annotation }> };
export function createRoomStore(directory: string) {
  let queue = Promise.resolve();
  async function read(id: string): Promise<Room> {
    if (!/^[a-f0-9]{32}$/.test(id)) throw new ApiError(400, 'Invalid study room link.');
    try { return JSON.parse(await readFile(path.join(directory, `${id}.json`), 'utf8')); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ApiError(404, 'This study room does not exist on this server.'); throw error; }
  }
  async function write(room: Room) {
    await mkdir(directory, { recursive: true });
    const target = path.join(directory, `${room.id}.json`);
    await writeFile(`${target}.tmp`, JSON.stringify(room), { mode: 0o600 }); await rename(`${target}.tmp`, target);
  }
  function serialized<T>(fn: () => Promise<T>) {
    const task = queue.then(fn); queue = task.then(() => undefined, () => undefined); return task;
  }
  return {
    async create(documentId: string, documentName: string) {
      const room: Room = { id: randomBytes(16).toString('hex'), documentId, documentName, createdAt: Date.now(), annotations: {} };
      await serialized(() => write(room)); return { id: room.id };
    },
    async get(id: string) {
      const room = await read(id);
      return { id: room.id, documentId: room.documentId, documentName: room.documentName, annotations: Object.values(room.annotations).map(v => v.annotation) };
    },
    async put(id: string, owner: string, annotation: Annotation) {
      return serialized(async () => {
        const room = await read(id);
        if (annotation.documentId !== room.documentId) throw new ApiError(400, 'This annotation belongs to a different document.');
        const existing = room.annotations[annotation.id];
        if (existing && existing.owner !== owner) throw new ApiError(403, 'Only the author can update this annotation.');
        if (!existing && Object.keys(room.annotations).length >= 1000) throw new ApiError(400, 'This room has reached its annotation limit.');
        room.annotations[annotation.id] = { owner, annotation }; await write(room); return { ok: true };
      });
    }
  };
}
