import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BLOCK_KINDS,MAX_IMAGE_BYTES,MAX_IMAGE_TEXT,MockupError,cleanBlock,cleanColor,cleanTitle,decodeBase64,screenHeightFor,sniffImage,validateImage} from '../server/mockup-core.ts';

/* Lot 5B (5B-1) — règles pures des maquettes. Les « fichiers » sont des en-têtes fabriqués octet par octet :
   ils reproduisent la forme réelle des formats (PNG, JPEG, WebP lossy / lossless / étendu). Les vraies captures passent par le test navigateur. */
const u32=(n)=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
const u16=(n)=>[(n>>8)&255,n&255];
const le16=(n)=>[n&255,(n>>8)&255];
const le24=(n)=>[n&255,(n>>8)&255,(n>>16)&255];
const pad=(a,len=64)=>Uint8Array.from([...a,...new Array(Math.max(0,len-a.length)).fill(0)]);
const png=(w,h)=>pad([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0,0,0,13,0x49,0x48,0x44,0x52,...u32(w),...u32(h),8,6,0,0,0]);
const jpeg=(w,h)=>pad([0xff,0xd8,0xff,0xe0,...u16(16),0x4a,0x46,0x49,0x46,0,1,1,0,0,1,0,1,0,0,0xff,0xc0,...u16(17),8,...u16(h),...u16(w),3,1,0x22,0,2,0x11,1,3,0x11,1]);
const webpLossy=(w,h)=>pad([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50,0x56,0x50,0x38,0x20,0,0,0,0,0x10,0,0,0x9d,0x01,0x2a,...le16(w),...le16(h)]);
const webpLossless=(w,h)=>{const bits=((w-1)&0x3fff)|(((h-1)&0x3fff)<<14);return pad([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50,0x56,0x50,0x38,0x4c,0,0,0,0,0x2f,bits&255,(bits>>8)&255,(bits>>16)&255,(bits>>>24)&255]);};
const webpExtended=(w,h)=>pad([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50,0x56,0x50,0x38,0x58,10,0,0,0,0,0,0,0,...le24(w-1),...le24(h-1)]);
const b64=(u8)=>Buffer.from(u8).toString('base64');
const throwsMock=(fn,status,re)=>assert.throws(fn,(e)=>e instanceof MockupError&&e.status===status&&re.test(e.message),`attendu ${status} ${re}`);

/* ───── Couleurs ───── */
test('couleur : #rrggbb accepté, majuscules ramenées en minuscules, vide = non choisie',()=>{
 assert.equal(cleanColor('#0B0B0C','x'),'#0b0b0c');assert.equal(cleanColor(' #ffffff ','x'),'#ffffff');
 assert.equal(cleanColor('','x'),'');assert.equal(cleanColor(undefined,'x'),'');assert.equal(cleanColor(null,'x'),'');
});
test('couleur : refuse #fff, un nom, une valeur sans #, un code à 8 chiffres, du code',()=>{
 for(const bad of ['#fff','red','0b0b0c','#0b0b0c80','#gggggg','url(x)','#0b0b0c;color:red'])throwsMock(()=>cleanColor(bad,'Couleur de fond'),400,/Couleur de fond.*#rrggbb/);
});

/* ───── Blocs ───── */
const ok={kind:'button',label:'Bouton Enregistrer',x:16,y:600,w:328,h:48,fill:'#0b0b0c',text_color:'#ffffff',behavior:'Enregistre la recette'};
test('bloc valide : valeurs gardées, nombres lus même écrits comme texte',()=>{
 assert.deepEqual(cleanBlock(ok,780),ok);
 const b=cleanBlock({...ok,x:'16',y:'600',w:'328',h:'48',fill:'',text_color:'',behavior:undefined},780);
 assert.equal(b.x,16);assert.equal(b.fill,'');assert.equal(b.behavior,'');
});
test('bloc : exactement au bord de l’écran = accepté ; un pixel de plus = refusé (droite et bas)',()=>{
 assert.doesNotThrow(()=>cleanBlock({...ok,x:0,w:360,y:732,h:48},780));
 throwsMock(()=>cleanBlock({...ok,x:1,w:360},780),400,/dépasse à droite/);
 throwsMock(()=>cleanBlock({...ok,y:733,h:48},780),400,/dépasse en bas/);
});
test('bloc : type inconnu, nom vide ou trop long, comportement trop long',()=>{
 throwsMock(()=>cleanBlock({...ok,kind:'robot'},780),400,/type de bloc/);
 throwsMock(()=>cleanBlock({...ok,label:'   '},780),400,/nom au bloc/);
 throwsMock(()=>cleanBlock({...ok,label:'x'.repeat(121)},780),400,/trop long/);
 assert.doesNotThrow(()=>cleanBlock({...ok,label:'x'.repeat(120)},780));
 throwsMock(()=>cleanBlock({...ok,behavior:'y'.repeat(501)},780),400,/comportement/i);
});
test('bloc : nombres négatifs, décimaux, vides ou absurdes refusés ; taille nulle refusée',()=>{
 throwsMock(()=>cleanBlock({...ok,x:-1},780),400,/avant le bord/);
 throwsMock(()=>cleanBlock({...ok,y:-5},780),400,/avant le bord/);
 throwsMock(()=>cleanBlock({...ok,w:0},780),400,/au moins 1/);
 throwsMock(()=>cleanBlock({...ok,h:0},780),400,/au moins 1/);
 throwsMock(()=>cleanBlock({...ok,x:1.5},780),400,/nombre entier/);
 throwsMock(()=>cleanBlock({...ok,w:''},780),400,/nombre entier/);
 throwsMock(()=>cleanBlock({...ok,h:'abc'},780),400,/nombre entier/);
 throwsMock(()=>cleanBlock({...ok,w:Infinity},780),400,/nombre entier/);
});
test('bloc : couleur invalide refusée avec le nom du champ',()=>{
 throwsMock(()=>cleanBlock({...ok,fill:'noir'},780),400,/Couleur de fond/);
 throwsMock(()=>cleanBlock({...ok,text_color:'#12'},780),400,/Couleur du texte/);
});
test('neuf types de blocs, tous acceptés',()=>{
 assert.equal(BLOCK_KINDS.length,9);
 for(const k of BLOCK_KINDS)assert.equal(cleanBlock({...ok,kind:k},780).kind,k);
});

/* ───── Formats d'image : on lit l'en-tête réel ───── */
test('en-têtes : PNG, JPEG et les trois formes de WebP donnent le bon format et les bonnes dimensions',()=>{
 assert.deepEqual(sniffImage(png(720,1560)),{mime:'image/png',width:720,height:1560});
 assert.deepEqual(sniffImage(jpeg(720,1560)),{mime:'image/jpeg',width:720,height:1560});
 assert.deepEqual(sniffImage(webpLossy(720,1560)),{mime:'image/webp',width:720,height:1560});
 assert.deepEqual(sniffImage(webpLossless(720,1560)),{mime:'image/webp',width:720,height:1560});
 assert.deepEqual(sniffImage(webpExtended(720,1560)),{mime:'image/webp',width:720,height:1560});
});
test('en-têtes : du texte, un fichier vide, un GIF, un SVG et un HTML ne passent pas pour des images',()=>{
 for(const bytes of [new TextEncoder().encode('Bonjour, ce n’est pas une image, même longue, même très très longue.'),new Uint8Array(0),
  new TextEncoder().encode('GIF89a'+' '.repeat(40)),new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"></svg>'),new TextEncoder().encode('<script>alert(1)</script>'+' '.repeat(40))])
  assert.equal(sniffImage(bytes),null);
});
test('en-têtes : un fichier JPEG tronqué avant ses dimensions est refusé sans planter',()=>{
 assert.equal(sniffImage(Uint8Array.from([0xff,0xd8,0xff,0xe0,0,16,1,2,3])),null);
});
test('base64 : texte valide décodé ; caractères interdits, longueur fausse ou vide refusés',()=>{
 assert.deepEqual([...decodeBase64('AQID')],[1,2,3]);
 throwsMock(()=>decodeBase64('AQI*'),400,/invalides/);throwsMock(()=>decodeBase64('AQI'),400,/invalides/);throwsMock(()=>decodeBase64(''),400,/invalides/);
});

/* ───── Validation complète de la capture ───── */
test('capture valide : WebP lu, taille et dimensions rendues',()=>{
 const v=validateImage({mime:'image/webp',data:b64(webpLossy(720,1560))});
 assert.equal(v.mime,'image/webp');assert.equal(v.width,720);assert.equal(v.height,1560);assert.equal(v.bytes,64);
});
test('capture : le type annoncé doit correspondre au contenu',()=>{
 throwsMock(()=>validateImage({mime:'image/png',data:b64(webpLossy(720,1560))}),422,/ne correspond pas/);
 assert.doesNotThrow(()=>validateImage({data:b64(png(720,1560))}));
});
test('capture : pas une image, pas de données, base64 faux',()=>{
 throwsMock(()=>validateImage({data:b64(new TextEncoder().encode('<svg>'+'a'.repeat(100)+'</svg>'))}),422,/pas une image/);
 throwsMock(()=>validateImage({}),400,/Aucune capture/);throwsMock(()=>validateImage({data:'***'}),400,/invalides/);
});
test('capture : 100 px minimum de chaque côté, 4096 × 20000 au plus',()=>{
 throwsMock(()=>validateImage({data:b64(png(99,500))}),422,/trop petite/);throwsMock(()=>validateImage({data:b64(png(500,99))}),422,/trop petite/);
 assert.doesNotThrow(()=>validateImage({data:b64(png(100,100))}));
 throwsMock(()=>validateImage({data:b64(png(4097,500))}),422,/trop grande/);throwsMock(()=>validateImage({data:b64(png(500,20001))}),422,/trop grande/);
});
test('capture : limite de poids — 180 000 octets passent, 180 001 sont refusés (413), et le texte reste sous 256 Kio',()=>{
 const big=(n)=>{const a=new Uint8Array(n);a.set(png(720,1560));return a;};
 assert.doesNotThrow(()=>validateImage({data:b64(big(MAX_IMAGE_BYTES))}));
 throwsMock(()=>validateImage({data:b64(big(MAX_IMAGE_BYTES+1))}),413,/180 Ko/);
 assert.ok(Math.ceil(MAX_IMAGE_BYTES/3)*4<=MAX_IMAGE_TEXT,'180 000 octets codés doivent tenir dans la limite de texte');
 throwsMock(()=>validateImage({data:'A'.repeat(MAX_IMAGE_TEXT+4)}),413,/trop lourde/);
});

/* ───── Divers ───── */
test('hauteur de travail : proportions de la capture à 360 px, bornée à 200–3000',()=>{
 assert.equal(screenHeightFor(720,1560),780);assert.equal(screenHeightFor(360,780),780);assert.equal(screenHeightFor(1000,100),200);assert.equal(screenHeightFor(100,20000),3000);
});
test('titre : obligatoire, 160 caractères au plus',()=>{
 assert.equal(cleanTitle('  Accueil  '),'Accueil');throwsMock(()=>cleanTitle('  '),400,/obligatoire/);throwsMock(()=>cleanTitle('x'.repeat(161)),400,/trop long/);assert.equal(cleanTitle('x'.repeat(160)).length,160);
});
