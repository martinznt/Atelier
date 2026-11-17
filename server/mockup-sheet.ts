/* Lot 5B (5B-3) — fiche de mise en page et texte de mission, par RÈGLES FIXES (aucune IA).
   Mêmes blocs → même texte, mot pour mot. Atelier ne promet pas la reproduction au pixel : il donne une liste de contrôle à vérifier sur le téléphone.
   Ce module est pur : ni base, ni réseau. */
import {BLOCK_LABEL,type BlockKind} from './mockup-core.ts';

export const SHEET_VERSION = 1;
export interface SheetBlock { id: string; kind: string; label: string; x: number; y: number; w: number; h: number; group: string; fill: string; text_color: string; behavior: string; feature: { code: string; name: string } | null }
export interface StartBlock { id: string; kind: string; label: string; x: number; y: number; w: number; h: number; group_name: string | null; fill: string; text_color: string; behavior: string; feature_id: string | null }
export interface PaletteInfo { key: string; label: string; file: string; commit: string; colors: { token: string; hex: string; line: number }[]; files: string[] }
export interface SheetInput {
  title: string; page_name: string; screen_width: number; screen_height: number;
  blocks: SheetBlock[]; start: StartBlock[] | null; start_at: string | null; palette: PaletteInfo | null;
  features: Record<string, { code: string; name: string }>;
}
export type Change =
  | { t: 'added'; id: string; label: string }
  | { t: 'removed'; id: string; label: string }
  | { t: 'moved'; id: string; label: string; from: [number, number]; to: [number, number]; under: string | null }
  | { t: 'resized'; id: string; label: string; from: [number, number]; to: [number, number] }
  | { t: 'regrouped'; id: string; label: string; from: string; to: string }
  | { t: 'recolored'; id: string; label: string; part: 'fill' | 'text_color'; from: string; to: string }
  | { t: 'renamed'; id: string; label: string; from: string }
  | { t: 'retyped'; id: string; label: string; from: string; to: string }
  | { t: 'behavior'; id: string; label: string; to: string }
  | { t: 'feature'; id: string; label: string; to: string };

const q = (s: string) => `« ${s} »`;
const kindLabel = (k: string) => BLOCK_LABEL[k as BlockKind] ?? k;
/** Ordre de lecture : de haut en bas, puis de gauche à droite (deux blocs à moins de 8 px de hauteur sont sur la même ligne). Stable. */
export function readingOrder<T extends { x: number; y: number; id: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (Math.abs(a.y - b.y) <= 8 ? a.x - b.x || a.id.localeCompare(b.id) : a.y - b.y));
}
/** Nom d'une couleur : le jeton du site s'il existe (ex. --accent), sinon le code seul. */
export function colorName(hex: string, palette: PaletteInfo | null): string {
  if (!hex) return 'aucune';
  const c = palette?.colors.find((x) => x.hex === hex);
  return c ? `${c.token} (${hex})` : `${hex} (hors palette du site)`;
}
/** Le bloc juste au-dessus : il chevauche horizontalement et l'écart vertical est d'au plus 24 px. */
export function blockAbove(b: { id: string; x: number; y: number; w: number }, all: { id: string; label: string; x: number; y: number; w: number; h: number }[]): string | null {
  let best: { label: string; gap: number } | null = null;
  for (const o of all) {
    if (o.id === b.id) continue;
    const overlap = Math.min(o.x + o.w, b.x + b.w) - Math.max(o.x, b.x);
    const gap = b.y - (o.y + o.h);
    if (overlap > 0 && gap >= 0 && gap <= 24 && (!best || gap < best.gap)) best = { label: o.label, gap };
  }
  return best?.label ?? null;
}

export function diffLayouts(input: SheetInput): Change[] | null {
  if (!input.start) return null;
  const out: Change[] = [];
  const start = new Map(input.start.map((b) => [b.id, b]));
  const now = new Map(input.blocks.map((b) => [b.id, b]));
  for (const b of readingOrder(input.blocks)) {
    const s = start.get(b.id);
    if (!s) { out.push({ t: 'added', id: b.id, label: b.label }); continue; }
    if (s.label !== b.label) out.push({ t: 'renamed', id: b.id, label: b.label, from: s.label });
    if (s.kind !== b.kind) out.push({ t: 'retyped', id: b.id, label: b.label, from: s.kind, to: b.kind });
    if (s.x !== b.x || s.y !== b.y) out.push({ t: 'moved', id: b.id, label: b.label, from: [s.x, s.y], to: [b.x, b.y], under: blockAbove(b, input.blocks) });
    if (s.w !== b.w || s.h !== b.h) out.push({ t: 'resized', id: b.id, label: b.label, from: [s.w, s.h], to: [b.w, b.h] });
    if ((s.group_name || '') !== b.group) out.push({ t: 'regrouped', id: b.id, label: b.label, from: s.group_name || '', to: b.group });
    if (s.fill !== b.fill) out.push({ t: 'recolored', id: b.id, label: b.label, part: 'fill', from: s.fill, to: b.fill });
    if (s.text_color !== b.text_color) out.push({ t: 'recolored', id: b.id, label: b.label, part: 'text_color', from: s.text_color, to: b.text_color });
    if ((s.behavior || '') !== (b.behavior || '')) out.push({ t: 'behavior', id: b.id, label: b.label, to: b.behavior });
    const sf = s.feature_id ? input.features[s.feature_id]?.code ?? '' : '', bf = b.feature?.code ?? '';
    if (sf !== bf) out.push({ t: 'feature', id: b.id, label: b.label, to: b.feature ? `${b.feature.code} ${q(b.feature.name)}` : 'aucune' });
  }
  for (const s of readingOrder(input.start)) if (!now.has(s.id)) out.push({ t: 'removed', id: s.id, label: s.label });
  return out;
}

/** Une consigne par changement : impérative, courte, sans ambiguïté. */
export function instructionFor(c: Change, input: SheetInput): string {
  const W = input.screen_width;
  switch (c.t) {
    case 'added': { const b = input.blocks.find((x) => x.id === c.id)!; return `Ajoute ${q(c.label)} (${kindLabel(b.kind).toLowerCase()}) à ${b.x} px du bord gauche et ${b.y} px du haut, taille ${b.w} × ${b.h} px.`; }
    case 'removed': return `Retire ${q(c.label)} de cette page.`;
    case 'moved': return c.under ? `Déplace ${q(c.label)} juste sous ${q(c.under)} (position visée : ${c.to[0]} px du bord gauche, ${c.to[1]} px du haut ; avant : ${c.from[0]}, ${c.from[1]}).` : `Déplace ${q(c.label)} à ${c.to[0]} px du bord gauche et ${c.to[1]} px du haut (avant : ${c.from[0]}, ${c.from[1]}).`;
    case 'resized': return `Change la taille de ${q(c.label)} : ${c.to[0]} × ${c.to[1]} px sur un écran de ${W} px de large (avant : ${c.from[0]} × ${c.from[1]}).`;
    case 'regrouped': return c.to ? `Regroupe ${q(c.label)} avec les autres éléments du groupe ${q(c.to)} : ils restent ensemble, côte à côte, et se déplacent ensemble.` : `Sépare ${q(c.label)} du groupe ${q(c.from)} : il devient indépendant.`;
    case 'recolored': return `${c.part === 'fill' ? 'Couleur de fond' : 'Couleur du texte'} de ${q(c.label)} : ${colorName(c.to, input.palette)}${c.to && input.palette?.colors.some((x) => x.hex === c.to) ? ', utilise la variable CSS du site plutôt que le code' : ''} (avant : ${colorName(c.from, input.palette)}).`;
    case 'renamed': return `Renomme ${q(c.from)} en ${q(c.label)}.`;
    case 'retyped': return `${q(c.label)} devient ${kindLabel(c.to).toLowerCase()} (avant : ${kindLabel(c.from).toLowerCase()}).`;
    case 'behavior': return c.to ? `Comportement de ${q(c.label)} : ${c.to}` : `${q(c.label)} n'a plus de comportement particulier.`;
    case 'feature': return `${q(c.label)} sert la fonctionnalité ${c.to}.`;
  }
}

export function groupsOf(blocks: SheetBlock[]): { name: string; members: string[] }[] {
  const m = new Map<string, string[]>();
  for (const b of readingOrder(blocks)) if (b.group) m.set(b.group, [...(m.get(b.group) ?? []), b.label]);
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, members]) => ({ name, members }));
}

/** Liste de contrôle « maquette / résultat » : ce que Martin vérifie sur son téléphone, une ligne par point observable. */
export function checklist(input: SheetInput, changes: Change[] | null): string[] {
  const out: string[] = [];
  const ordered = readingOrder(input.blocks);
  if (ordered.length > 1) out.push(`De haut en bas, on voit dans cet ordre : ${ordered.map((b) => q(b.label)).join(', ')}.`);
  for (const g of groupsOf(input.blocks)) if (g.members.length > 1) out.push(`${g.members.map(q).join(' et ')} sont ensemble (groupe ${q(g.name)}).`);
  for (const c of changes ?? []) {
    if (c.t === 'moved' && c.under) out.push(`${q(c.label)} est juste sous ${q(c.under)}.`);
    if (c.t === 'removed') out.push(`${q(c.label)} n'apparaît plus sur cette page.`);
    if (c.t === 'added') out.push(`${q(c.label)} apparaît sur cette page.`);
    if (c.t === 'recolored') out.push(`${c.part === 'fill' ? 'Le fond' : 'Le texte'} de ${q(c.label)} a la couleur ${colorName(c.to, input.palette)}.`);
    if (c.t === 'resized') out.push(`${q(c.label)} a à peu près la taille de la maquette (${c.to[0]} × ${c.to[1]} px à 360 px de large).`);
    if (c.t === 'renamed') out.push(`${q(c.label)} porte bien ce nouveau nom.`);
  }
  out.push('Rien d’autre n’a changé sur la page, et les autres pages sont identiques.');
  out.push(`À ${input.screen_width} px de large, rien ne dépasse à droite et les boutons se touchent facilement.`);
  return [...new Set(out)];
}

/** Fichiers probablement concernés : HYPOTHÈSE d'après la liste des fichiers du dépôt (commit épinglé), jamais une certitude. */
export function probableFiles(input: SheetInput, changes: Change[] | null): string[] {
  const p = input.palette;
  if (!p) return [];
  const out: string[] = [];
  if ((changes ?? []).some((c) => c.t === 'recolored') || input.blocks.some((b) => b.fill || b.text_color)) out.push(p.file);
  if (p.files.includes('public/index.html')) out.push('public/index.html');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = new Set(norm([input.page_name, ...input.blocks.map((b) => b.label)].join(' ')).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
  for (const f of p.files) {
    const base = norm(f.split('/').pop()!.replace(/\.(html|js|css)$/, ''));
    if ([...words].some((w) => base.split(/[^a-z0-9]+/).includes(w))) out.push(f);
  }
  return [...new Set(out)].slice(0, 8);
}

const line = (b: SheetBlock, n: number, palette: PaletteInfo | null) =>
  `${n}. ${q(b.label)} — ${kindLabel(b.kind)} · ${b.x} px du bord gauche, ${b.y} px du haut, ${b.w} × ${b.h} px · groupe : ${b.group ? q(b.group) : 'aucun'} · fond : ${colorName(b.fill, palette)} · texte : ${colorName(b.text_color, palette)}${b.feature ? ` · fonctionnalité : ${b.feature.code} ${q(b.feature.name)}` : ''}${b.behavior ? ` · comportement : ${b.behavior}` : ''}`;

export interface Sheet { markdown: string; instructions: string[]; checklist: string[]; files: string[]; changes: Change[] | null; groups: { name: string; members: string[] }[] }
export function buildSheet(input: SheetInput): Sheet {
  const changes = diffLayouts(input), ordered = readingOrder(input.blocks), groups = groupsOf(input.blocks);
  const instructions = changes ? changes.map((c) => instructionFor(c, input)) : [];
  const list = checklist(input, changes), files = probableFiles(input, changes);
  const p = input.palette;
  const md: string[] = [
    `# Fiche de mise en page — ${input.title}`, '',
    `- Page du site : ${input.page_name ? q(input.page_name) : 'non précisée'}`,
    `- Écran de travail : ${input.screen_width} × ${input.screen_height} px (capture du téléphone, largeur ramenée à ${input.screen_width} px)`,
    `- Palette : ${p ? `${p.label}, lue dans ${p.file} (commit ${p.commit.slice(0, 7)}, lecture seule)` : 'aucune choisie'}`,
    `- Fabriquée par Atelier avec des règles fixes, sans IA (version ${SHEET_VERSION}).`, '',
    '## Blocs, dans l’ordre de lecture (de haut en bas, puis de gauche à droite)', '',
    ...(ordered.length ? ordered.map((b, i) => line(b, i + 1, p)) : ['Aucun bloc.']), '',
    '## Groupes', '', ...(groups.length ? groups.map((g) => `- ${q(g.name)} : ${g.members.map(q).join(', ')}`) : ['Aucun groupe.']), '',
    '## Écarts par rapport à l’écran de départ', '',
    ...(changes === null ? ['L’écran de départ n’a pas été fixé : Atelier ne peut pas dire ce qui a changé. La fiche décrit la mise en page visée.']
      : changes.length ? [`Écran de départ fixé le ${input.start_at}.`, '', ...instructions.map((s, i) => `${i + 1}. ${s}`)] : ['Aucun écart : la maquette est identique à l’écran de départ.']), '',
    '## Fichiers probablement concernés (Hypothèse)', '',
    ...(files.length ? [...files.map((f) => `- ${f}`), '', 'Déduit de la liste des fichiers du dépôt au commit indiqué, pas de leur contenu : à confirmer en lisant le dépôt.'] : ['Aucune hypothèse : choisissez la palette du site pour qu’Atelier lise la liste de ses fichiers.']), '',
    '## Liste de contrôle « maquette / résultat » (à vérifier sur le téléphone)', '', ...list.map((s) => `- [ ] ${s}`), '',
    '## Limites', '',
    '- Atelier ne promet pas une reproduction au pixel près : les positions sont en pixels d’écran à 360 px de large, à respecter à quelques pixels près.',
    '- Les noms des blocs sont ceux de la maquette ; sur le site, l’élément peut porter un autre texte.',
  ];
  return { markdown: md.join('\n') + '\n', instructions, checklist: list, files, changes, groups };
}

/** Champs de mission du lot 3 (chaque champ ≤ 3000 caractères) ; au-delà, la mission renvoie à la fiche jointe. */
export function missionFields(input: SheetInput, sheet: Sheet): Record<'objective' | 'perimeter' | 'forbidden' | 'files' | 'tests' | 'proofs' | 'done', string> {
  const site = input.palette ? input.palette.label : 'du site';
  const cap = (lines: string[], max = 2900) => { const out: string[] = []; let n = 0; for (const l of lines) { if (n + l.length + 1 > max) { out.push(`(… ${lines.length - out.length} autre(s) point(s) dans la fiche de mise en page jointe.)`); break; } out.push(l); n += l.length + 1; } return out.join('\n'); };
  const target = readingOrder(input.blocks).map((b, i) => line(b, i + 1, input.palette));
  return {
    objective: `Sur la page ${input.page_name ? q(input.page_name) : 'concernée'} du site ${site}, reproduire la mise en page de la maquette ${q(input.title)} faite dans Atelier (fiche de mise en page jointe).`,
    perimeter: cap(sheet.changes === null
      ? ['Écran de départ non fixé : reproduire la mise en page visée ci-dessous.', ...target]
      : sheet.instructions.length ? [...sheet.instructions.map((s, i) => `${i + 1}. ${s}`), '', 'Mise en page visée (ordre de lecture) :', ...target] : ['Aucun écart avec l’écran de départ : rien à changer.']),
    forbidden: ['Ne modifier que cette page : les autres pages restent identiques.', 'Ne pas toucher aux données enregistrées ni à leur format.', 'Ne pas ajouter de couleur hors de la palette du site, sauf celles indiquées « hors palette ».'].join('\n'),
    files: sheet.files.length ? `Hypothèse (liste des fichiers du dépôt au commit ${input.palette!.commit.slice(0, 7)}, contenu non lu) : ${sheet.files.join(', ')}. À confirmer en lisant le dépôt.` : 'À repérer dans le dépôt (Atelier n’a pas d’hypothèse).',
    tests: 'Lancer les tests du dépôt indiqués dans ses règles ; vérifier l’affichage à 360 px de large.',
    proofs: cap(['Une capture de la page à 360 px de large, à comparer avec l’image de la maquette.', 'La liste de contrôle ci-dessous, point par point :', ...sheet.checklist.map((s) => `- ${s}`)]),
    done: 'Chaque point de la liste de contrôle est vrai sur le téléphone, et les tests du dépôt sont verts.',
  };
}
