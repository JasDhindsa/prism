import { get, set } from 'idb-keyval';
import type { Annotation, LocalDocument, QuizResult, StudyPackResult, AdaptResult, AnimationResult, PrerequisiteResult } from '../shared/contracts';
export type Health = { gemini: { configured: boolean; model: string }; elevenlabs: { configured: boolean; model: string; voiceId: string }; animation: string };
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(130000) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `Request failed (${response.status}).`); }
  return response.json();
}
export async function speech(text: string, voiceId?: string) {
  const response = await fetch('/api/narrate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voiceId: voiceId || undefined }), signal: AbortSignal.timeout(130000) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || 'Narration failed.'); }
  return URL.createObjectURL(await response.blob());
}
export async function fingerprint(bytes: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer))).map(n => n.toString(16).padStart(2, '0')).join(''); }
export async function loadDocuments(): Promise<LocalDocument[]> { return (await get('lumen-documents')) || []; }
export async function saveDocuments(documents: LocalDocument[]) { await set('lumen-documents', documents); }
export function download(content: Blob | string, filename: string, type = 'text/html') {
  const url = URL.createObjectURL(typeof content === 'string' ? new Blob([content], { type }) : content);
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function escapeHtml(text: string) { return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!); }
export function exportPack(name: string, pack: StudyPackResult, annotations: Annotation[]) {
  const e = escapeHtml;
  const notes = annotations.map((a, i) => {
    let body = '';
    if (a.type === 'adapt') { const d = a.data as AdaptResult; body = `<p class="prose">${e(d.explanation)}</p><p><strong>Key idea:</strong> ${e(d.takeaway)}</p>`; }
    if (a.type === 'quiz') { const d = a.data as QuizResult; body = d.questions.map(q => `<fieldset><legend>${e(q.question)}</legend>${q.options.map((o, index) => `<label><input type="radio" name="${a.id}-${e(q.id)}" value="${index}" data-correct="${q.answerIndex}"/> ${e(o)}</label>`).join('')}<details><summary>Check answer and explanation</summary><p>${e(q.options[q.answerIndex])}</p><p>${e(q.explanation)}</p></details></fieldset>`).join(''); }
    if (a.type === 'animate') { const d = a.data as AnimationResult; body = `<p>Visual explainer storyboard</p>${d.beats.map((b, index) => `<details ${index === 0 ? 'open' : ''}><summary>${index+1}. ${e(b.title)}</summary><p>${e(b.caption)}</p><p>${e(b.labels.join(' → '))}</p>${b.equation ? `<p>${e(b.equation)}</p>` : ''}<p>${e(b.narration)}</p></details>`).join('')}`; }
    if (a.type === 'prerequisites') { body = (a.data as PrerequisiteResult).suggestions.map(s => `<p><strong>${e(s.concept)}</strong> · ${s.page ? `Page ${s.page}` : 'Background knowledge'}</p><p>${e(s.review)}</p>`).join(''); }
    return `<section id="note-${i}"><p class="meta">${e(a.type)} · Page ${a.selection.page} · ${e(a.author)}</p><h2>${e(a.data.title)}</h2><blockquote>${e(a.selection.text || 'Selected diagram')}</blockquote>${body}</section>`;
  }).join('');
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(pack.title)}</title><style>body{max-width:800px;margin:40px auto;padding:0 24px;color:#173a35;font:17px/1.7 system-ui}h1{font:40px Georgia}h2{font:28px Georgia}section{border-top:1px solid #cfd9d5;padding:30px 0}a{color:#275bba}blockquote{border-left:3px solid #cfd9d5;padding-left:16px;color:#63746c}label{display:block;margin:8px 0}fieldset{border:1px solid #cfd9d5;border-radius:8px;margin:24px 0;padding:16px}summary{cursor:pointer}details{margin:12px 0}button{padding:10px 20px}.prose{white-space:pre-wrap}.meta{font-size:13px;text-transform:uppercase;letter-spacing:.08em}@media print{button{display:none}#summary{break-after:page}details{display:block}section{break-inside:avoid}}</style><body><button onclick="window.print()">Print / save as PDF</button><article id="summary"><p class="meta">LUMEN STUDY PACK · ${e(name)}</p><h1>${e(pack.title)}</h1><p class="prose">${e(pack.summary)}</p><h2>Key ideas</h2><ul>${pack.keyIdeas.map(v => `<li>${e(v)}</li>`).join('')}</ul><h2>Review plan</h2><ol>${pack.reviewPlan.map(v => `<li>${e(v)}</li>`).join('')}</ol><nav>${annotations.map((a,i) => `<p><a href="#note-${i}">${e(a.data.title)} · page ${a.selection.page}</a></p>`).join('')}</nav></article>${notes}</body></html>`;
  download(html, `${name.replace(/\.pdf$/i, '')}-study-pack.html`);
}
