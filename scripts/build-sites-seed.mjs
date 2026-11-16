/* Lot 5A — fabrique les deux fichiers de départ « Livre de recettes » et « Sport » à partir de leurs documents de suivi.
   LECTURE SEULE : les deux dépôts sont lus avec `git show <commit>:<fichier>` dans un dossier local ; rien n'y est jamais écrit
   (aucune commande git qui modifie : seulement `rev-parse` et `show`).
   Règles (aucun état inventé) :
   - une ligne d'un document = une fonctionnalité ; sa source est « fichier, ligne, section, commit » ;
   - l'étiquette d'origine (✅ 🟡 ⏳ ⚠️ ou [testé] [code] [non vérifié]) est RECOPIÉE dans la description, jamais remplacée ;
   - l'état d'Atelier (5 valeurs) est déduit par une table fixe, écrite ci-dessous et dans le rapport ;
   - le niveau est toujours « Rapporté » : Atelier n'a rien rejoué (aucune ligne n'est « Vérifié ») ;
   - un état mixte (plusieurs symboles dans la même cellule) est signalé « à trancher » et listé dans docs/sites/EXTRACTION.json.
   Usage : node scripts/build-sites-seed.mjs [--recettes <dossier>] [--sport <dossier>] [--check]
   (--check : n'écrit rien, échoue si les fichiers versionnés diffèrent de ce que fabrique le script) */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

export const RECETTES={repo:'martinznt/Livre-de-recettes',commit:'92ec7c54c9987d52fcaa0f838dce01d60c3c7f50',dir:'/home/user/Livre-de-recettes'};
export const SPORT={repo:'martinznt/Sport',commit:'f0ef3b008e38f54b28c49d8f1ae9605d07298f29',dir:'/home/user/Sport'};
const OUT='docs/sites';
const arg=n=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:undefined;};

/* Table de correspondance symbole d'origine → état d'Atelier. Le sens de ⏳ DIFFÈRE entre les deux sites (voir A_TRANCHER.md). */
export const MAP={
 recettes:{'✅':'done','🟡':'in_progress','⏳':'to_design','⚠️':'blocked'},
 sport:{'✅':'done','🟡':'in_progress','⏳':'in_progress','⚠️':'blocked'}
};
export const SYMBOL_MEANING={
 recettes:{'✅':'fait et vérifié dans le navigateur','🟡':'fait, vérification à finir','⏳':'à faire','⚠️':'limite (pas possible)'},
 sport:{'✅':'fait et vérifié dans le navigateur','🟡':'fait, vérification à finir','⏳':'en cours','⚠️':'limite (pas possible)'}
};
const SYMBOLS=['✅','🟡','⏳','⚠️'];

const show=(r,file)=>execFileSync('git',['-C',r.dir,'show',`${r.commit}:${file}`],{encoding:'utf8',maxBuffer:64*1024*1024});
export const sha=s=>createHash('sha256').update(s).digest('hex');
const clean=s=>s.replace(/\*\*/g,'').replace(/`/g,'').replace(/\s+/g,' ').trim();
const cut=(s,n)=>s.length<=n?s:s.slice(0,n-1).replace(/\s+\S*$/,'')+'…';
const short=r=>r.commit.slice(0,7);
const symbolsIn=s=>SYMBOLS.filter(x=>s.includes(x));
const used=new Set();
const mkKey=(prefix,text)=>{let k=prefix+'-'+sha(text).slice(0,10),n=1;while(used.has(k))k=prefix+'-'+sha(text+'#'+(++n)).slice(0,10);used.add(k);return k;};

/** Lignes de tableau « Demande | État | Où le voir » d'un document de demandes. 3 colonnes = a un état ; 2 colonnes = pas d'état d'origine (non reprises). */
function parseDemandes(r,file,site,prefix,group){
 const lines=show(r,file).split('\n'),features=[],skipped=[],mixed=[];let section='';
 lines.forEach((l,i)=>{
  if(/^#{1,3} /.test(l))section=clean(l.replace(/^#+\s*/,''));
  if(!/^\|/.test(l))return;
  const c=l.replace(/^\||\|\s*$/g,'').split('|').map(s=>s.trim());
  if(/^:?-+:?$/.test(c[0])||/^Demande$/.test(c[0]))return;
  const where=`${file}, ligne ${i+1}`;
  if(c.length<3){skipped.push({where,section,texte:cut(clean(c[0]),90),raison:'tableau sans colonne « État » : aucun état d’origine, ligne non reprise'});return;}
  const syms=symbolsIn(c[1]);
  if(!syms.length){skipped.push({where,section,texte:cut(clean(c[0]),90),raison:'état illisible (aucun des quatre symboles) : ligne non reprise'});return;}
  const first=syms.slice().sort((a,b)=>c[1].indexOf(a)-c[1].indexOf(b))[0];
  const isMixed=syms.length>1||/sauf|\(sauf/i.test(c[1]);
  if(isMixed)mixed.push({where,texte:cut(clean(c[0]),90),etiquette:cut(clean(c[1]),120)});
  const name=clean(c[0]);
  const desc=[`Étiquette d’origine : ${clean(c[1])}`,`Où le voir (selon le document) : ${clean(c[2])}`,
   `Sens du symbole « ${first} » dans ce document : ${SYMBOL_MEANING[site][first]}.`,
   isMixed?'ÉTAT MIXTE dans le document (plusieurs symboles ou une exception) : l’état d’Atelier suit le premier symbole ; à trancher par Martin.':'',
   'Niveau Atelier : Rapporté (écrit dans le dépôt, non rejoué par Atelier).'].filter(Boolean).join('\n');
  features.push({key:mkKey(prefix,name),name:cut(name,140),description:cut(desc,1100),state:MAP[site][first],group:cut(group+' — '+section,80),
   source_kind:'repo_file',source_ref:cut(`${r.repo} : ${where} (section « ${section} »), commit ${short(r)}`,300),reliability:'reported',test_ref:''});
 });
 return {features,skipped,mixed};
}

/* ───────── Livre de recettes ───────── */
function buildRecettes(){
 const R=RECETTES,site='recettes',extra={skipped:[],mixed:[],ignored:[]};
 const d=parseDemandes(R,'docs/DEMANDES_4_0.md',site,'dem','Demandes (DEMANDES_4_0)');
 const features=[...d.features];extra.skipped.push(...d.skipped);extra.mixed.push(...d.mixed);
 const lines=show(R,'CE_QUI_MANQUE.txt').split('\n');
 const F='CE_QUI_MANQUE.txt';
 const tagsOf=t=>[...new Set([...t.matchAll(/\[(testé|code|non vérifié|simulé|PAUSE[^\]]*|intégré[^\]]*)[^\]]*\]/gi)].map(m=>m[0].length>70?m[0].slice(0,69)+'…]':m[0]))];
 /* a) sections 3 et 4 : « 3.1 … », « 4.9 … » (un élément = du numéro jusqu'au suivant ou à la section 5) */
 let i=0;
 const secStart=lines.findIndex(l=>/^3\. ACTIONS QUE TOI SEUL/.test(l)),secEnd=lines.findIndex(l=>/^5\. TESTS ET VÉRIFICATIONS JAMAIS FAITS/.test(l));
 const items=[];
 for(i=secStart;i<secEnd;i++){
  const m=/^([34]\.\d+) (.*)$/.exec(lines[i]);
  if(m){items.push({num:m[1],start:i,text:[m[2]]});continue;}
  if(items.length&&i>items.at(-1).start&&!/^[0-9]\. [A-ZÀ-Ý]/.test(lines[i]))items.at(-1).text.push(lines[i]);
 }
 for(const it of items){
  const full=clean(it.text.join(' ')),tags=tagsOf(full);
  const title=cut(full.split(/\. |, voir | \(/)[0].replace(/[.:]+$/,''),130);
  const blocked=/BLOQUÉ/.test(full);
  const sec=it.num.startsWith('3')?'Actions que Martin seul peut faire (§3)':'Ce qui reste ouvert (§4)';
  const desc=[`Étiquette(s) d’origine : ${tags.length?tags.join(' '):'aucune étiquette de preuve (testé, code, non vérifié) dans cet élément'}${blocked?' ; mot « BLOQUÉ » dans le texte':''}`,
   `Texte du document : ${cut(full,640)}`,
   'État d’Atelier « '+(blocked?'Bloqué':'À concevoir')+' » : élément listé comme à faire ou ouvert dans le document ('+(blocked?'le texte dit BLOQUÉ':'aucun état plus précis n’est écrit')+').',
   'Niveau Atelier : Rapporté (écrit dans le dépôt, non rejoué).'].join('\n');
  features.push({key:`ce-${it.num.replace('.','-')}`,name:`${it.num} — ${title}`.slice(0,140),description:cut(desc,1500),state:blocked?'blocked':'to_design',group:sec,
   source_kind:'repo_file',source_ref:cut(`${R.repo} : ${F}, ligne ${it.start+1} (élément ${it.num}), commit ${short(R)}`,300),reliability:'reported',test_ref:''});used.add(`ce-${it.num.replace('.','-')}`);
 }
 /* b) §2 « Version … » (lignes commençant par « Version » à la marge) */
 const s2=lines.findIndex(l=>/^2\. CE QUI EST FAIT/.test(l)),s3=lines.findIndex(l=>/^3\. ACTIONS QUE TOI SEUL/.test(l));
 for(let j=s2+1;j<s3;j++){
  const m=/^Version ([^(\n]+?) \(([^)]*)\)\s*(\[[^\]]*\])?\s*$/.exec(lines[j]);if(!m)continue;
  const body=[];for(let k=j+1;k<s3&&!/^Version /.test(lines[k]);k++)body.push(lines[k]);
  const txt=cut(clean(body.join(' ')),520);
  features.push({key:mkKey('ver',lines[j]),name:cut(`Version ${m[1].trim()}`,140),state:'done',group:'Versions faites (§2)',
   description:cut([`Étiquette d’origine : ${m[3]||'aucune étiquette sur la ligne de titre'} — titre : « ${clean(lines[j])} »`,`Début du texte : ${txt}`,'État d’Atelier « Fait » : le titre de la section 2 dit « fait (fusionné dans main) ».','Niveau Atelier : Rapporté (écrit dans le dépôt, non rejoué).'].join('\n'),1500),
   source_kind:'repo_file',source_ref:cut(`${R.repo} : ${F}, ligne ${j+1} (§2), commit ${short(R)}`,300),reliability:'reported',test_ref:''});
 }
 /* c) mise à jour du 6 novembre : lignes « [tag] 4.X.0, Titre : … » + « Pas encore fait (inchangé) » */
 const u=lines.findIndex(l=>/^=== MISE À JOUR DU 6 NOVEMBRE 2026/.test(l));
 if(u<0)throw new Error('Section « mise à jour du 6 novembre » introuvable dans CE_QUI_MANQUE.txt');
 const ends=[];for(let j=u+1;j<lines.length;j++){if(/^\[(testé|code)\] 4\.\d+\.0, /.test(lines[j]))ends.push(j);}
 const lastItemEnd=lines.findIndex((l,j)=>j>u&&/^Pas encore fait \(inchangé\)/.test(l));
 ends.forEach((j,n)=>{
  const stop=n+1<ends.length?ends[n+1]:lastItemEnd,txt=clean(lines.slice(j,stop).join(' '));
  const m=/^\[(testé|code)\] (4\.\d+\.0), ([^:]+?) :/.exec(txt);if(!m)throw new Error('Ligne inattendue : '+lines[j]);
  const tags=tagsOf(txt);
  features.push({key:`maj6nov-${m[2].replace(/\./g,'-')}`,name:cut(`Version ${m[2]} — ${m[3]}`,140),state:'done',group:'Lots 4.9.0 à 4.19.0 (mise à jour du 6 novembre)',
   description:cut([`Étiquette(s) d’origine : ${tags.join(' ')}`,`Texte du document : ${cut(txt,700)}`,'État d’Atelier « Fait » : le document présente ce lot comme écrit (PR #118 à #127), avec les limites citées dans le texte.','Niveau Atelier : Rapporté (écrit dans le dépôt, non rejoué).'].join('\n'),1500),
   source_kind:'repo_file',source_ref:cut(`${R.repo} : ${F}, ligne ${j+1} (mise à jour du 6 novembre), commit ${short(R)}`,300),reliability:'reported',test_ref:''});used.add(`maj6nov-${m[2].replace(/\./g,'-')}`);
 });
 if(lastItemEnd<0)throw new Error('« Pas encore fait (inchangé) » introuvable');
 const rest=clean(lines.slice(lastItemEnd).join(' ')).replace(/^Pas encore fait \(inchangé\) : /,'');
 for(const [k,t] of [['duree-resultat-attention','durée/résultat/attention comme champs d’étape'],['planning-multi-jours','planning multi-jours réel'],['ouverture-fiche-origine','ouverture de la fiche d’origine'],['sauvegarde-production','sauvegarde de production (jamais faite)']]){
  const ok=rest.includes(t.replace('’',"'"))||rest.includes(t);if(!ok)throw new Error('Élément « pas encore fait » introuvable : '+t);
  features.push({key:`pasfait-${k}`,name:cut(t.charAt(0).toUpperCase()+t.slice(1),140),state:'to_design',group:'Pas encore fait (mise à jour du 6 novembre)',
   description:`Étiquette d’origine : liste « Pas encore fait (inchangé) » ; texte : « ${cut(rest,300)} »\nÉtat d’Atelier « À concevoir » : le document dit que ce n’est pas encore fait.\nNiveau Atelier : Rapporté (écrit dans le dépôt, non rejoué).`,
   source_kind:'repo_file',source_ref:cut(`${R.repo} : ${F}, ligne ${lastItemEnd+1} (« Pas encore fait (inchangé) »), commit ${short(R)}`,300),reliability:'reported',test_ref:''});used.add(`pasfait-${k}`);
 }
 /* d) PR ouvertes lues sur GitHub le 16 novembre 2026 (lecture seule, connecteur de la session ; pas le jeton d'Atelier) */
 for(const p of PR_RECETTES)features.push({key:`pr-${p.n}`,name:cut(`PR n°${p.n} — ${p.title}`,140),state:'in_progress',group:'PR ouvertes (GitHub, lu le 16 novembre 2026)',
  description:cut([`Étiquette d’origine : PR ${p.draft?'en brouillon':'non brouillon'}, ouverte le ${p.created.slice(0,10)}, branche « ${p.head} », tête ${p.sha.slice(0,7)}, base « ${p.base} ».`,p.note,'État d’Atelier « En cours » : la PR est ouverte et non fusionnée (V : liste GitHub du 16 novembre) ; son contenu n’a pas été relu par Atelier.','Niveau Atelier : Rapporté.'].join('\n'),1100),
  source_kind:'other',source_ref:cut(`GitHub ${R.repo} pull/${p.n} (liste des PR ouvertes lue le 2026-11-16), tête ${p.sha.slice(0,7)}`,300),reliability:'reported',test_ref:''});
 const decisions=RECETTES_DECISIONS.map(x=>({key:x.key,title:x.title,reason:x.reason,source_ref:cut(`${R.repo} : ${x.src}, commit ${short(R)}`,300)}));
 return {file:{format:'atelier-depart',version:1,project:{name:'Livre de recettes',repo:R.repo,pinned_commit:R.commit,note:'Dépôt à relier en LECTURE SEULE. Gabarit « Livre de recettes ». Fichier fabriqué par scripts/build-sites-seed.mjs (lot 5A) : une ligne de document = une fonctionnalité ; étiquettes d’origine recopiées ; niveau « Rapporté » partout.'},features,decisions},extra};
}
/* Lu sur GitHub (liste des PR ouvertes, 16 novembre 2026). Titres et branches : texte public du dépôt, aucune conversation. */
const PR_RECETTES=[
 {n:139,title:'file de tâches sûres pour Atelier (limite d’usage de Claude Code)',draft:true,created:'2026-11-07',head:'ccr-580e31b2-ifkrv4',sha:'98eed3be8bdd065d55f2c3f4899c9a368b0aaa7b',base:'main',note:'La PR décrit un seul document (docs/agents/FILE_ATELIER.md) ; aucun code.'},
 {n:107,title:'suspension temporaire du site avec liste d’accès et alertes push',draft:true,created:'2026-10-30',head:'chatgpt/access-suspension-2026-10-30',sha:'679853779e39d2cb00fa516f8af4f4818c33c88a',base:'main (base du 30 octobre)',note:'Branche « chatgpt/… » : hors du schéma claude/ et codex/ des consignes.'},
 {n:98,title:'[N16] Choisir les icônes globales app et notifications depuis la galerie',draft:false,created:'2026-10-25',head:'codex/n16-icones-globales',sha:'c1a5a92f04dcdda5c5363f7f3442cb1ff36bae19',base:'main (base du 25 octobre)',note:'Non brouillon ; la description dit « prête pour relecture » et signale des conflits avec main.'},
 {n:97,title:'[C-V2-D] Mon livre : « Toutes · Mes recettes · Communes » en un toucher',draft:false,created:'2026-10-25',head:'claude/v2-organiser',sha:'8e858342f5eaab13df388f4688ee0961ecd30bf3',base:'claude/v2-a-prevoir-decisions (PR empilée sur n°96)',note:'PR empilée : sa base n’est pas main.'},
 {n:96,title:'[V2 N02 écran] À prévoir : répondre « Même produit » ou « Différents »',draft:false,created:'2026-10-25',head:'claude/v2-a-prevoir-decisions',sha:'98f22c1070ebb3aa574b9ecb948f762f03992539',base:'main (base du 25 octobre)',note:'La description cite une pile (#93) dont Atelier n’a pas vérifié l’état.'},
 {n:94,title:'[N15] Adapter les recettes entre moules ronds, carrés et rectangles',draft:true,created:'2026-10-25',head:'codex/n15-formats-moules',sha:'5cf250fef9c0596ac03e7841128edc45b27cbf4c',base:'main (base du 25 octobre)',note:'Brouillon ; « Aucune fusion/déploiement par Codex » ; interface Quantités non testée selon la description.'},
 {n:81,title:'[Passation] Claude Code → Codex : dossier de reprise',draft:false,created:'2026-10-25',head:'claude/passation-codex',sha:'89f80e0828018133cbe3b09aca4ec34366331f02',base:'main (base du 25 octobre)',note:'Document seul ; parle d’un partage Claude Code / Codex que Martin dit périmé (Codex n’est plus utilisé).'},
 {n:69,title:'[N00] Complément V2 : contrats proposés et coordination des nouveaux moteurs',draft:true,created:'2026-10-25',head:'codex/n00-contrats-v2',sha:'f391c5f9f8e4bb21265c90465a763779b023078b',base:'main (base du 25 octobre)',note:'Contrats « proposés/non implémentés » ; demande une coordination avec Claude (consignes d’octobre).'},
 {n:61,title:'WIP — imports lien/photo/partage : travail conservé, développement en pause',draft:true,created:'2026-10-24',head:'codex/x6-import-web',sha:'d34bdf499a23e3f6d3e33fa35857b2b0bf251c94',base:'codex/x4-import-regles (PR empilée)',note:'« EN PAUSE à la demande de Martin le 27 octobre » ; « Ne pas intégrer cette PR » (texte de la PR).'}
];
/* Règles propres au dépôt : lignes de AGENTS.md (lues au commit épinglé). Proposées, jamais « actuelles » : Martin valide. */
const RECETTES_DECISIONS=[
 {key:'rec-regle-gratuit',title:'Livre de recettes — tout gratuit, aucune IA ni service payant ajouté',reason:'AGENTS.md, règle commune n°10 : « Tout gratuit : aucune IA ni aucun service payant ajouté. »',src:'AGENTS.md (règle commune 10)'},
 {key:'rec-regle-kv',title:'Livre de recettes — un seul KV (RECETTES_KV), jamais d’autre ni de clé supprimée',reason:'AGENTS.md, règle commune n°6 : ne jamais créer un autre KV, ni changer l’identifiant de RECETTES_KV, ni supprimer de clés existantes.',src:'AGENTS.md (règle commune 6)'},
 {key:'rec-regle-test',title:'Livre de recettes — un test pour chaque nouveauté et chaque bug corrigé',reason:'AGENTS.md, règle commune n°8 : les tests existants restent verts ; aucun test supprimé ou affaibli.',src:'AGENTS.md (règle commune 8)'},
 {key:'rec-regle-fusion',title:'Livre de recettes — une fusion dans main met le site en ligne (Martin fusionne)',reason:'AGENTS.md, règle commune n°2 : chaque fusion dans main est mise en ligne automatiquement.',src:'AGENTS.md (introduction et règle commune 2)'}
];

/* ───────── Sport ───────── */
function buildSport(){
 const S=SPORT,site='sport',extra={skipped:[],mixed:[],ignored:[]};
 const d=parseDemandes(S,'docs/DEMANDES_8_35.md',site,'dem','Demandes (DEMANDES_8_35)');
 const features=[...d.features];extra.skipped.push(...d.skipped);extra.mixed.push(...d.mixed);
 /* « Ce qui n'a pas pu être vérifié ici » et actions de Martin : DELIVERY_8_35.md */
 const L=show(S,'DELIVERY_8_35.md').split('\n');
 const a=L.findIndex(l=>/^## Ce qui n'a pas pu être vérifié ici/.test(l));if(a<0)throw new Error('Section « Ce qui n’a pas pu être vérifié ici » introuvable');
 let n=0;
 for(let j=a+1;j<L.length&&!/^## /.test(L[j]);j++){
  if(!/^- /.test(L[j]))continue;
  const body=clean(L[j].replace(/^- /,'')),label=body.split(/ : |\. /)[0];
  features.push({key:`nonverif-${++n}`,name:cut('Non vérifié : '+label.replace(/[:.]+$/,''),140),state:'to_design',group:'Non vérifié (DELIVERY_8_35)',
   description:cut([`Étiquette d’origine : section « Ce qui n’a pas pu être vérifié ici ».`,`Texte du document : ${cut(body,600)}`,'État d’Atelier « À concevoir » : le document dit que ce point n’a pas pu être vérifié ; aucun état plus précis n’est écrit.','Niveau Atelier : Rapporté.'].join('\n'),1500),
   source_kind:'repo_file',source_ref:cut(`${S.repo} : DELIVERY_8_35.md, ligne ${j+1} (« Ce qui n’a pas pu être vérifié ici »), commit ${short(S)}`,300),reliability:'reported',test_ref:''});used.add(`nonverif-${n}`);
 }
 if(!n)throw new Error('Aucun élément « non vérifié » extrait de DELIVERY_8_35.md');
 const tv=L.findIndex(l=>/^## Toujours valables/.test(l));
 /* « Toujours valables » est dans DEMANDES_8_35.md (dernière section) : règles propres au dépôt */
 const D=show(S,'docs/DEMANDES_8_35.md').split('\n'),tj=D.findIndex(l=>/^## Toujours valables/.test(l));
 if(tj<0)throw new Error('Section « Toujours valables » introuvable dans DEMANDES_8_35.md');
 const toujours=clean(D.slice(tj+1).join(' '));
 const decisions=[
  {key:'spt-toujours-valables',title:'Sport — règles « toujours valables » du dernier livrable (pas de déploiement sans Martin, base : ajouts seulement)',reason:cut(toujours,1900),source_ref:cut(`${S.repo} : docs/DEMANDES_8_35.md, ligne ${tj+1} (« Toujours valables »), commit ${short(S)}`,300)}
 ];
 void tv;
 return {file:{format:'atelier-depart',version:1,project:{name:'Sport',repo:S.repo,pinned_commit:S.commit,note:'Dépôt à relier en LECTURE SEULE. Gabarit « Sport / Mes séances ». Aucun AGENTS.md ni CLAUDE.md dans ce dépôt : aucune règle propre n’est inventée. Fichier fabriqué par scripts/build-sites-seed.mjs (lot 5A).'},features,decisions},extra};
}

/* ───────── Sortie ───────── */
export function buildAll(dirs={}){
 if(dirs.recettes)RECETTES.dir=dirs.recettes;if(dirs.sport)SPORT.dir=dirs.sport;
 for(const r of [RECETTES,SPORT]){
  if(!existsSync(r.dir))throw new Error(`Dossier introuvable : ${r.dir} (option --recettes / --sport)`);
  try{execFileSync('git',['-C',r.dir,'cat-file','-e',`${r.commit}^{commit}`],{stdio:'ignore'});}catch{throw new Error(`Le commit ${r.commit} est absent de ${r.dir} : fetch en lecture suffit (git fetch), rien ne s’écrit dans ce dépôt par Atelier.`);}
 }
 used.clear();const rec=buildRecettes(),spo=buildSport();
 const extraction={commits:{[RECETTES.repo]:RECETTES.commit,[SPORT.repo]:SPORT.commit},table_etats:MAP,sens_des_symboles:SYMBOL_MEANING,
  recettes:{features:rec.file.features.length,decisions:rec.file.decisions.length,lignes_non_reprises:rec.extra.skipped,etats_mixtes:rec.extra.mixed},
  sport:{features:spo.file.features.length,decisions:spo.file.decisions.length,lignes_non_reprises:spo.extra.skipped,etats_mixtes:spo.extra.mixed}};
 return {recettes:rec.file,sport:spo.file,extraction};
}
const isMain=process.argv[1]&&process.argv[1].endsWith('build-sites-seed.mjs');
if(isMain){
 const all=buildAll({recettes:arg('--recettes'),sport:arg('--sport')});
 const outputs=[[`${OUT}/recettes-depart.json`,all.recettes],[`${OUT}/sport-depart.json`,all.sport],[`${OUT}/EXTRACTION.json`,all.extraction]].map(([p,o])=>[p,JSON.stringify(o,null,1)+'\n']);
 for(const [p,t] of outputs)if(Buffer.byteLength(t)>300_000&&p.endsWith('-depart.json')){console.error(`${p} dépasse la limite d’import de 300 000 octets (${Buffer.byteLength(t)})`);process.exit(1);}
 if(process.argv.includes('--check')){
  for(const [p,t] of outputs){const cur=existsSync(p)?readFileSync(p,'utf8'):'';if(cur!==t){console.error(`${p} n’est pas à jour : relancer node scripts/build-sites-seed.mjs`);process.exit(1);}}
  console.log('Fichiers de départ des deux sites à jour :',all.recettes.features.length,'fonctionnalités (Recettes),',all.sport.features.length,'(Sport)');
 }else{mkdirSync(OUT,{recursive:true});for(const [p,t] of outputs){writeFileSync(p,t);console.log('écrit',p,Buffer.byteLength(t),'octets');}
  console.log('Recettes :',all.recettes.features.length,'fonctionnalités,',all.recettes.decisions.length,'décisions ; Sport :',all.sport.features.length,',',all.sport.decisions.length);}
}
