/* Audit mécanique de docs/EXIGENCES.json : les preuves citées existent-elles ? Quel statut peut-on réellement affirmer ?
   Ne lance aucun test : il relie chaque exigence aux fichiers de preuve présents. Un statut « VALIDÉ » exige au moins un fichier de test
   existant et aucune limite déclarant une simulation ou une absence de vérification réelle. Usage : node scripts/requirements-audit.mjs [--write] */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const list=JSON.parse(readFileSync('docs/EXIGENCES.json','utf8'));
const PATH=/(?:^|[\s;,(])((?:server|web|tests|docs|migrations|scripts|passerelle|public|\.github)\/[A-Za-z0-9_./\-@]+\.[A-Za-z0-9]{1,6})/g;
const WEAK=/simul|non vérifi|non test|pas (?:de )?test|manuel|non rejou|jamais exécut|aucune synchronisation réelle|aucun appel réel|non exécut|bloqu/i;
export function auditOne(r,exists=existsSync){
 const proof=String(r.preuve||''),paths=[...new Set([...proof.matchAll(PATH)].map(m=>m[1]))],missing=paths.filter(p=>!exists(p));
 const tests=paths.filter(p=>p.startsWith('tests/')&&exists(p));
 let level;const note=[];
 if(r.statut==='bloqué')level='BLOQUÉ';
 else if(r.statut==='à faire')level='À FAIRE';
 else if(!paths.length){level='NON VÉRIFIÉ';note.push('aucune preuve citée');}
 else if(missing.length){level='PARTIEL';note.push('preuve cassée : '+missing.join(', '));}
 else if(!tests.length){level='NON VÉRIFIÉ';note.push('code cité, aucun test cité');}
 else if(WEAK.test(String(r.limite||''))){level='PARTIEL';note.push('limite déclarée : '+String(r.limite).slice(0,120));}
 else{level='VALIDÉ';note.push('test(s) : '+tests.slice(0,3).join(', '));}
 return {id:r.id,section:r.section,declared:r.statut,level,paths:paths.length,missing,tests:tests.length,note:note.join(' ; ')};
}
export function auditAll(items,exists=existsSync){return items.map(r=>auditOne(r,exists));}
const isMain=process.argv[1]&&process.argv[1].endsWith('requirements-audit.mjs');
if(isMain){
 const rows=auditAll(list),by=k=>rows.reduce((m,r)=>(m[r[k]]=(m[r[k]]||0)+1,m),{});
 const broken=rows.filter(r=>r.missing.length);
 console.log('Exigences :',rows.length,'| déclaré :',JSON.stringify(by('declared')),'| niveau retenu :',JSON.stringify(by('level')),'| preuves cassées :',broken.length);
 if(process.argv.includes('--write')){
  const head=['# Matrice des exigences — contrôle mécanique des preuves','',`Généré par \`node scripts/requirements-audit.mjs --write\` le ${new Date().toISOString().slice(0,10)}. ${rows.length} exigences, identifiants conservés.`,'',
   '**Règles (aucune n’est un jugement) :** VALIDÉ = au moins un fichier de test cité existe, tous les fichiers cités existent, aucune limite ne déclare une simulation, une absence de test ou un blocage. PARTIEL = preuve cassée ou limite déclarée. NON VÉRIFIÉ = réalisé sans preuve ou sans test cité. BLOQUÉ / À FAIRE = repris du statut déclaré.',
   '**Ce que « VALIDÉ » ne veut pas dire :** le test cité couvre réellement l’exigence (non relu un par un) ; l’intégration a été essayée avec un vrai fournisseur ; la production a été vérifiée.','',
   '| Niveau | Nombre |','|---|---|',...Object.entries(by('level')).map(([k,v])=>`| ${k} | ${v} |`),'',`Preuves citées mais introuvables : **${broken.length}**.`,'','| ID | Section | Statut déclaré | Niveau retenu | Contrôle |','|---|---|---|---|---|'];
  writeFileSync('docs/audits/MATRICE_EXIGENCES_2026-11-13.md',[...head,...rows.map(r=>`| ${r.id} | ${r.section} | ${r.declared} | ${r.level} | ${r.note.replace(/\|/g,'/')} |`)].join('\n')+'\n');
  console.log('écrit : docs/audits/MATRICE_EXIGENCES_2026-11-13.md');
 }
}
