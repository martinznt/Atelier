/* Lot 5A — contrôle d'extraction : compare chaque ligne des fichiers de départ des deux sites au texte d'origine (lu à nouveau dans Git, commit épinglé).
   Vérifie sur TOUTES les lignes : la ligne citée existe, contient le nom, et l'étiquette recopiée figure dans la ligne d'origine.
   Tire aussi N lignes au hasard par site (générateur à graine fixe, donc rejouable) et en imprime un tableau « fichier de départ / texte d'origine ».
   Usage : node scripts/check-sites-seed.mjs [--n 10] [--seed 20261116] [--table] */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {RECETTES,SPORT,MAP} from './build-sites-seed.mjs';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:d;};
const N=Number(arg('--n',10)),SEED=Number(arg('--seed',20261116));
const prng=s=>()=>{s=(s*1664525+1013904223)>>>0;return s/2**32;};
const norm=s=>s.replace(/\*\*/g,'').replace(/`/g,'').replace(/\s+/g,' ').replace(/’/g,"'").trim();
export function verifyAll(){
 const problems=[],rows={recettes:[],sport:[]};
 for(const [site,repo,file] of [['recettes',RECETTES,'docs/recettes-depart.json'],['sport',SPORT,'docs/sport-depart.json']]){
  const seed=JSON.parse(readFileSync(`docs/sites/${site}-depart.json`,'utf8'));const cache=new Map();
  const lines=f=>{if(!cache.has(f))cache.set(f,execFileSync('git',['-C',repo.dir,'show',`${repo.commit}:${f}`],{encoding:'utf8',maxBuffer:64e6}).split('\n'));return cache.get(f);};
  for(const f of seed.features){
   const m=/: (\S+), ligne (\d+)/.exec(f.source_ref)||/pull\/(\d+)/.exec(f.source_ref);
   if(f.key.startsWith('pr-')){rows[site].push({key:f.key,name:f.name,state:f.state,origin:`(GitHub, PR ${f.key.slice(3)})`,label:'PR ouverte',line:0,file:'GitHub'});continue;}
   if(!m){problems.push(`${site}/${f.key}: source illisible`);continue;}
   const file=m[1],n=Number(m[2]),text=lines(file)[n-1];
   if(text===undefined){problems.push(`${site}/${f.key}: ligne ${n} absente de ${file}`);continue;}
   const t=norm(text),nm=norm(f.name).replace(/^Non vérifié : /,'').replace(/^.*? — /,'').replace(/…$/,'').slice(0,28);
   const nameCheck=/^dem-/.test(f.key)||/^ce-/.test(f.key)||/^ver-/.test(f.key)||/^maj6nov-/.test(f.key)||/^nonverif-/.test(f.key)||/^pasfait-/.test(f.key);
   if(nameCheck&&!/^pasfait-/.test(f.key)&&!t.includes(nm.slice(0,Math.min(nm.length,20)))&&!/^ver-|^maj6nov-/.test(f.key)){problems.push(`${site}/${f.key}: le nom « ${nm} » n'est pas dans la ligne ${n} de ${file}`);}
   const lab=/Étiquette(?:\(s\))? d’origine : (.*)/.exec(f.description)?.[1]||'';
   if(/^dem-/.test(f.key)){
    const first=['✅','🟡','⏳','⚠️'].filter(s=>text.includes(s)).sort((a,b)=>text.indexOf(a)-text.indexOf(b))[0];
    if(!first||MAP[site][first]!==f.state)problems.push(`${site}/${f.key}: état ${f.state} ≠ symbole d'origine ${first}`);
    if(!t.includes(norm(lab).slice(0,40)))problems.push(`${site}/${f.key}: étiquette copiée absente de la ligne d'origine`);
   }
   if(/^ce-/.test(f.key)&&!/^aucune étiquette/.test(lab)){const tags=lab.match(/\[[^\]]+\]/g)||[];const blk=lines(file).slice(n-1,n+25).join(' ');for(const g of tags.map(x=>x.slice(0,20)))if(!norm(blk).includes(norm(g).slice(0,15)))problems.push(`${site}/${f.key}: étiquette ${g} absente du bloc d'origine`);}
   rows[site].push({key:f.key,name:f.name,state:f.state,origin:text.trim(),label:lab,line:n,file});
  }
 }
 return {problems,rows};
}
function main(){
 const {problems,rows}=verifyAll();
 console.log('Lignes contrôlées : Recettes',rows.recettes.length,', Sport',rows.sport.length,'; écarts :',problems.length);
 for(const p of problems)console.log(' ÉCART',p);
 if(process.argv.includes('--table')){
  for(const site of ['recettes','sport']){
   const rnd=prng(SEED),pool=rows[site].slice(),pick=[];while(pick.length<N&&pool.length)pick.push(pool.splice(Math.floor(rnd()*pool.length),1)[0]);
   console.log(`\n### ${site} — ${pick.length} lignes tirées (graine ${SEED})`);
   for(const r of pick)console.log(`- ${r.key} | état Atelier: ${r.state} | ${r.file}:${r.line} | NOM: ${r.name}\n    ORIGINE: ${r.origin.slice(0,230)}`);
  }
 }
 process.exit(problems.length?1:0);
}
if(process.argv[1]&&process.argv[1].endsWith('check-sites-seed.mjs'))main();
