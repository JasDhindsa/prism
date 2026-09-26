import { z } from 'zod';

export const levels = ['ELI5', 'Beginner', 'Intermediate', 'Advanced', 'Expert'] as const;
export const languages = ['English', 'Spanish', 'French', 'German', 'Hindi', 'Portuguese', 'Japanese', 'Chinese', 'Arabic', 'Korean', 'Italian'] as const;
export const primitiveNames = ['equation', 'flow', 'bars', 'vectors', 'circle', 'curve', 'array', 'concept_map'] as const;
const text = z.string().min(1).max(12000);
const short = z.string().min(1).max(300);
export const adaptSchema = z.object({ title: short, explanation: text, takeaway: z.string().min(1).max(2000), narration: text });
export const quizSchema = z.object({ title: short, questions: z.array(z.object({
  id: short, question: z.string().min(1).max(2000), options: z.array(z.string().min(1).max(2000)).length(4),
  answerIndex: z.number().int().min(0).max(3), explanation: z.string().min(1).max(3000), concept: short
})).min(3).max(5) });
export const beatSchema = z.object({
  title: short, narration: z.string().min(1).max(2500), primitive: z.enum(primitiveNames),
  labels: z.array(z.string().min(1).max(120)).min(1).max(6),
  values: z.array(z.number().min(-1000).max(1000)).max(8),
  equation: z.string().max(500), caption: z.string().min(1).max(1000)
});
export const animateSchema = z.object({ title: short, beats: z.array(beatSchema).min(4).max(6) });
export const prerequisiteSchema = z.object({ title: short, suggestions: z.array(z.object({
  concept: short, reason: z.string().min(1).max(2000), review: z.string().min(1).max(3000),
  page: z.number().int().min(0).max(10000)
})).min(1).max(5) });
export const studyPackSchema = z.object({ title: short, summary: text, keyIdeas: z.array(z.string().min(1).max(2000)).min(1).max(10), reviewPlan: z.array(z.string().min(1).max(1000)).min(1).max(8) });
export const actionSchemas = { adapt: adaptSchema, quiz: quizSchema, animate: animateSchema, prerequisites: prerequisiteSchema, 'study-pack': studyPackSchema };
export type Action = keyof typeof actionSchemas;
export type AdaptResult = z.infer<typeof adaptSchema>;
export type QuizResult = z.infer<typeof quizSchema>;
export type AnimationResult = z.infer<typeof animateSchema>;
export type PrerequisiteResult = z.infer<typeof prerequisiteSchema>;
export type StudyPackResult = z.infer<typeof studyPackSchema>;
export const selectionSchema = z.object({ text: z.string().max(12000).default(''), page: z.number().int().min(1).max(10000),
  image: z.string().max(2800000).regex(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/).optional()
}).refine(v => v.text.trim().length > 0 || !!v.image, 'Select text or a diagram first.');
export const generationSchema = z.object({ selection: selectionSchema, level: z.enum(levels).default('Intermediate'),
  language: z.enum(languages).default('English'), context: z.string().max(40000).default('') });
export const narrationSchema = z.object({ text: z.string().trim().min(1).max(10000), voiceId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional() });
export type Rect = { x: number; y: number; width: number; height: number };
export type Selection = { text: string; page: number; image?: string; rects: Rect[] };
export const annotationSchema = z.object({
  id: z.uuid(), documentId: z.string().regex(/^[a-f0-9]{64}$/), type: z.enum(['adapt', 'quiz', 'animate', 'prerequisites']),
  author: z.string().trim().min(1).max(60), createdAt: z.number().positive(),
  selection: z.object({ text: z.string().max(12000), page: z.number().int().min(1).max(10000),
    rects: z.array(z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1), width: z.number().min(0).max(1), height: z.number().min(0).max(1) })).max(500) }),
  data: z.union([adaptSchema, quizSchema, animateSchema, prerequisiteSchema]),
  answers: z.record(z.string(), z.number().int().min(0).max(3)).default({}),
  reviewAt: z.record(z.string(), z.number()).default({}), watched: z.boolean().default(false)
}).superRefine((a, ctx) => {
  if (!actionSchemas[a.type].safeParse(a.data).success) ctx.addIssue({ code: 'custom', message: 'Annotation content does not match its type.' });
  if (a.type === 'quiz') {
    const ids = new Set((a.data as QuizResult).questions.map(q => q.id));
    if (Object.keys(a.answers).some(id => !ids.has(id))) ctx.addIssue({ code: 'custom', message: 'Unknown quiz question.' });
  }
});
export type Annotation = z.infer<typeof annotationSchema>;
export type LocalDocument = { id: string; name: string; bytes: Uint8Array; pages: number; annotations: Annotation[]; updatedAt: number; roomId?: string };
export function mastery(annotations: Annotation[]) {
  let correct = 0, total = 0;
  for (const a of annotations) if (a.type === 'quiz') for (const q of (a.data as QuizResult).questions) {
    if (a.answers[q.id] !== undefined) { total++; if (a.answers[q.id] === q.answerIndex) correct++; }
  }
  const engagement = Math.min(20, annotations.filter(a => a.type === 'adapt').length * 4 + annotations.filter(a => a.type === 'animate' && a.watched).length * 6);
  return { score: total ? Math.round(80 * correct / total + engagement) : engagement, correct, total, engagement };
}
