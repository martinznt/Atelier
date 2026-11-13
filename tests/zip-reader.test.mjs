import test from 'node:test';import assert from 'node:assert/strict';import {createHash,randomBytes} from 'node:crypto';
import {zipSync,deflateSync} from 'fflate';
import {Sha256,sha256Blob} from '../web/sha256-stream.ts';
import {openZip,readEntry,streamEntry,ZipError,DEFAULT_LIMITS} from '../web/zip-reader.ts';
import {sniffBytes} from '../server/file-sniff.ts';
import {isConversationFile,entryNameProblem,attachmentRefs,matchAttachment} from '../server/export-inventory.ts';
const enc=s=>new TextEncoder().encode(s);const blob=u=>new Blob([u]);
test('SHA-256 incrémental = Node, quelle que soit la découpe, et la voie native donne la même empreinte',async()=>{
 for(const n of [0,1,55,56,63,64,65,119,120,1000,70001]){const d=randomBytes(n),want=createHash('sha256').update(d).digest('hex');
  const h=new Sha256();for(let i=0;i<d.length;i+=37)h.update(d.subarray(i,i+37));assert.equal(h.digestHex(),want,'n='+n);
  assert.equal(await sha256Blob(blob(d)),want);}
 const big=randomBytes(33*1048576+5);assert.equal(await sha256Blob(blob(big)),createHash('sha256').update(big).digest('hex'));   // voie incrémentale (> 32 Mo)
 let seen=0;await sha256Blob(blob(big),{onProgress:n=>{seen=n;}});assert.equal(seen,big.length);
 await assert.rejects(sha256Blob(blob(big),{signal:{aborted:true}}),/annulée/);
});
const build=files=>blob(zipSync(files));
test('table des matières lue sans décompresser ; segments, pièces jointes et noms dangereux reconnus',async()=>{
 const z=build({'conversations-000.json':enc('[]'),'conversations-001.json':enc('[]'),'user.json':enc('{}'),'file-AbCdEf-photo.png':new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1]),'dossier/':new Uint8Array(0)});
 const {entries,zip64}=await openZip(z);assert.equal(zip64,false);assert.equal(entries.length,5);
 assert.deepEqual(entries.filter(e=>isConversationFile(e.name)).map(e=>e.name),['conversations-000.json','conversations-001.json']);
 assert.equal(isConversationFile('export/conversations.json'),true);assert.equal(isConversationFile('shared_conversations.json'),false);assert.equal(isConversationFile('conversations.json.bak'),false);
 assert.equal(entries.find(e=>e.isDir).name,'dossier/');
 assert.equal(entryNameProblem('../../etc/passwd'),'remontée de dossier (..)');assert.ok(entryNameProblem('/abs'));assert.ok(entryNameProblem('a\\b'));assert.equal(entryNameProblem('ok/file.txt'),null);
});
test('lecture d’une entrée : contenu exact, entrée stockée ou compressée, flux par morceaux',async()=>{
 const payload=enc('x'.repeat(300000)+'fin'),stored=new Uint8Array([1,2,3,4]);
 const z=blob(zipSync({'a.txt':payload,'b.bin':[stored,{level:0}]}));const {entries}=await openZip(z);
 const a=entries.find(e=>e.name==='a.txt'),b=entries.find(e=>e.name==='b.bin');assert.equal(a.method,8);assert.equal(b.method,0);
 assert.deepEqual(await readEntry(z,a),payload);assert.deepEqual(await readEntry(z,b),stored);
 const h=new Sha256();const got=await streamEntry(z,a,c=>h.update(c));assert.equal(got,payload.length);assert.equal(h.digestHex(),createHash('sha256').update(payload).digest('hex'));
 let head=0;await streamEntry(z,a,c=>{head+=c.length;},{stopAfter:16});assert.ok(head>=16);                                                                                        // lecture arrêtée dès la signature obtenue
});
test('archive malformée, tronquée ou hostile : refus net, jamais de plantage',async()=>{
 await assert.rejects(openZip(blob(enc('pas un zip du tout, juste du texte assez long'))),/ZIP|introuvable/);
 await assert.rejects(openZip(blob(new Uint8Array(5))),ZipError);
 const good=zipSync({'a.txt':enc('bonjour')});await assert.rejects(openZip(blob(good.subarray(0,good.length-30))),ZipError);   // fin coupée
 const z=build({'a.txt':enc('bonjour')});const {entries}=await openZip(z);
 await assert.rejects(readEntry(z,{...entries[0],size:entries[0].size+5}),/taille|Décompression/);                              // taille annoncée fausse
 await assert.rejects(readEntry(z,{...entries[0],size:1}),ZipError);                                                              // plus petite que la réalité
 await assert.rejects(readEntry(z,{...entries[0],encrypted:true}),/chiffrée/);
 await assert.rejects(readEntry(z,{...entries[0],method:99}),/non prise en charge/);
 await assert.rejects(readEntry(z,{...entries[0],offset:entries[0].offset+3}),/En-tête/);
 await assert.rejects(readEntry(z,entries[0],DEFAULT_LIMITS,2),/trop volumineuse/);
 const bomb=deflateSync(new Uint8Array(40*1048576));                                                                              // ~40 Mo de zéros, quelques dizaines de Ko compressés
 const e={name:'bombe.bin',size:40*1048576,compressedSize:bomb.length,method:8,offset:0,encrypted:false,isDir:false};
 const fake=new Uint8Array(30+bomb.length);new DataView(fake.buffer).setUint32(0,0x04034b50,true);fake.set(bomb,30);
 await assert.rejects(readEntry(blob(fake),e),/suspect|bombe/);await assert.rejects(streamEntry(blob(fake),e,()=>{}),/suspect|bombe/);
 const liar={...e,size:1000,compressedSize:bomb.length};                                                                          // annonce 1000 octets mais le flux est bien plus grand
 await assert.rejects(streamEntry(blob(fake),liar,()=>{}),ZipError);
});
test('table de ZIP64 : lecture d’une archive annonçant des valeurs 64 bits',async()=>{
 const z=zipSync({'a.txt':enc('x')}),dv=new DataView(z.buffer,z.byteOffset,z.byteLength);
 let e=z.length-22;assert.equal(dv.getUint32(e,true),0x06054b50);
 const cdSize=dv.getUint32(e+12,true),cdOff=dv.getUint32(e+16,true);
 const z64=new Uint8Array(z.length+56+20);z64.set(z.subarray(0,e));
 const r=new DataView(z64.buffer);let p=e;r.setUint32(p,0x06064b50,true);r.setUint32(p+4,44,true);r.setUint16(p+12,45,true);r.setUint32(p+24,1,true);r.setUint32(p+32,1,true);r.setUint32(p+40,cdSize,true);r.setUint32(p+48,cdOff,true);
 p+=56;r.setUint32(p,0x07064b50,true);r.setUint32(p+8,e,true);r.setUint32(p+16,1,true);p+=20;
 z64.set(z.subarray(e),p);const d2=new DataView(z64.buffer);d2.setUint16(p+10,0xffff,true);d2.setUint32(p+12,0xffffffff,true);d2.setUint32(p+16,0xffffffff,true);
 const {entries,zip64}=await openZip(blob(z64));assert.equal(zip64,true);assert.equal(entries[0].name,'a.txt');assert.deepEqual(await readEntry(blob(z64),entries[0]),enc('x'));
});
test('type réel d’un fichier sans extension (.dat) d’après sa signature',()=>{
 const t=(b,k)=>assert.equal(sniffBytes(new Uint8Array(b)).kind,k);
 t([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a],'png');t([0xff,0xd8,0xff,0xe0],'jpeg');t([...enc('%PDF-1.7')],'pdf');t([...enc('GIF89a')],'gif');
 t([...enc('RIFF'),0,0,0,0,...enc('WEBP')],'webp');t([...enc('RIFF'),0,0,0,0,...enc('WAVE')],'wav');t([0,0,0,24,...enc('ftypmp42')],'mp4');t([...enc('ID3'),4],'mp3');t([...enc('OggS')],'ogg');
 t([0x50,0x4b,3,4],'zip');t([...enc('{"a":1}')],'json_or_text');t([...enc('Bonjour tout le monde')],'text');t([...enc('<!DOCTYPE html><p>')],'html');t([0,1,2,3,250,251],'unknown');
 assert.equal(sniffBytes(new Uint8Array(0)).kind,'unknown');
});
test('références de pièces jointes ChatGPT et Claude, rapprochement avec les entrées, ambiguïté signalée',()=>{
 const gpt={mapping:{n1:{message:{metadata:{attachments:[{id:'file-AAAA11',name:'plan.pdf',size:1200,mime_type:'application/pdf'}]},content:{parts:['texte']}}},
  n2:{message:{content:{parts:[{content_type:'image_asset_pointer',asset_pointer:'file-service://file-BBBB22',size_bytes:99}]}}},
  n3:{message:{content:{parts:[{content_type:'image_asset_pointer',asset_pointer:'file-service://file-AAAA11'}]}}}}};
 const refs=attachmentRefs(gpt);assert.deepEqual(refs.map(r=>r.ref_key).sort(),['file-AAAA11','file-BBBB22']);
 assert.equal(refs.find(r=>r.ref_key==='file-AAAA11').name,'plan.pdf');assert.equal(refs.find(r=>r.ref_key==='file-BBBB22').size,99);
 const claude={chat_messages:[{uuid:'m1',attachments:[{file_name:'notes.txt',file_size:10,file_type:'txt',extracted_content:'secret'}],files:[{file_uuid:'u-1',file_name:'img.png'}]}]};
 const c=attachmentRefs(claude);assert.equal(c.length,2);assert.ok(c.every(r=>!JSON.stringify(r).includes('secret')));                  // le contenu extrait n'est jamais copié ici
 assert.deepEqual(attachmentRefs({}),[]);
 const entries=[{id:'1',entry_name:'file-AAAA11-plan.pdf'},{id:'2',entry_name:'dall-e/file-BBBB22.dat'},{id:'3',entry_name:'file-BBBB22x-autre.png'},{id:'4',entry_name:'file-CCCC33-a.png'},{id:'5',entry_name:'file-CCCC33.dat'}];
 assert.deepEqual(matchAttachment('file-AAAA11',entries),{status:'in_archive',file_id:'1',candidates:1});
 assert.equal(matchAttachment('file-BBBB22',entries).file_id,'2');                              // « file-BBBB22x » n'est pas « file-BBBB22 »
 assert.equal(matchAttachment('file-CCCC33',entries).status,'ambiguous');
 assert.equal(matchAttachment('file-ZZZZ99',entries).status,'referenced_only');assert.equal(matchAttachment('x',entries).status,'referenced_only');
});
