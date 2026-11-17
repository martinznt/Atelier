/* Lot 5B (5B-2) — palettes de couleurs des deux sites, lues EN LECTURE SEULE dans les dépôts (git show à un commit épinglé).
   Aucune écriture dans Livre-de-recettes ni Sport. Écrit server/site-palettes.ts. Usage : node scripts/build-palettes.mjs [--check]
   Sans les clones (CI GitHub), --check ne vérifie que la forme du fichier versionné. */
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
const OUT='server/site-palettes.ts';
const SITES=[
 {key:'recettes',label:'Livre de recettes',repo:'martinznt/Livre-de-recettes',dir:'/home/user/Livre-de-recettes',commit:'92ec7c54c9987d52fcaa0f838dce01d60c3c7f50',file:'public/css/app.css',
  theme:'thème sombre par défaut et couleurs « papier » du livre',ranges:[[38,76]]},
 {key:'sport',label:'Sport',repo:'martinznt/Sport',dir:'/home/user/Sport',commit:'f0ef3b008e38f54b28c49d8f1ae9605d07298f29',file:'public/style.css',
  theme:'thème sombre par défaut ; les lignes 161 (fonds des cartes) remplacent celles de la ligne 4',ranges:[[3,4],[161,161]]}
];
const DECL=/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
const norm=h=>h.length===4?'#'+[...h.slice(1)].map(c=>c+c).join('').toLowerCase():h.toLowerCase();
function build(){
 return SITES.map(s=>{
  const text=execFileSync('git',['-C',s.dir,'show',`${s.commit}:${s.file}`],{encoding:'utf8'}).split('\n');
  const head=execFileSync('git',['-C',s.dir,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const byToken=new Map();
  for(const [a,b] of s.ranges)for(let n=a;n<=b;n++){for(const m of (text[n-1]||'').matchAll(DECL))byToken.set(m[1],{token:'--'+m[1],hex:norm(m[2]),line:n});}
  return {key:s.key,label:s.label,repo:s.repo,commit:s.commit,file:s.file,theme:s.theme,colors:[...byToken.values()].sort((x,y)=>x.line-y.line||x.token.localeCompare(y.token)),_head:head};
 });
}
const render=(sites)=>`/* GÉNÉRÉ par scripts/build-palettes.mjs — ne pas modifier à la main. Couleurs lues en lecture seule dans les dépôts des sites, à un commit épinglé. */
export interface SiteColor{token:string;hex:string;line:number}
export interface SitePalette{key:string;label:string;repo:string;commit:string;file:string;theme:string;colors:SiteColor[]}
export const SITE_PALETTES:SitePalette[]=${JSON.stringify(sites.map(({_head,...s})=>s),null,1)};
`;
if(process.argv.includes('--check')){
 if(!SITES.every(s=>existsSync(s.dir))){console.log('Clones absents : seule la forme du fichier est vérifiée.');process.exit(0);}
 const want=render(build());if(readFileSync(OUT,'utf8')!==want){console.error('Palettes pas à jour : relancer node scripts/build-palettes.mjs');process.exit(1);}
 console.log('Palettes à jour.');
}else{const sites=build();writeFileSync(OUT,render(sites));for(const s of sites)console.log(s.key,s.colors.length,'couleurs, commit',s.commit.slice(0,7),'(HEAD du clone',s._head.slice(0,7)+')');}
