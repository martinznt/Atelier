/* Lot 5B (5B-4) — guidage par règles VÉRIFIABLES, sans IA. Chaque suggestion cite sa règle, sa source et son niveau de fiabilité.
   Seuils lus à la source le 17 novembre 2026 : WCAG 2.2, W3C Recommendation 12 December 2024, https://www.w3.org/TR/WCAG22/
   (extrait gardé dans docs/audits/preuves/lot5b/5b4-sources-w3c.txt). Ce qui n'a pas de source officielle est marqué « hypothesis ». */

export const WCAG = 'https://www.w3.org/TR/WCAG22/';
export type Level = 'verified' | 'reported' | 'hypothesis';
export const LEVEL_WORD: Record<Level, string> = { verified: 'Vérifié', reported: 'Rapporté', hypothesis: 'Hypothèse' };
export interface GuideBlock { id: string; kind: string; label: string; x: number; y: number; w: number; h: number; group: string; fill: string; text_color: string; feature_id: string | null }
export interface GuideFeature { id: string; code: string; name: string; state: string; life: string }
export interface GuideDecision { id: string; title: string; reason: string }
export interface GuideInput { blocks: GuideBlock[]; palette: { hex: string; token: string }[] | null; features: GuideFeature[]; decisions: GuideDecision[] }
export interface Suggestion {
  rule: string; key: string; title: string; detail: string; level: Level; source: { label: string; url: string };
  block_ids: string[]; instruction: string;
}
const INTERACTIVE = new Set(['button', 'field', 'bottom_bar']);
const q = (s: string) => `« ${s} »`;

/* ───── Contraste : formules recopiées de WCAG 2.2 (définitions « relative luminance » et « contrast ratio ») ───── */
export function luminance(hex: string): number {
  const v = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!v) throw new Error('Couleur invalide');
  const ch = [0, 2, 4].map((i) => parseInt(v[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}
const ratio = (r: number) => (Math.floor(r * 100) / 100).toFixed(2).replace('.', ',') + ':1';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function suggestions(input: GuideInput): Suggestion[] {
  const out: Suggestion[] = [];
  const blocks = [...input.blocks].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  for (const b of blocks) {
    // 1. Cible tactile — WCAG 2.2, 2.5.8 (AA) 24 × 24 px ; 2.5.5 (AAA) 44 × 44 px. Seuils vérifiés à la source.
    if (INTERACTIVE.has(b.kind) && (b.w < 24 || b.h < 24))
      out.push({ rule: 'target_min', key: `${b.id}`, level: 'verified', block_ids: [b.id], source: { label: 'WCAG 2.2, critère 2.5.8 « Target Size (Minimum) », niveau AA', url: WCAG + '#target-size-minimum' },
        title: `${q(b.label)} est trop petit pour le doigt`, detail: `${b.w} × ${b.h} px ; la règle demande au moins 24 × 24 px (sauf exceptions : espacement suffisant, autre bouton équivalent, lien dans une phrase…). Atelier ne vérifie pas ces exceptions.`,
        instruction: `Agrandis ${q(b.label)} à au moins 24 × 24 px (WCAG 2.2, critère 2.5.8).` });
    else if (INTERACTIVE.has(b.kind) && (b.w < 44 || b.h < 44))
      out.push({ rule: 'target_comfort', key: `${b.id}`, level: 'verified', block_ids: [b.id], source: { label: 'WCAG 2.2, critère 2.5.5 « Target Size (Enhanced) », niveau AAA', url: WCAG + '#target-size-enhanced' },
        title: `${q(b.label)} est petit pour un pouce`, detail: `${b.w} × ${b.h} px : acceptable au niveau AA (24 px), mais le niveau le plus exigeant (AAA) demande 44 × 44 px — c'est aussi la taille des boutons d'Atelier.`,
        instruction: `Si possible, agrandis ${q(b.label)} à 44 × 44 px au moins (WCAG 2.2, critère 2.5.5).` });
    // 2. Contraste du texte — WCAG 2.2, 1.4.3 (AA) : 4,5:1, ou 3:1 pour le gros texte.
    if (b.fill && b.text_color) {
      const r = contrastRatio(b.fill, b.text_color);
      if (r < 4.5)
        out.push({ rule: 'text_contrast', key: `${b.id}:${b.fill}:${b.text_color}`, level: 'verified', block_ids: [b.id], source: { label: 'WCAG 2.2, critère 1.4.3 « Contrast (Minimum) », niveau AA', url: WCAG + '#contrast-minimum' },
          title: `Le texte de ${q(b.label)} se lit mal`, detail: `Contraste ${ratio(r)} entre ${b.text_color} et ${b.fill} ; il faut au moins 4,5:1${r >= 3 ? ', ou 3:1 si le texte est gros (18 points, ou 14 points en gras) : Atelier ne connaît pas la taille du texte' : ', et même un gros texte demande 3:1'}.`,
          instruction: `Choisis pour ${q(b.label)} une couleur de texte et de fond avec un contraste d'au moins 4,5:1 (actuellement ${ratio(r)}).` });
    } else if (b.text_color && !b.fill || b.fill && !b.text_color) {
      // 3. Une seule des deux couleurs choisie : la règle ne peut pas être évaluée (note 4 de la définition « contrast ratio »).
      out.push({ rule: 'contrast_unknown', key: `${b.id}:${b.fill}:${b.text_color}`, level: 'hypothesis', block_ids: [b.id], source: { label: 'WCAG 2.2, définition « contrast ratio », note 4', url: WCAG + '#dfn-contrast-ratio' },
        title: `Contraste de ${q(b.label)} impossible à vérifier`, detail: `Seule la couleur ${b.fill ? 'de fond' : 'du texte'} est choisie. Si l'autre vient de la page, le résultat dépend d'elle : choisissez les deux pour qu'Atelier puisse vérifier.`,
        instruction: `Vérifie le contraste du texte de ${q(b.label)} (au moins 4,5:1) : la maquette ne fixe qu'une des deux couleurs.` });
    }
    // 4. Couleur hors palette du site (palette lue dans le dépôt).
    if (input.palette) for (const [part, hex] of [['fond', b.fill], ['texte', b.text_color]] as const)
      if (hex && !input.palette.some((c) => c.hex === hex))
        out.push({ rule: 'off_palette', key: `${b.id}:${part}:${hex}`, level: 'verified', block_ids: [b.id], source: { label: 'Palette du site lue dans son dépôt', url: '' },
          title: `Couleur de ${part} de ${q(b.label)} hors palette du site`, detail: `${hex} n'est pas une couleur du site. Une couleur du site garde la page cohérente avec le reste.`,
          instruction: `Pour ${q(b.label)}, remplace ${hex} par la couleur du site la plus proche, sauf choix voulu.` });
    // 5. Fonctionnalité liée qui n'est plus « actuelle » dans le suivi (abandonnée, rejetée, remplacée) ou bloquée.
    const f = b.feature_id ? input.features.find((x) => x.id === b.feature_id) : null;
    if (f && (['abandoned', 'rejected', 'replaced'].includes(f.life) || f.state === 'blocked'))
      out.push({ rule: 'feature_status', key: `${b.id}:${f.id}:${f.life}:${f.state}`, level: 'reported', block_ids: [b.id], source: { label: `Suivi des fonctionnalités : ${f.code}`, url: '' },
        title: `${q(b.label)} sert une fonctionnalité ${f.state === 'blocked' ? 'bloquée' : 'qui n’est plus actuelle'}`, detail: `${f.code} ${q(f.name)} est ${f.state === 'blocked' ? '« Bloquée »' : f.life === 'abandoned' ? '« Abandonnée »' : f.life === 'rejected' ? '« Rejetée »' : '« Remplacée »'} dans le suivi du projet.`,
        instruction: `Avant de garder ${q(b.label)}, vérifie la fonctionnalité ${f.code} : elle n'est plus actuelle ou est bloquée.` });
    // 6. Une décision actuelle cite ce bloc par son nom : à relire (Atelier ne comprend pas le sens de la décision).
    const n = norm(b.label);
    if (n.length >= 4) for (const d of input.decisions) {
      const text = ` ${norm(d.title + ' ' + d.reason)} `;
      if (text.includes(` ${n} `))
        out.push({ rule: 'decision_mention', key: `${b.id}:${d.id}`, level: 'hypothesis', block_ids: [b.id], source: { label: `Décision actuelle : ${d.title}`, url: '' },
          title: `Une décision parle de ${q(b.label)}`, detail: `La décision ${q(d.title)} cite ce bloc. Atelier ne sait pas si la maquette la respecte : relisez-la.`,
          instruction: `Respecte la décision ${q(d.title)}, qui concerne ${q(b.label)}.` });
    }
  }
  // 7. Chevauchement de deux blocs hors d'un même groupe (géométrie exacte de la maquette).
  for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
    const a = blocks[i], c = blocks[j];
    const ox = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x), oy = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
    if (ox > 0 && oy > 0 && !(a.group && a.group === c.group))
      out.push({ rule: 'overlap', key: [a.id, c.id].sort().join(':'), level: 'verified', block_ids: [a.id, c.id], source: { label: 'Mesure de la maquette', url: '' },
        title: `${q(a.label)} et ${q(c.label)} se chevauchent`, detail: `Ils se recouvrent sur ${ox} × ${oy} px. Sur le téléphone, l'un cachera l'autre ou un toucher visera le mauvais.`,
        instruction: `Sépare ${q(a.label)} et ${q(c.label)} : ils ne doivent pas se recouvrir.` });
  }
  // 8. Beaucoup d'éléments au même niveau, sans groupe : aucun seuil officiel → HYPOTHÈSE d'Atelier (8 blocs).
  const loose = blocks.filter((b) => !b.group);
  if (loose.length > 8)
    out.push({ rule: 'crowded', key: `${loose.length > 12 ? 'plus-de-12' : 'plus-de-8'}`, level: 'hypothesis', block_ids: loose.map((b) => b.id), source: { label: 'Repère d’Atelier, sans source officielle', url: '' },
      title: `${loose.length} éléments au même niveau`, detail: 'Au-delà de 8 éléments sans regroupement, un écran de téléphone devient difficile à parcourir. Ce seuil est un repère d’Atelier, pas une règle officielle.',
      instruction: 'Regroupe les éléments qui vont ensemble pour que l’écran se lise par blocs.' });
  return out;
}
