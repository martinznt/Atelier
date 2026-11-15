// Mesure en lecture seule du texte d'une archive d'export ChatGPT (lot 0, 15 novembre 2026).
// Usage : node scripts/mesure-texte-archive.mjs chemin/archive.zip
// N'affiche QUE des nombres : aucun titre, aucun texte de conversation. Ne modifie rien.
import {readFileSync} from 'node:fs';
import {unzipSync} from 'fflate';
const zip=new Uint8Array(readFileSync(process.argv[2]||(()=>{throw new Error('Usage : node scripts/mesure-texte-archive.mjs archive.zip');})()));
const LIMITE=52428800; // 50 Mio : plafond de texte importé par compte (déclencheur message_usage_insert, migration 0002)
const files=unzipSync(zip,{filter:f=>/(^|\/)conversations[^/]*\.json$/i.test(f.name)&&!/^(sites|pieces_jointes|bibliotheque_non_rattachee)\//.test(f.name)});
const enc=new TextEncoder();let total=0,conv=0,msgs=0,longs=0;
for(const [name,bytes] of Object.entries(files)){
 const v=JSON.parse(new TextDecoder().decode(bytes));const list=Array.isArray(v)?v:v.conversations||[];
 for(const c of list){conv++;for(const n of Object.values(c.mapping||{})){const m=n.message;if(!m)continue;let s='';
  if(Array.isArray(m.content?.parts))for(const p of m.content.parts)if(typeof p==='string')s+=p;if(m.content?.text)s+=m.content.text;
  const b=enc.encode(s).length;if(b>0){msgs++;total+=b;if(s.length>12000)longs++;}}}
}
console.log('Fichiers de conversations lus :',Object.keys(files).length);
console.log('Conversations :',conv,'| messages avec texte :',msgs,'(dont',longs,'découpés en plusieurs parties de 12 000 caractères)');
console.log('Texte total :',(total/1048576).toFixed(2),'Mio ; plafond d’Atelier :',(LIMITE/1048576),'Mio ;',Math.round(total/LIMITE*100),'% du plafond');
console.log(total>LIMITE?'DÉPASSE le plafond : importer par projet ou me prévenir.':'Sous le plafond.');
