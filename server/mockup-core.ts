/* Lot 5B (5B-1) — Maquettes d'écran : règles pures, sans base ni réseau.
   Atelier ne produit aucun code de site. Ici : formes valides d'une capture, d'un bloc, d'une couleur. */

export const SCREEN_WIDTH = 360;
/** 180 000 octets avant encodage → 240 000 caractères en base64, sous la limite de 262 144 octets de texte d'Atelier. */
export const MAX_IMAGE_BYTES = 180000;
export const MAX_IMAGE_TEXT = 262144;
export const MAX_USER_IMAGE_BYTES = 20 * 1048576;
export const MAX_MOCKUPS_PER_PROJECT = 40;
export const MAX_BLOCKS = 100;
export const MAX_GROUPS = 30;

export const BLOCK_KINDS = ['title', 'text', 'list', 'card', 'button', 'field', 'bottom_bar', 'image', 'other'] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
export const BLOCK_LABEL: Record<BlockKind, string> = {
  title: 'Titre', text: 'Texte', list: 'Liste', card: 'Carte', button: 'Bouton', field: 'Champ',
  bottom_bar: 'Barre du bas', image: 'Image', other: 'Autre',
};
export const IMAGE_MIMES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type ImageMime = (typeof IMAGE_MIMES)[number];

export class MockupError extends Error {
  status: 400 | 409 | 413 | 422;
  constructor(status: 400 | 409 | 413 | 422, message: string) { super(message); this.status = status; }
}

/* ───────── Couleurs ───────── */
/** Une couleur vide veut dire « pas de couleur choisie ». Sinon #rrggbb, rendue en minuscules. */
export function cleanColor(value: unknown, what: string): string {
  if (value === undefined || value === null || value === '') return '';
  const v = String(value).trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(v)) throw new MockupError(400, `${what} : écrivez une couleur sous la forme #rrggbb (par exemple #0b0b0c).`);
  return v;
}

/* ───────── Blocs ───────── */
export interface BlockInput {
  kind: BlockKind; label: string; x: number; y: number; w: number; h: number;
  fill: string; text_color: string; behavior: string;
}
const int = (v: unknown, what: string): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new MockupError(400, `${what} : écrivez un nombre entier.`);
  return n;
};
/** Vérifie qu'un bloc tient dans l'écran de la maquette (360 px de large, hauteur de la capture). */
export function cleanBlock(raw: Record<string, unknown>, screenHeight: number, screenWidth = SCREEN_WIDTH): BlockInput {
  const kind = String(raw.kind ?? '') as BlockKind;
  if (!(BLOCK_KINDS as readonly string[]).includes(kind)) throw new MockupError(400, 'Ce type de bloc n’existe pas.');
  const label = String(raw.label ?? '').trim();
  if (!label) throw new MockupError(400, 'Donnez un nom au bloc (par exemple « Bouton Enregistrer »).');
  if (label.length > 120) throw new MockupError(400, 'Le nom du bloc est trop long (120 caractères au plus).');
  const x = int(raw.x, 'Distance depuis la gauche'), y = int(raw.y, 'Distance depuis le haut'), w = int(raw.w, 'Largeur'), h = int(raw.h, 'Hauteur');
  if (x < 0 || y < 0) throw new MockupError(400, 'Le bloc ne peut pas commencer avant le bord de l’écran.');
  if (w < 1 || h < 1) throw new MockupError(400, 'La largeur et la hauteur doivent être d’au moins 1.');
  if (x + w > screenWidth) throw new MockupError(400, `Le bloc dépasse à droite : l’écran fait ${screenWidth} de large.`);
  if (y + h > screenHeight) throw new MockupError(400, `Le bloc dépasse en bas : l’écran fait ${screenHeight} de haut.`);
  const behavior = String(raw.behavior ?? '').trim();
  if (behavior.length > 500) throw new MockupError(400, 'Le comportement est trop long (500 caractères au plus).');
  return { kind, label, x, y, w, h, fill: cleanColor(raw.fill, 'Couleur de fond'), text_color: cleanColor(raw.text_color, 'Couleur du texte'), behavior };
}

/* ───────── Capture d'écran ───────── */
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;
export function decodeBase64(data: string): Uint8Array {
  const clean = data.replace(/\s+/g, '');
  if (!clean || clean.length % 4 !== 0 || !B64.test(clean)) throw new MockupError(400, 'La capture n’a pas pu être lue (données invalides).');
  const bin = atob(clean), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const ascii = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));

/** Lit le format et les dimensions dans l'en-tête réel du fichier (on ne croit pas ce que dit le navigateur). */
export function sniffImage(b: Uint8Array): { mime: ImageMime; width: number; height: number } | null {
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG' && ascii(b, 12, 4) === 'IHDR')
    return { mime: 'image/png', width: u32be(b, 16), height: u32be(b, 20) };
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const marker = b[i + 1];
      if (marker === 0xff) { i++; continue; }
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) { i += 2; continue; }
      const len = u16be(b, i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { mime: 'image/jpeg', height: u16be(b, i + 5), width: u16be(b, i + 7) };
      i += 2 + len;
    }
    return null;
  }
  if (b.length >= 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') {
    const chunk = ascii(b, 12, 4);
    if (chunk === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)
      return { mime: 'image/webp', width: (b[26] | (b[27] << 8)) & 0x3fff, height: (b[28] | (b[29] << 8)) & 0x3fff };
    if (chunk === 'VP8L' && b[20] === 0x2f) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { mime: 'image/webp', width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X')
      return { mime: 'image/webp', width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  return null;
}

export interface ValidImage { mime: ImageMime; width: number; height: number; bytes: number; data: string }
export function validateImage(input: { mime?: unknown; data?: unknown }): ValidImage {
  if (typeof input.data !== 'string' || !input.data) throw new MockupError(400, 'Aucune capture reçue.');
  const data = input.data.replace(/\s+/g, '');
  if (data.length > MAX_IMAGE_TEXT) throw new MockupError(413, 'La capture est trop lourde pour le stockage d’Atelier (limite : 180 Ko après compression). Choisissez une capture plus petite.');
  const bytes = decodeBase64(data);
  if (bytes.length > MAX_IMAGE_BYTES) throw new MockupError(413, `La capture fait ${Math.ceil(bytes.length / 1000)} Ko ; la limite est de 180 Ko. Choisissez une capture plus petite.`);
  const sniff = sniffImage(bytes);
  if (!sniff) throw new MockupError(422, 'Ce fichier n’est pas une image WebP, JPEG ou PNG lisible.');
  if (input.mime !== undefined && input.mime !== sniff.mime) throw new MockupError(422, 'Le type annoncé ne correspond pas au contenu de l’image.');
  if (sniff.width < 100 || sniff.height < 100) throw new MockupError(422, 'La capture est trop petite pour servir de fond (100 px au moins de chaque côté).');
  if (sniff.width > 4096 || sniff.height > 20000) throw new MockupError(422, 'La capture est trop grande.');
  return { ...sniff, bytes: bytes.length, data };
}
/** Hauteur de travail en pixels d'écran (largeur 360) d'après les proportions de la capture, bornée à 200–3000. */
export function screenHeightFor(width: number, height: number, screenWidth = SCREEN_WIDTH): number {
  return Math.max(200, Math.min(3000, Math.round((height / width) * screenWidth)));
}

/* ───────── Titre ───────── */
export function cleanTitle(value: unknown, what = 'Le titre'): string {
  const v = String(value ?? '').trim();
  if (!v) throw new MockupError(400, `${what} est obligatoire.`);
  if (v.length > 160) throw new MockupError(400, `${what} est trop long (160 caractères au plus).`);
  return v;
}

/* ───────── 5B-2 : opérations de modification (pures : on valide tout en mémoire AVANT d'écrire quoi que ce soit) ───────── */
export const MAX_OPS = 12;
export const MAX_IDS = 50;
export const MAX_WRITES = 40;
export const MAX_MOVE = 4000;

export interface BlockState {
  id: string; kind: BlockKind; label: string; x: number; y: number; w: number; h: number; position: number;
  group: string | null; fill: string; text_color: string; behavior: string; feature_id: string | null;
}
export type Op =
  | { op: 'add'; block: Record<string, unknown> }
  | { op: 'update'; id: string; patch: Record<string, unknown> }
  | { op: 'delete'; id: string }
  | { op: 'group'; ids: string[]; name: string }
  | { op: 'ungroup'; ids: string[] }
  | { op: 'move_group'; name: string; dx: number; dy: number }
  | { op: 'delete_group'; name: string };
export interface Layout { blocks: BlockState[]; groups: string[] }
export interface Ctx { screen_width: number; screen_height: number; featureExists: (id: string) => boolean }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATCHABLE = ['kind', 'label', 'x', 'y', 'w', 'h', 'fill', 'text_color', 'behavior', 'feature_id'] as const;

function cleanGroupName(v: unknown): string {
  const n = String(v ?? '').trim();
  if (!n) throw new MockupError(400, 'Donnez un nom au groupe.');
  if (n.length > 60) throw new MockupError(400, 'Le nom du groupe est trop long (60 caractères au plus).');
  return n;
}
const delta = (v: unknown, what: string): number => {
  const n = int(v, what);
  if (Math.abs(n) > MAX_MOVE) throw new MockupError(400, `${what} : valeur trop grande.`);
  return n;
};
function idList(v: unknown): string[] {
  if (!Array.isArray(v) || !v.length) throw new MockupError(400, 'Choisissez au moins un bloc.');
  if (v.length > MAX_IDS) throw new MockupError(400, `Trop de blocs d'un coup (${MAX_IDS} au plus).`);
  const ids = v.map(String);
  if (new Set(ids).size !== ids.length) throw new MockupError(400, 'Un bloc est cité deux fois.');
  return ids;
}
const fits = (b: { x: number; y: number; w: number; h: number }, ctx: Ctx) => b.x >= 0 && b.y >= 0 && b.x + b.w <= ctx.screen_width && b.y + b.h <= ctx.screen_height;

/** Applique les opérations dans l'ordre, sur une COPIE. Au premier défaut, tout est refusé : rien n'est partiellement appliqué. */
export function applyOps(input: Layout, rawOps: unknown, ctx: Ctx): Layout {
  if (!Array.isArray(rawOps) || !rawOps.length) throw new MockupError(400, 'Aucune modification demandée.');
  if (rawOps.length > MAX_OPS) throw new MockupError(400, `Trop de modifications d'un coup (${MAX_OPS} au plus).`);
  const blocks = new Map(input.blocks.map((b) => [b.id, { ...b }]));
  const groups = [...input.groups];
  const need = (id: unknown): BlockState => {
    const b = blocks.get(String(id));
    if (!b) throw new MockupError(400, 'Un des blocs n’existe plus. Rechargez la maquette.');
    return b;
  };
  const ensureGroup = (name: string) => {
    if (groups.includes(name)) return;
    if (groups.length >= MAX_GROUPS) throw new MockupError(409, `Cette maquette a déjà ${MAX_GROUPS} groupes : c’est la limite.`);
    groups.push(name);
  };
  for (const raw of rawOps as Record<string, any>[]) {
    switch (raw?.op) {
      case 'add': {
        if (blocks.size >= MAX_BLOCKS) throw new MockupError(409, `Cette maquette a déjà ${MAX_BLOCKS} blocs : c’est la limite.`);
        const src = (raw.block ?? {}) as Record<string, unknown>;
        const c = cleanBlock(src, ctx.screen_height, ctx.screen_width);
        const id = src.id === undefined ? crypto.randomUUID() : String(src.id);
        if (!UUID.test(id)) throw new MockupError(400, 'Identifiant de bloc invalide.');
        if (blocks.has(id)) throw new MockupError(409, 'Ce bloc existe déjà.');
        const fid = src.feature_id ? String(src.feature_id) : null;
        if (fid && !ctx.featureExists(fid)) throw new MockupError(400, 'Cette fonctionnalité n’appartient pas à ce projet.');
        let g: string | null = null;
        if (src.group_name) { g = cleanGroupName(src.group_name); ensureGroup(g); }
        const position = Math.max(-1, ...[...blocks.values()].map((b) => b.position)) + 1;
        blocks.set(id, { id, ...c, position, group: g, feature_id: fid });
        break;
      }
      case 'update': {
        const b = need(raw.id);
        const patch = (raw.patch ?? {}) as Record<string, unknown>;
        const bad = Object.keys(patch).filter((k) => !(PATCHABLE as readonly string[]).includes(k));
        if (bad.length) throw new MockupError(400, 'Cette modification n’est pas permise.');
        if (!Object.keys(patch).length) throw new MockupError(400, 'Aucune modification demandée.');
        const next = cleanBlock({ ...b, ...patch }, ctx.screen_height, ctx.screen_width);
        let fid = b.feature_id;
        if ('feature_id' in patch) {
          fid = patch.feature_id ? String(patch.feature_id) : null;
          if (fid && !ctx.featureExists(fid)) throw new MockupError(400, 'Cette fonctionnalité n’appartient pas à ce projet.');
        }
        Object.assign(b, next, { feature_id: fid });
        break;
      }
      case 'delete': { need(raw.id); blocks.delete(String(raw.id)); break; }
      case 'group': {
        const ids = idList(raw.ids), name = cleanGroupName(raw.name);
        for (const id of ids) need(id);
        ensureGroup(name);
        for (const id of ids) need(id).group = name;
        break;
      }
      case 'ungroup': { for (const id of idList(raw.ids)) need(id).group = null; break; }
      case 'move_group': {
        const name = cleanGroupName(raw.name);
        if (!groups.includes(name)) throw new MockupError(400, 'Ce groupe n’existe pas.');
        const dx = delta(raw.dx, 'Déplacement à droite'), dy = delta(raw.dy, 'Déplacement vers le bas');
        const members = [...blocks.values()].filter((b) => b.group === name);
        if (!members.length) throw new MockupError(400, 'Ce groupe est vide.');
        for (const b of members) if (!fits({ x: b.x + dx, y: b.y + dy, w: b.w, h: b.h }, ctx)) throw new MockupError(400, 'Le groupe sortirait de l’écran : déplacez-le moins loin.');
        for (const b of members) { b.x += dx; b.y += dy; }
        break;
      }
      case 'delete_group': {
        const name = cleanGroupName(raw.name);
        if (!groups.includes(name)) throw new MockupError(400, 'Ce groupe n’existe pas.');
        groups.splice(groups.indexOf(name), 1);
        for (const b of blocks.values()) if (b.group === name) b.group = null;
        break;
      }
      default: throw new MockupError(400, 'Modification inconnue.');
    }
  }
  return { blocks: [...blocks.values()].sort((a, b) => a.position - b.position), groups };
}

/* ───────── Plan d'écriture : le moins de requêtes possible (D1 gratuit : 50 requêtes par appel) ───────── */
export type Write =
  | { t: 'group_add'; name: string }
  | { t: 'block_add'; block: BlockState }
  | { t: 'block_update'; block: BlockState }
  | { t: 'translate'; ids: string[]; dx: number; dy: number }
  | { t: 'set_group'; ids: string[]; name: string | null }
  | { t: 'block_delete'; ids: string[] }
  | { t: 'group_delete'; name: string };
const FIELDS = ['kind', 'label', 'x', 'y', 'w', 'h', 'fill', 'text_color', 'behavior', 'feature_id', 'group'] as const;

export function planWrites(before: Layout, after: Layout): Write[] {
  const w: Write[] = [];
  const old = new Map(before.blocks.map((b) => [b.id, b]));
  const now = new Map(after.blocks.map((b) => [b.id, b]));
  for (const g of after.groups) if (!before.groups.includes(g)) w.push({ t: 'group_add', name: g });
  const translate = new Map<string, string[]>(), setGroup = new Map<string, string[]>();
  for (const b of after.blocks) {
    const o = old.get(b.id);
    if (!o) { w.push({ t: 'block_add', block: b }); continue; }
    const changed = FIELDS.filter((k) => o[k] !== b[k]);
    if (!changed.length) continue;
    if (changed.every((k) => k === 'x' || k === 'y')) {
      const key = `${b.x - o.x},${b.y - o.y}`;
      translate.set(key, [...(translate.get(key) ?? []), b.id]);
    } else if (changed.length === 1 && changed[0] === 'group') {
      const key = b.group ?? '';
      setGroup.set(key, [...(setGroup.get(key) ?? []), b.id]);
    } else w.push({ t: 'block_update', block: b });
  }
  for (const [k, ids] of translate) { const [dx, dy] = k.split(',').map(Number); w.push({ t: 'translate', ids, dx, dy }); }
  for (const [k, ids] of setGroup) w.push({ t: 'set_group', ids, name: k === '' ? null : k });
  const gone = before.blocks.filter((b) => !now.has(b.id)).map((b) => b.id);
  if (gone.length) w.push({ t: 'block_delete', ids: gone });
  for (const g of before.groups) if (!after.groups.includes(g)) w.push({ t: 'group_delete', name: g });
  if (w.length > MAX_WRITES) throw new MockupError(413, `Trop de changements différents d'un coup (${MAX_WRITES} au plus). Faites-en moins à la fois.`);
  return w;
}
