import express from 'express';
import path from 'node:path';
import { createApp } from './app.js';
import { readConfig } from './config.js';

const config = readConfig(); const app = createApp(config);
if (process.env.NODE_ENV === 'production' || process.argv[1]?.endsWith('.js')) {
  app.use(express.static(path.resolve('dist')));
  app.get('/{*path}', (_req, res) => res.sendFile(path.resolve('dist/index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.listen(config.port, config.host, () => {
  console.log(`Lumen is ready at http://${config.host}:${config.port}`);
  console.log(`Gemini: ${config.geminiKey ? 'configured' : 'add GEMINI_API_KEY to .env'} · ElevenLabs: ${config.elevenKey ? 'configured' : 'add ELEVENLABS_API_KEY to .env'}`);
});
