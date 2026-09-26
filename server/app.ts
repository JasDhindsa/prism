import express, { type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { z } from 'zod';
import { actionSchemas, annotationSchema, generationSchema, narrationSchema, type Action } from '../shared/contracts.js';
import { ApiError, createProviders, type Fetcher } from './providers.js';
import { createRoomStore } from './rooms.js';
import type { Config } from './config.js';

export function createApp(config: Config, fetcher?: Fetcher) {
  const app = express(); const providers = createProviders(config, fetcher); const rooms = createRoomStore(path.join(config.dataDir, 'rooms'));
  app.disable('x-powered-by');
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff'); next(); });
  // Require same-origin browser mutations. No API keys or permissive CORS are exposed to the client.
  app.use('/api', (req, _res, next) => {
    const origin = req.get('origin');
    if (origin && origin !== `${req.protocol}://${req.get('host')}`) return next(new ApiError(403, 'Cross-origin API requests are disabled.'));
    next();
  });
  const requests = new Map<string, { count: number; until: number }>();
  app.use('/api', (req, _res, next) => {
    if (req.method === 'GET') return next();
    const key = req.ip || 'local'; let bucket = requests.get(key);
    if (!bucket || bucket.until < Date.now()) { bucket = { count: 0, until: Date.now() + 60000 }; requests.set(key, bucket); }
    if (++bucket.count > 40) return next(new ApiError(429, 'Too many requests. Wait a minute before trying again.'));
    if (requests.size > 10000) for (const [ip, b] of requests) if (b.until < Date.now()) requests.delete(ip);
    next();
  });
  app.use('/api', express.json({ limit: '4mb' }));
  app.get('/api/health', (_req, res) => res.json({ gemini: { configured: !!config.geminiKey, model: config.geminiModel }, elevenlabs: { configured: !!config.elevenKey, model: config.elevenModel, voiceId: config.voiceId }, animation: 'svg' }));
  app.post('/api/generate/:action', async (req, res) => {
    const action = req.params.action as Action;
    if (!Object.hasOwn(actionSchemas, action)) throw new ApiError(404, 'Unknown annotation action.');
    res.json(await providers.generate(action, generationSchema.parse(req.body)));
  });
  app.post('/api/narrate', async (req, res) => {
    const input = narrationSchema.parse(req.body); const bytes = await providers.narrate(input.text, input.voiceId);
    res.type('audio/mpeg').send(bytes);
  });
  app.get('/api/voices', async (_req, res) => res.json(await providers.voices()));
  app.post('/api/rooms', async (req, res) => {
    const input = z.object({ documentId: z.string().regex(/^[a-f0-9]{64}$/), documentName: z.string().trim().min(1).max(300) }).parse(req.body);
    res.status(201).json(await rooms.create(input.documentId, input.documentName));
  });
  app.get('/api/rooms/:id', async (req, res) => res.json(await rooms.get(req.params.id)));
  app.post('/api/rooms/:id/annotations', async (req, res) => {
    const input = z.object({ owner: z.uuid(), annotation: annotationSchema }).parse(req.body);
    res.json(await rooms.put(req.params.id, input.owner, input.annotation));
  });
  app.use('/api', (_req, _res, next) => next(new ApiError(404, 'API route not found.')));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request. Select a shorter passage or check the supplied options.', code: 'INVALID_REQUEST' });
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message, code: error.code });
    if ((error as { type?: string }).type === 'entity.too.large') return res.status(413).json({ error: 'The selection is too large. Select a smaller diagram or passage.' });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON request.' });
    console.error('Request failed:', error instanceof Error ? error.name : 'UnknownError');
    return res.status(500).json({ error: 'The server could not complete this request. Please try again.' });
  });
  return app;
}
