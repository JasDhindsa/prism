import 'dotenv/config';
import path from 'node:path';
export type Config = { geminiKey: string; geminiModel: string; elevenKey: string; voiceId: string; elevenModel: string; port: number; host: string; dataDir: string };
export function readConfig(env = process.env): Config {
  const clean = (v?: string) => !v || /^(your[_-]|replace|paste|<)/i.test(v.trim()) ? '' : v.trim();
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  return { geminiKey: clean(env.GEMINI_API_KEY), geminiModel: env.GEMINI_MODEL || 'gemini-3.8-flash',
    elevenKey: clean(env.ELEVENLABS_API_KEY), voiceId: env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb',
    elevenModel: env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2', port, host: env.HOST || '127.0.0.1', dataDir: path.resolve(env.DATA_DIR || '.data') };
}
