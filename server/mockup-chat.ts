/* Lot 5B (5B-5) — réponse d'Atelier SANS IA dans la discussion d'une maquette : on rassemble ce qui existe déjà, avec la source et le niveau
   de chaque élément. Rien n'est inventé ; ce qu'Atelier ne sait pas est dit tel quel. Module pur (ni base, ni réseau). */
import type {Suggestion} from './mockup-guide.ts';

export interface ChatSource { kind: 'block' | 'rule' | 'feature' | 'decision' | 'history'; label: string; level: 'verified' | 'reported' | 'hypothesis' | 'confirmed'; ref: string }
export interface ChatContext {
  question: string;
  block: { id: string; label: string; kind_label: string; x: number; y: number; w: number; h: number; group: string; fill: string; text_color: string; behavior: string } | null;
  group_mates: string[];
  suggestions: Suggestion[];
  feature: { code: string; name: string; state_label: string; life_label: string } | null;
  decisions: { title: string; reason: string; reliability_word: string; source_ref: string }[];
  passages: { title: string; excerpt: string; date: string }[];
  conclusions: string[];
}
const q = (s: string) => `« ${s} »`;
const LEVEL: Record<ChatSource['level'], string> = { verified: 'Vérifié', reported: 'Rapporté', hypothesis: 'Hypothèse', confirmed: 'Confirmé par vous' };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Mots utiles d'une question (4 lettres ou plus, sans les mots vides courants), pour chercher dans l'historique. */
export function keywords(text: string): string[] {
  const stop = new Set(['dans', 'avec', 'pour', 'mais', 'plus', 'cette', 'faut', 'bien', 'quoi', 'comme', 'sont', 'est-ce', 'mettre', 'etre', 'avoir', 'tout', 'tous', 'elle', 'elles', 'nous', 'vous', 'leur', 'quel', 'quelle', 'faire', 'ceci', 'cela', 'alors', 'aussi', 'encore', 'entre', 'sous', 'vers', 'chez']);
  return [...new Set(norm(text).split(/[^a-z0-9-]+/).filter((w) => w.length >= 4 && !stop.has(w)))].slice(0, 6);
}
export function contextAnswer(c: ChatContext): { body: string; sources: ChatSource[] } {
  const lines: string[] = [], src: ChatSource[] = [];
  const add = (s: ChatSource, text: string) => { src.push(s); lines.push(`- ${text} [${LEVEL[s.level]}]`); };
  lines.push(c.block ? `Ce qu'Atelier sait déjà sur ${q(c.block.label)}, sans IA :` : 'Ce qu’Atelier sait déjà sur cette page, sans IA :');
  if (c.block) {
    const b = c.block;
    add({ kind: 'block', label: b.label, level: 'verified', ref: 'maquette' }, `${b.kind_label} à ${b.x} px du bord gauche et ${b.y} px du haut, ${b.w} × ${b.h} px${b.group ? `, dans le groupe ${q(b.group)}${c.group_mates.length ? ` avec ${c.group_mates.map(q).join(', ')}` : ''}` : ', sans groupe'}${b.fill ? `, fond ${b.fill}` : ''}${b.text_color ? `, texte ${b.text_color}` : ''}${b.behavior ? `. Comportement prévu : ${b.behavior}` : ''}.`);
  }
  for (const s of c.suggestions) add({ kind: 'rule', label: s.source.label, level: s.level === 'verified' ? 'verified' : s.level, ref: s.source.url || s.rule }, `${s.title} : ${s.detail} (règle : ${s.source.label}).`);
  if (c.feature) add({ kind: 'feature', label: c.feature.code, level: 'reported', ref: c.feature.code }, `Fonctionnalité liée ${c.feature.code} ${q(c.feature.name)} : ${c.feature.state_label}, ${c.feature.life_label} dans le suivi du projet.`);
  for (const d of c.decisions) add({ kind: 'decision', label: d.title, level: d.reliability_word === 'Confirmé par vous' ? 'confirmed' : d.reliability_word === 'Vérifié' ? 'verified' : d.reliability_word === 'Hypothèse' ? 'hypothesis' : 'reported', ref: d.source_ref || 'décision du projet' },
    `Décision actuelle ${q(d.title)}${d.reason ? ` : ${d.reason}` : ''}${d.source_ref ? ` (source : ${d.source_ref})` : ''}.`);
  for (const p of c.passages) add({ kind: 'history', label: p.title, level: 'reported', ref: p.title }, `Historique importé, ${q(p.title)}${p.date ? ` (${p.date.slice(0, 10)})` : ''} : « ${p.excerpt} »`);
  for (const x of c.conclusions) add({ kind: 'decision', label: 'Conclusion déjà confirmée', level: 'confirmed', ref: 'discussion' }, `Vous avez déjà conclu : ${x}`);
  if (src.length === (c.block ? 1 : 0)) lines.push(c.block ? '- Aucune règle, décision, fonctionnalité ni passage de l’historique ne concerne ce bloc.' : '- Aucune règle, décision ni passage de l’historique ne concerne cette question.');
  lines.push('', 'Atelier ne juge pas à votre place : il rassemble ce qui existe. Pour un avis, demandez une IA (réponse marquée Hypothèse), puis confirmez vous-même la conclusion.');
  return { body: lines.join('\n'), sources: src };
}
/** Texte envoyé à l'IA : la question, puis le contexte d'Atelier. Jamais d'image, jamais de secret. */
export function aiPrompt(question: string, context: string): string {
  return [
    'Tu aides Martin, qui n’est pas développeur, à décider de la mise en page d’un écran de téléphone (360 px de large) de son site.',
    'Réponds en français simple, en 8 lignes au plus. Appuie-toi d’abord sur le contexte ci-dessous ; si tu ajoutes un avis personnel, dis-le. N’invente aucune règle ni aucun chiffre.',
    '', 'Question de Martin :', question.slice(0, 1500), '', 'Contexte rassemblé par Atelier (sans IA) :', context.slice(0, 6000),
  ].join('\n');
}
