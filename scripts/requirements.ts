import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const path='docs/EXIGENCES.json';
const previous=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):[];
const old=new Map(previous.map((r:any)=>[r.id,r]));
let section='00',index=0;
const requirements=readFileSync('docs/CAHIER_DES_CHARGES.md','utf8').split(/\n\s*\n/).flatMap(block=>{
 const header=block.match(/^## (\d+)\./);if(header){section=header[1].padStart(2,'0');index=0;return [];}if(block.startsWith('#'))return [];
 const parts=block.startsWith('- ')||/^\d+\./.test(block)?block.split('\n'): [block];
 return parts.filter(Boolean).map(text=>{const id=`REQ-${section}-${String(++index).padStart(3,'0')}`;return old.get(id)??{id,section:Number(section),exigence:text,statut:'à faire',preuve:null,limite:null};});
});
writeFileSync(path,JSON.stringify(requirements,null,2)+'\n');
console.log(`${requirements.length} exigences conservées ; statuts existants préservés.`);
