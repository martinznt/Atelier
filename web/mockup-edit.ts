/* Lot 5B (5B-2) — édition d'une maquette : fonctions PURES (sans écran ni réseau).
   Chaque action rend ses opérations « aller » ET « inverse » : annuler = rejouer l'inverse, rétablir = rejouer l'aller.
   Le serveur valide tout et applique un lot en tout ou rien ; ici on évite surtout d'envoyer ce qui sera refusé. */
export interface UiBlock {
  id: string; kind: string; label: string; x: number; y: number; w: number; h: number;
  group_name: string; fill: string; text_color: string; behavior: string; feature: { id: string } | null;
}
export interface Op { op: string; [k: string]: unknown }
export interface Entry { label: string; forward: Op[]; inverse: Op[] }
export const MAX_OPS = 12;
export const MAX_SELECTION = 12;
export const STEPS = [1, 4, 8, 16, 32] as const;

const byId = (all: UiBlock[], id: string) => {
  const b = all.find((x) => x.id === id);
  if (!b) throw new Error('Un des blocs n’existe plus. Rechargez la maquette.');
  return b;
};
const guard = (ops: Op[]) => {
  if (ops.length > MAX_OPS) throw new Error(`Trop de blocs d’un coup (${MAX_OPS} au plus). Choisissez-en moins.`);
  return ops;
};
export const toAdd = (b: UiBlock): Op => ({
  op: 'add',
  block: { id: b.id, kind: b.kind, label: b.label, x: b.x, y: b.y, w: b.w, h: b.h, fill: b.fill, text_color: b.text_color, behavior: b.behavior, group_name: b.group_name || null, feature_id: b.feature?.id ?? null },
});

/** Plus grand déplacement permis (par axe) : aucun bloc ne sort de l'écran. */
export function clampDelta(blocks: UiBlock[], dx: number, dy: number, W: number, H: number) {
  let lo = { x: -Infinity, y: -Infinity }, hi = { x: Infinity, y: Infinity };
  for (const b of blocks) {
    lo = { x: Math.max(lo.x, -b.x), y: Math.max(lo.y, -b.y) };
    hi = { x: Math.min(hi.x, W - b.w - b.x), y: Math.min(hi.y, H - b.h - b.y) };
  }
  return { dx: Math.max(lo.x, Math.min(hi.x, dx)), dy: Math.max(lo.y, Math.min(hi.y, dy)) };
}

/** Blocs réellement déplacés : ceux choisis ; avec `whole`, un bloc d'un groupe emmène tout son groupe. */
export function movingSet(all: UiBlock[], ids: string[], whole: boolean): { moving: UiBlock[]; groups: string[]; single: UiBlock[] } {
  const picked = ids.map((i) => byId(all, i));
  const groups = whole ? [...new Set(picked.map((b) => b.group_name).filter(Boolean))] : [];
  const moving = new Map<string, UiBlock>();
  for (const b of picked) if (!(whole && b.group_name)) moving.set(b.id, b);
  for (const g of groups) for (const b of all) if (b.group_name === g) moving.set(b.id, b);
  return { moving: [...moving.values()], groups, single: [...moving.values()].filter((b) => !(whole && b.group_name)) };
}

/** Déplace les blocs choisis. Rend null si rien ne bouge (bord atteint). */
export function moveBlocks(all: UiBlock[], ids: string[], dx: number, dy: number, whole: boolean, W: number, H: number): Entry | null {
  const { moving, groups, single } = movingSet(all, ids, whole);
  const c = clampDelta(moving, dx, dy, W, H);
  if (!c.dx && !c.dy) return null;
  const fwd: Op[] = [
    ...groups.map((g) => ({ op: 'move_group', name: g, dx: c.dx, dy: c.dy })),
    ...single.map((b) => ({ op: 'update', id: b.id, patch: { x: b.x + c.dx, y: b.y + c.dy } })),
  ];
  const inv: Op[] = [
    ...groups.map((g) => ({ op: 'move_group', name: g, dx: -c.dx, dy: -c.dy })),
    ...single.map((b) => ({ op: 'update', id: b.id, patch: { x: b.x, y: b.y } })),
  ];
  return { label: moving.length > 1 ? 'Déplacer les blocs' : 'Déplacer le bloc', forward: guard(fwd), inverse: guard(inv) };
}

export function resizeBlocks(all: UiBlock[], ids: string[], dw: number, dh: number, W: number, H: number): Entry | null {
  const fwd: Op[] = [], inv: Op[] = [];
  for (const id of ids) {
    const b = byId(all, id);
    const w = Math.max(8, Math.min(W - b.x, b.w + dw)), h = Math.max(8, Math.min(H - b.y, b.h + dh));
    if (w === b.w && h === b.h) continue;
    fwd.push({ op: 'update', id, patch: { w, h } });
    inv.push({ op: 'update', id, patch: { w: b.w, h: b.h } });
  }
  return fwd.length ? { label: 'Changer la taille', forward: guard(fwd), inverse: guard(inv) } : null;
}

/** « Placer sous … » : le bloc prend la place juste sous un autre bloc, même bord gauche. */
export function placeUnder(all: UiBlock[], id: string, targetId: string, gap: number, W: number, H: number): Entry | null {
  const b = byId(all, id), t = byId(all, targetId);
  if (id === targetId) throw new Error('Choisissez un autre bloc que celui-ci.');
  const x = Math.max(0, Math.min(W - b.w, t.x)), y = t.y + t.h + gap;
  if (y + b.h > H) throw new Error('Il n’y a pas assez de place sous ce bloc dans l’écran.');
  if (x === b.x && y === b.y) return null;
  return { label: 'Placer sous un bloc', forward: [{ op: 'update', id, patch: { x, y } }], inverse: [{ op: 'update', id, patch: { x: b.x, y: b.y } }] };
}

export function updateBlock(all: UiBlock[], id: string, patch: Record<string, unknown>, label = 'Modifier le bloc'): Entry | null {
  const b = byId(all, id) as unknown as Record<string, unknown>;
  const real: Record<string, unknown> = {}, prev: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const cur = k === 'feature_id' ? (b.feature as { id: string } | null)?.id ?? null : b[k];
    if (cur !== v) { real[k] = v; prev[k] = cur; }
  }
  return Object.keys(real).length ? { label, forward: [{ op: 'update', id, patch: real }], inverse: [{ op: 'update', id, patch: prev }] } : null;
}

export function setColors(all: UiBlock[], ids: string[], patch: { fill?: string; text_color?: string }): Entry | null {
  const fwd: Op[] = [], inv: Op[] = [];
  for (const id of ids) {
    const e = updateBlock(all, id, patch);
    if (e) { fwd.push(...e.forward); inv.push(...e.inverse); }
  }
  return fwd.length ? { label: 'Changer la couleur', forward: guard(fwd), inverse: guard(inv) } : null;
}

/** Inverse d'un rattachement : ceux qui n'avaient pas de groupe sont séparés, les autres retournent dans leur groupe d'avant. */
function regroup(all: UiBlock[], ids: string[]): Op[] {
  const out: Op[] = [], loose = ids.filter((i) => !byId(all, i).group_name);
  if (loose.length) out.push({ op: 'ungroup', ids: loose });
  const by = new Map<string, string[]>();
  for (const i of ids) { const g = byId(all, i).group_name; if (g) by.set(g, [...(by.get(g) ?? []), i]); }
  for (const [g, list] of by) out.push({ op: 'group', ids: list, name: g });
  return out;
}
export function groupBlocks(all: UiBlock[], ids: string[], name: string, existing: string[]): Entry {
  const n = name.trim();
  if (!n) throw new Error('Donnez un nom au groupe.');
  const inv = regroup(all, ids);
  if (!existing.includes(n)) inv.push({ op: 'delete_group', name: n });
  return { label: 'Grouper', forward: [{ op: 'group', ids, name: n }], inverse: guard(inv) };
}
export function ungroupBlocks(all: UiBlock[], ids: string[]): Entry | null {
  const inGroup = ids.filter((i) => byId(all, i).group_name);
  return inGroup.length ? { label: 'Séparer du groupe', forward: [{ op: 'ungroup', ids: inGroup }], inverse: guard(regroup(all, inGroup)) } : null;
}
export function deleteGroup(all: UiBlock[], name: string): Entry {
  const members = all.filter((b) => b.group_name === name).map((b) => b.id);
  const inv: Op[] = [{ op: 'group', ids: members.slice(0, 50), name }];
  return { label: 'Supprimer le groupe', forward: [{ op: 'delete_group', name }], inverse: members.length ? inv : [] };
}
export function deleteBlocks(all: UiBlock[], ids: string[]): Entry {
  const blocks = ids.map((i) => byId(all, i));
  return { label: ids.length > 1 ? 'Supprimer les blocs' : 'Supprimer le bloc', forward: guard(ids.map((id) => ({ op: 'delete', id }))), inverse: guard(blocks.map(toAdd)) };
}
export function addBlock(b: UiBlock): Entry {
  return { label: 'Ajouter un bloc', forward: [toAdd(b)], inverse: [{ op: 'delete', id: b.id }] };
}
