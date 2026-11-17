/* Lot 5B (5B-1) — Maquettes d'écran : créer une maquette, y déposer une capture, poser des blocs, fixer l'écran de départ, relire.
   Pas de modification de blocs ici (étape 5B-2). Atelier ne produit aucun code de site et n'écrit dans aucun dépôt.
   Chaque requête est filtrée par l'utilisateur de la session ET par le projet. */
import {Hono} from 'hono';import {z} from 'zod';
import {event,fail,jsonBody,many,now,one,owned,run,uid,userId} from '../core.ts';
import {legacyDecision,effectiveReliability,RELIABILITY_VIEW,LIFE_LABEL} from '../lifecycle-core.ts';
import {BLOCK_KINDS,BLOCK_LABEL,MAX_BLOCKS,MAX_GROUPS,MAX_MOCKUPS_PER_PROJECT,MAX_OPS,MAX_USER_IMAGE_BYTES,MockupError,SCREEN_WIDTH,applyOps,cleanBlock,cleanTitle,planWrites,screenHeightFor,validateImage,type BlockState,type Layout} from '../mockup-core.ts';
import {SITE_PALETTES} from '../site-palettes.ts';
import {SHEET_VERSION,buildSheet,missionFields,type SheetInput} from '../mockup-sheet.ts';
import {LEVEL_WORD,suggestions,type GuideInput} from '../mockup-guide.ts';
import {aiPrompt,contextAnswer,keywords} from '../mockup-chat.ts';
import {credentialsFor} from './connections.ts';
import {generate} from '../connectors/ai.ts';
import {secretFindings} from '../handoff-core.ts';
import {FEATURE_STATE_LABEL} from '../lifecycle-core.ts';
import {sha256Hex} from '../mission-core.ts';
import type {AppEnv,Env,Row} from '../types.ts';
export const mockups=new Hono<AppEnv>();

const guard=async<T>(fn:()=>Promise<T>|T):Promise<T>=>{try{return await fn();}catch(e){if(e instanceof MockupError)fail(e.status,e.message);throw e;}};
async function mine(env:Env,user:string,id:string):Promise<Row>{return owned(env,'mockups',id,user);}
const parse=<T>(raw:unknown,fallback:T):T=>{try{const v=JSON.parse(String(raw));return v??fallback;}catch{return fallback;}};

const blockView=(b:Row,groups:Map<string,string>,features:Map<string,Row>)=>({
 id:b.id,kind:b.kind,kind_label:BLOCK_LABEL[b.kind as keyof typeof BLOCK_LABEL]||b.kind,label:b.label,x:b.x,y:b.y,w:b.w,h:b.h,position:b.position,
 group_id:b.group_id||null,group_name:b.group_id?groups.get(b.group_id)||'':'',fill:b.fill,text_color:b.text_color,behavior:b.behavior,
 feature:b.feature_id&&features.get(b.feature_id)?{id:b.feature_id,code:features.get(b.feature_id)!.code,name:features.get(b.feature_id)!.name}:null
});

async function summary(env:Env,user:string,m:Row){
 const img=await one<Row>(env,'SELECT width,height,bytes,mime FROM mockup_images WHERE mockup_id=? AND user_id=?',m.id,user);
 const n=await one<Row>(env,'SELECT COUNT(*) AS n FROM mockup_blocks WHERE mockup_id=? AND user_id=?',m.id,user);
 return {id:m.id,project_id:m.project_id,title:m.title,page_name:m.page_name,screen_width:m.screen_width,screen_height:m.screen_height,
  has_image:Boolean(img),image:img?{width:img.width,height:img.height,bytes:img.bytes,mime:img.mime}:null,block_count:Number(n?.n||0),
  start_fixed:Boolean(m.start_at),start_at:m.start_at||null,revision:m.revision,created_at:m.created_at,updated_at:m.updated_at};
}
/** Ce qu'Atelier sait déjà du projet : décisions actuelles et fonctionnalités (lecture seule), avec leur niveau de fiabilité. */
async function contextOf(env:Env,user:string,project:string){
 const decisions=[];
 for(const d of await many<Row>(env,'SELECT id,title,reason,status,source_ref FROM project_decisions WHERE user_id=? AND project_id=? ORDER BY created_at',user,project)){
  const lc=await one<Row>(env,"SELECT status,reliability,source_ref FROM item_lifecycle WHERE user_id=? AND kind='decision' AND item_id=?",user,d.id);
  const s=lc||{...legacyDecision(d.status),source_ref:d.source_ref};
  if(s.status!=='current')continue;
  const rel=effectiveReliability(s.status,s.reliability);
  decisions.push({id:d.id,title:d.title,reason:d.reason,status_label:LIFE_LABEL[s.status as keyof typeof LIFE_LABEL],reliability:rel,reliability_word:RELIABILITY_VIEW[rel].word,reliability_symbol:RELIABILITY_VIEW[rel].symbol,source_ref:s.source_ref||d.source_ref||''});
 }
 const features=[];
 for(const f of await many<Row>(env,'SELECT id,code,name,state,source_ref FROM project_features WHERE user_id=? AND project_id=? ORDER BY group_name,position,code',user,project)){
  const lc=await one<Row>(env,"SELECT status FROM item_lifecycle WHERE user_id=? AND kind='feature' AND item_id=?",user,f.id);
  if((lc?.status||'current')!=='current')continue;
  features.push({id:f.id,code:f.code,name:f.name,state:f.state,source_ref:f.source_ref});
 }
 return {decisions,features};
}
async function detail(env:Env,user:string,m:Row){
 const groups=await many<Row>(env,'SELECT id,name,position FROM mockup_groups WHERE user_id=? AND mockup_id=? ORDER BY position,created_at',user,m.id);
 const gmap=new Map(groups.map(g=>[g.id as string,g.name as string]));
 const ctx=await contextOf(env,user,m.project_id),fmap=new Map(ctx.features.map(f=>[f.id as string,f as Row]));
 // Une fonctionnalité liée puis retirée du suivi garde son nom : on la relit directement.
 const blocks=await many<Row>(env,'SELECT * FROM mockup_blocks WHERE user_id=? AND mockup_id=? ORDER BY position,created_at',user,m.id);
 for(const b of blocks)if(b.feature_id&&!fmap.has(b.feature_id)){const f=await one<Row>(env,'SELECT id,code,name FROM project_features WHERE id=? AND user_id=?',b.feature_id,user);if(f)fmap.set(f.id,f);}
 const pal=parse<any>(m.palette,null);
 return {...await summary(env,user,m),palette:pal&&!Array.isArray(pal)?pal:null,groups,blocks:blocks.map(b=>blockView(b,gmap,fmap)),
  kinds:BLOCK_KINDS.map(k=>({key:k,label:BLOCK_LABEL[k]})),context:ctx,
  start:m.start_state?{fixed_at:m.start_at,blocks:parse<any[]>(m.start_state,[]).length}:null};
}

/* ───────── Routes ───────── */
mockups.get('/',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.query('project')||'',user);
 const rows=await many<Row>(c.env,'SELECT * FROM mockups WHERE user_id=? AND project_id=? ORDER BY updated_at DESC',user,p.id);
 const items=[];for(const m of rows)items.push(await summary(c.env,user,m));
 return c.json({items});
});
mockups.get('/palettes',c=>c.json({palettes:SITE_PALETTES,note:'Couleurs lues en lecture seule dans les dépôts des sites (fichier, ligne et commit indiqués). Aucune écriture dans ces dépôts.'}));
const create=z.object({project_id:z.string().uuid(),title:z.string().max(400),page_name:z.string().max(160).default('')});
mockups.post('/',async c=>{
 const user=userId(c),d=create.parse(await jsonBody(c)),p=await owned(c.env,'projects',d.project_id,user);
 return guard(async()=>{
  const title=cleanTitle(d.title),at=now(),id=uid();
  const res=await run(c.env,`INSERT INTO mockups(id,user_id,project_id,title,page_name,created_at,updated_at)
   SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM mockups WHERE user_id=? AND project_id=?)<?`,id,user,p.id,title,d.page_name.trim(),at,at,user,p.id,MAX_MOCKUPS_PER_PROJECT);
  if(!res.meta.changes)fail(409,`Ce projet a déjà ${MAX_MOCKUPS_PER_PROJECT} maquettes : c’est la limite.`);
  await event(c.env,user,'mockup_created',title.slice(0,120),p.id);
  return c.json(await detail(c.env,user,await mine(c.env,user,id)),201);
 });
});
mockups.get('/:id',async c=>{const user=userId(c);return c.json(await detail(c.env,user,await mine(c.env,user,c.req.param('id'))));});

const imageInput=z.object({mime:z.string().max(40).optional(),data:z.string().max(300000)});
mockups.put('/:id/image',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=imageInput.parse(await jsonBody(c));
 return guard(async()=>{
  if(m.start_at)fail(409,'L’écran de départ est déjà fixé : sa capture ne peut plus changer. Créez une autre maquette pour une autre capture.');
  const img=validateImage(d),height=screenHeightFor(img.width,img.height,m.screen_width||SCREEN_WIDTH);
  const used=await one<Row>(c.env,'SELECT COALESCE(SUM(bytes),0) AS n FROM mockup_images WHERE user_id=? AND mockup_id<>?',user,m.id);
  if(Number(used?.n||0)+img.bytes>MAX_USER_IMAGE_BYTES)fail(413,'Vos captures de maquettes dépassent 20 Mo au total. Aucune n’a été supprimée.');
  const low=await one<Row>(c.env,'SELECT MAX(y+h) AS bottom FROM mockup_blocks WHERE mockup_id=? AND user_id=?',m.id,user);
  if(low?.bottom&&Number(low.bottom)>height)fail(409,'Cette capture est plus courte que les blocs déjà posés : un bloc sortirait de l’écran.');
  const at=now(),sha=await sha256Hex(img.data);
  await c.env.DB.batch([
   c.env.DB.prepare(`INSERT INTO mockup_images(mockup_id,user_id,project_id,mime,width,height,bytes,sha256,data,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(mockup_id) DO UPDATE SET mime=excluded.mime,width=excluded.width,height=excluded.height,bytes=excluded.bytes,sha256=excluded.sha256,data=excluded.data,updated_at=excluded.updated_at`)
    .bind(m.id,user,m.project_id,img.mime,img.width,img.height,img.bytes,sha,img.data,at,at),
   c.env.DB.prepare('UPDATE mockups SET screen_height=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=?').bind(height,at,m.id,user)
  ]);
  return c.json(await detail(c.env,user,await mine(c.env,user,m.id)));
 });
});
mockups.get('/:id/image',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id'));
 const img=await one<Row>(c.env,'SELECT mime,width,height,bytes,sha256,data FROM mockup_images WHERE mockup_id=? AND user_id=?',m.id,user);
 if(!img)fail(404,'Cette maquette n’a pas encore de capture.');
 return c.json({mime:img.mime,width:img.width,height:img.height,bytes:img.bytes,sha256:img.sha256,data:img.data});
});

const groupInput=z.object({name:z.string().max(200)});
mockups.post('/:id/groups',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=groupInput.parse(await jsonBody(c));
 return guard(async()=>{
  const name=d.name.trim();
  if(!name)fail(400,'Donnez un nom au groupe.');
  if(name.length>60)fail(400,'Le nom du groupe est trop long (60 caractères au plus).');
  const at=now(),res=await run(c.env,`INSERT INTO mockup_groups(id,user_id,project_id,mockup_id,name,position,created_at)
   SELECT ?,?,?,?,?,COALESCE((SELECT MAX(position)+1 FROM mockup_groups WHERE mockup_id=?),0),?
   WHERE (SELECT COUNT(*) FROM mockup_groups WHERE mockup_id=?)<? AND NOT EXISTS(SELECT 1 FROM mockup_groups WHERE mockup_id=? AND name=?)`,uid(),user,m.project_id,m.id,name,m.id,at,m.id,MAX_GROUPS,m.id,name);
  if(!res.meta.changes){
   if(await one(c.env,'SELECT id FROM mockup_groups WHERE mockup_id=? AND name=?',m.id,name))fail(409,'Un groupe porte déjà ce nom.');
   fail(409,`Cette maquette a déjà ${MAX_GROUPS} groupes : c’est la limite.`);
  }
  return c.json(await detail(c.env,user,m),201);
 });
});

const blockInput=z.object({kind:z.string(),label:z.string().max(400),x:z.union([z.number(),z.string()]),y:z.union([z.number(),z.string()]),w:z.union([z.number(),z.string()]),h:z.union([z.number(),z.string()]),
 fill:z.string().max(20).default(''),text_color:z.string().max(20).default(''),behavior:z.string().max(1000).default(''),group_id:z.string().uuid().nullable().default(null),feature_id:z.string().uuid().nullable().default(null)});
mockups.post('/:id/blocks',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=blockInput.parse(await jsonBody(c));
 return guard(async()=>{
  if(!await one(c.env,'SELECT mockup_id FROM mockup_images WHERE mockup_id=? AND user_id=?',m.id,user))fail(409,'Ajoutez d’abord la capture de l’écran : les blocs se posent dessus.');
  const b=cleanBlock(d,m.screen_height,m.screen_width);
  if(d.group_id&&!await one(c.env,'SELECT id FROM mockup_groups WHERE id=? AND mockup_id=? AND user_id=?',d.group_id,m.id,user))fail(400,'Ce groupe n’appartient pas à cette maquette.');
  if(d.feature_id&&!await one(c.env,'SELECT id FROM project_features WHERE id=? AND user_id=? AND project_id=?',d.feature_id,user,m.project_id))fail(400,'Cette fonctionnalité n’appartient pas à ce projet.');
  const at=now(),id=uid(),res=await run(c.env,`INSERT INTO mockup_blocks(id,user_id,project_id,mockup_id,kind,label,x,y,w,h,position,group_id,fill,text_color,feature_id,behavior,created_at,updated_at)
   SELECT ?,?,?,?,?,?,?,?,?,?,COALESCE((SELECT MAX(position)+1 FROM mockup_blocks WHERE mockup_id=?),0),?,?,?,?,?,?,?
   WHERE (SELECT COUNT(*) FROM mockup_blocks WHERE mockup_id=?)<?`,id,user,m.project_id,m.id,b.kind,b.label,b.x,b.y,b.w,b.h,m.id,d.group_id,b.fill,b.text_color,d.feature_id,b.behavior,at,at,m.id,MAX_BLOCKS);
  if(!res.meta.changes)fail(409,`Cette maquette a déjà ${MAX_BLOCKS} blocs : c’est la limite.`);
  await run(c.env,'UPDATE mockups SET revision=revision+1,updated_at=? WHERE id=? AND user_id=?',at,m.id,user);
  return c.json(await detail(c.env,user,await mine(c.env,user,m.id)),201);
 });
});

/** Fixe l'écran de départ : copie figée des blocs, base des « écarts » de la fiche (étape 5B-3). Une seule fois. */
mockups.post('/:id/lock-start',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id'));
 return guard(async()=>{
  if(m.start_at)fail(409,'L’écran de départ est déjà fixé.');
  if(!await one(c.env,'SELECT mockup_id FROM mockup_images WHERE mockup_id=? AND user_id=?',m.id,user))fail(409,'Ajoutez d’abord la capture de l’écran.');
  const blocks=await many<Row>(c.env,`SELECT b.id,b.kind,b.label,b.x,b.y,b.w,b.h,b.position,g.name AS group_name,b.fill,b.text_color,b.feature_id,b.behavior
   FROM mockup_blocks b LEFT JOIN mockup_groups g ON g.id=b.group_id WHERE b.user_id=? AND b.mockup_id=? ORDER BY b.position,b.created_at`,user,m.id);
  if(!blocks.length)fail(409,'Posez au moins un bloc sur la capture avant de fixer l’écran de départ.');
  const at=now(),res=await run(c.env,'UPDATE mockups SET start_state=?,start_at=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND start_at IS NULL',JSON.stringify(blocks),at,at,m.id,user);
  if(!res.meta.changes)fail(409,'L’écran de départ est déjà fixé.');
  await event(c.env,user,'mockup_start_fixed',m.title.slice(0,120),m.project_id);
  return c.json(await detail(c.env,user,await mine(c.env,user,m.id)));
 });
});

/* ───────── 5B-2 : modifier (déplacer, grouper, séparer, colorier, ajouter, supprimer) ───────── */
const paletteInput=z.object({site:z.string().max(40)});
mockups.put('/:id/palette',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=paletteInput.parse(await jsonBody(c));
 return guard(async()=>{
  let value:string;
  if(d.site==='')value='[]';else{const p=SITE_PALETTES.find(x=>x.key===d.site);if(!p)fail(400,'Cette palette n’existe pas.');value=JSON.stringify(p);}
  await run(c.env,'UPDATE mockups SET palette=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=?',value,now(),m.id,user);
  return c.json(await detail(c.env,user,await mine(c.env,user,m.id)));
 });
});
async function loadLayout(env:Env,user:string,m:Row):Promise<Layout>{
 const groups=await many<Row>(env,'SELECT id,name FROM mockup_groups WHERE user_id=? AND mockup_id=? ORDER BY position,created_at',user,m.id);
 const gname=new Map(groups.map(g=>[g.id as string,g.name as string]));
 const rows=await many<Row>(env,'SELECT * FROM mockup_blocks WHERE user_id=? AND mockup_id=? ORDER BY position,created_at',user,m.id);
 const blocks:BlockState[]=rows.map(b=>({id:b.id,kind:b.kind,label:b.label,x:b.x,y:b.y,w:b.w,h:b.h,position:b.position,group:b.group_id?gname.get(b.group_id)??null:null,fill:b.fill,text_color:b.text_color,behavior:b.behavior,feature_id:b.feature_id||null}));
 return {blocks,groups:groups.map(g=>g.name as string)};
}
const opsInput=z.object({revision:z.number().int(),ops:z.array(z.record(z.string(),z.any())).min(1).max(MAX_OPS)});
const chunks=<T>(a:T[],n:number)=>{const o:T[][]=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};
mockups.post('/:id/ops',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=opsInput.parse(await jsonBody(c));
 return guard(async()=>{
  const stale='La maquette a changé depuis que vous l’avez ouverte (un autre écran ?). Rechargez-la : rien n’a été modifié.';
  if(Number(m.revision)!==d.revision)fail(409,stale);
  const before=await loadLayout(c.env,user,m);
  const feats=new Set((await many<Row>(c.env,'SELECT id FROM project_features WHERE user_id=? AND project_id=?',user,m.project_id)).map(f=>f.id as string));
  const after=applyOps(before,d.ops,{screen_width:m.screen_width,screen_height:m.screen_height,featureExists:id=>feats.has(id)});
  const writes=planWrites(before,after);
  if(!writes.length)return c.json(await detail(c.env,user,m));
  const existing=await many<Row>(c.env,'SELECT id,name FROM mockup_groups WHERE user_id=? AND mockup_id=?',user,m.id),gid=new Map(existing.map(g=>[g.name as string,g.id as string]));
  const at=now(),R=d.revision,G=' AND (SELECT revision FROM mockups WHERE id=?)=?',GW=' WHERE (SELECT revision FROM mockups WHERE id=?)=?',guard2=[m.id,R+1];
  const DB=c.env.DB,st:D1PreparedStatement[]=[DB.prepare('UPDATE mockups SET revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?').bind(at,m.id,user,R)];
  const ids=(n:number)=>Array(n).fill('?').join(',');
  for(const w of writes){
   switch(w.t){
    case 'group_add':{const id=uid();gid.set(w.name,id);st.push(DB.prepare(`INSERT INTO mockup_groups(id,user_id,project_id,mockup_id,name,position,created_at) SELECT ?,?,?,?,?,COALESCE((SELECT MAX(position)+1 FROM mockup_groups WHERE mockup_id=?),0),?${GW}`).bind(id,user,m.project_id,m.id,w.name,m.id,at,...guard2));break;}
    case 'block_add':{const b=w.block;st.push(DB.prepare(`INSERT INTO mockup_blocks(id,user_id,project_id,mockup_id,kind,label,x,y,w,h,position,group_id,fill,text_color,feature_id,behavior,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?${GW}`).bind(b.id,user,m.project_id,m.id,b.kind,b.label,b.x,b.y,b.w,b.h,b.position,b.group?gid.get(b.group)??null:null,b.fill,b.text_color,b.feature_id,b.behavior,at,at,...guard2));break;}
    case 'block_update':{const b=w.block;st.push(DB.prepare(`UPDATE mockup_blocks SET kind=?,label=?,x=?,y=?,w=?,h=?,group_id=?,fill=?,text_color=?,feature_id=?,behavior=?,updated_at=? WHERE id=? AND user_id=? AND mockup_id=?${G}`).bind(b.kind,b.label,b.x,b.y,b.w,b.h,b.group?gid.get(b.group)??null:null,b.fill,b.text_color,b.feature_id,b.behavior,at,b.id,user,m.id,...guard2));break;}
    case 'translate':for(const part of chunks(w.ids,40))st.push(DB.prepare(`UPDATE mockup_blocks SET x=x+?,y=y+?,updated_at=? WHERE user_id=? AND mockup_id=? AND id IN (${ids(part.length)})${G}`).bind(w.dx,w.dy,at,user,m.id,...part,...guard2));break;
    case 'set_group':for(const part of chunks(w.ids,40))st.push(DB.prepare(`UPDATE mockup_blocks SET group_id=?,updated_at=? WHERE user_id=? AND mockup_id=? AND id IN (${ids(part.length)})${G}`).bind(w.name?gid.get(w.name)??null:null,at,user,m.id,...part,...guard2));break;
    case 'block_delete':for(const part of chunks(w.ids,40))st.push(DB.prepare(`DELETE FROM mockup_blocks WHERE user_id=? AND mockup_id=? AND id IN (${ids(part.length)})${G}`).bind(user,m.id,...part,...guard2));break;
    case 'group_delete':st.push(DB.prepare(`DELETE FROM mockup_groups WHERE user_id=? AND mockup_id=? AND name=?${G}`).bind(user,m.id,w.name,...guard2));break;
   }
  }
  if(st.length>45)fail(413,'Trop de changements différents d’un coup. Faites-en moins à la fois : rien n’a été modifié.');
  const res=await DB.batch(st);
  if(!res[0].meta.changes)fail(409,stale);
  return c.json(await detail(c.env,user,await mine(c.env,user,m.id)));
 });
});

/* ───────── 5B-3 : fiche de mise en page + champs de mission (règles fixes, sans IA) ───────── */
mockups.get('/:id/sheet',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=await detail(c.env,user,m);
 const feats=await many<Row>(c.env,'SELECT id,code,name FROM project_features WHERE user_id=? AND project_id=?',user,m.project_id);
 const fmap:Record<string,{code:string;name:string}>={};for(const f of feats)fmap[f.id as string]={code:f.code as string,name:f.name as string};
 const pal=d.palette as any;
 const input:SheetInput={title:m.title,page_name:m.page_name,screen_width:m.screen_width,screen_height:m.screen_height,start_at:m.start_at||null,
  palette:pal?{key:pal.key,label:pal.label,file:pal.file,commit:pal.commit,colors:pal.colors||[],files:pal.files||SITE_PALETTES.find(p=>p.key===pal.key)?.files||[]}:null,features:fmap,
  start:m.start_state?parse<any[]>(m.start_state,[]).map(b=>({id:b.id,kind:b.kind,label:b.label,x:b.x,y:b.y,w:b.w,h:b.h,group_name:b.group_name??null,fill:b.fill||'',text_color:b.text_color||'',behavior:b.behavior||'',feature_id:b.feature_id??null})):null,
  blocks:d.blocks.map((b:any)=>({id:b.id,kind:b.kind,label:b.label,x:b.x,y:b.y,w:b.w,h:b.h,group:b.group_name||'',fill:b.fill,text_color:b.text_color,behavior:b.behavior,feature:b.feature?{code:b.feature.code,name:b.feature.name}:null}))};
 const accepted=await acceptedInstructions(c.env,user,m);
 const conclusions=(await many<Row>(c.env,"SELECT body FROM mockup_messages WHERE user_id=? AND mockup_id=? AND kind='conclusion' AND level='confirmed' ORDER BY created_at",user,m.id)).map(r=>r.body as string);
 const sheet=buildSheet({...input,accepted,conclusions}),fields=missionFields({...input,accepted,conclusions},sheet);
 const feature_ids=[...new Set(d.blocks.filter((b:any)=>b.feature).map((b:any)=>b.feature.id as string))].slice(0,10);
 return c.json({version:SHEET_VERSION,title:m.title,page_name:m.page_name,start_fixed:Boolean(m.start_at),...sheet,mission:{title:('Maquette : '+m.title).slice(0,160),fields,feature_ids},content_hash:await sha256Hex(sheet.markdown)});
});

/* ───────── 5B-4 : guidage par règles vérifiables ───────── */
async function guideInput(env:Env,user:string,m:Row):Promise<GuideInput>{
 const d=await detail(env,user,m);
 const feats=[];
 for(const f of await many<Row>(env,'SELECT id,code,name,state FROM project_features WHERE user_id=? AND project_id=?',user,m.project_id)){
  const lc=await one<Row>(env,"SELECT status FROM item_lifecycle WHERE user_id=? AND kind='feature' AND item_id=?",user,f.id);
  feats.push({id:f.id as string,code:f.code as string,name:f.name as string,state:f.state as string,life:(lc?.status as string)||'current'});
 }
 return {blocks:d.blocks.map((b:any)=>({id:b.id,kind:b.kind,label:b.label,x:b.x,y:b.y,w:b.w,h:b.h,group:b.group_name||'',fill:b.fill,text_color:b.text_color,feature_id:b.feature?.id??null})),
  palette:(d.palette as any)?.colors?.map((c:any)=>({hex:c.hex,token:c.token}))??null,features:feats,
  decisions:d.context.decisions.map((x:any)=>({id:x.id,title:x.title,reason:x.reason||''}))};
}
async function decisionsOf(env:Env,user:string,m:Row){return many<Row>(env,'SELECT rule,target_key,decision FROM mockup_suggestion_decisions WHERE user_id=? AND mockup_id=?',user,m.id);}
/** Consignes des suggestions ACCEPTÉES et toujours valables : elles entrent dans la fiche et la mission. */
async function acceptedInstructions(env:Env,user:string,m:Row):Promise<string[]>{
 const dec=await decisionsOf(env,user,m),ok=new Set(dec.filter(x=>x.decision==='accepted').map(x=>x.rule+'|'+x.target_key));
 if(!ok.size)return [];
 return suggestions(await guideInput(env,user,m)).filter(s=>ok.has(s.rule+'|'+s.key)).map(s=>s.instruction);
}
mockups.get('/:id/guide',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id'));
 const dec=await decisionsOf(c.env,user,m),by=new Map(dec.map(x=>[x.rule+'|'+x.target_key,x.decision as string]));
 const all=suggestions(await guideInput(c.env,user,m));
 const items=all.filter(s=>by.get(s.rule+'|'+s.key)!=='refused').map(s=>({...s,level_word:LEVEL_WORD[s.level],decision:by.get(s.rule+'|'+s.key)||null}));
 return c.json({items,refused_hidden:all.length-items.length,sources:'WCAG 2.2, W3C Recommendation 12 December 2024 (https://www.w3.org/TR/WCAG22/), lu le 17 novembre 2026.'});
});
const decideInput=z.object({rule:z.string().max(40),key:z.string().max(400),decision:z.enum(['accepted','refused'])});
mockups.post('/:id/guide',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=decideInput.parse(await jsonBody(c));
 const s=suggestions(await guideInput(c.env,user,m)).find(x=>x.rule===d.rule&&x.key===d.key);
 if(!s)fail(409,'Cette suggestion n’existe plus (la maquette a changé). Rechargez la liste.');
 const at=now();
 await run(c.env,`INSERT INTO mockup_suggestion_decisions(id,user_id,project_id,mockup_id,rule,target_key,decision,summary,created_at) VALUES(?,?,?,?,?,?,?,?,?)
  ON CONFLICT(mockup_id,rule,target_key) DO UPDATE SET decision=excluded.decision,summary=excluded.summary,created_at=excluded.created_at`,uid(),user,m.project_id,m.id,d.rule,d.key,d.decision,s.title.slice(0,200),at);
 await event(c.env,user,d.decision==='accepted'?'mockup_suggestion_accepted':'mockup_suggestion_refused',s.title.slice(0,120),m.project_id);
 return c.json({ok:true,decision:d.decision});
});

/* ───────── 5B-5 : discussion liée à la maquette ───────── */
const FREE_AI=['mistral','gemini','groq'];
const msgView=(r:Row)=>({id:r.id,block_id:r.block_id||null,block_label:r.block_label,author:r.author,kind:r.kind,body:r.body,sources:parse<any[]>(r.sources,[]),level:r.level,level_word:r.level?({verified:'Vérifié',reported:'Rapporté',hypothesis:'Hypothèse',confirmed:'Confirmé par vous'} as Record<string,string>)[r.level]:'',ai_provider:r.ai_provider,ai_model:r.ai_model,reply_to:r.reply_to||null,created_at:r.created_at});
mockups.get('/:id/discussion',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id'));
 const rows=await many<Row>(c.env,'SELECT * FROM mockup_messages WHERE user_id=? AND mockup_id=? ORDER BY created_at,rowid',user,m.id);
 const conns=(await many<Row>(c.env,"SELECT id,provider,label,models,status,api_consent FROM connections WHERE user_id=? AND status='connected'",user)).filter(x=>FREE_AI.includes(x.provider as string)&&x.api_consent).map(x=>({id:x.id,provider:x.provider,label:x.label,models:parse<string[]>(x.models,[])}));
 return c.json({items:rows.map(msgView),ai_connections:conns});
});
async function buildContext(env:Env,user:string,m:Row,blockId:string|null,question:string){
 const d=await detail(env,user,m),b=blockId?d.blocks.find((x:any)=>x.id===blockId):null;
 if(blockId&&!b)fail(400,'Ce bloc n’existe plus dans la maquette.');
 const all=suggestions(await guideInput(env,user,m)),refused=new Set((await decisionsOf(env,user,m)).filter(x=>x.decision==='refused').map(x=>x.rule+'|'+x.target_key));
 const sugg=all.filter(s=>!refused.has(s.rule+'|'+s.key)&&(!b||s.block_ids.includes(b.id))).slice(0,6);
 let feature=null;
 if(b?.feature){const f=await one<Row>(env,'SELECT id,code,name,state FROM project_features WHERE id=? AND user_id=?',b.feature.id,user);
  if(f){const lc=await one<Row>(env,"SELECT status FROM item_lifecycle WHERE user_id=? AND kind='feature' AND item_id=?",user,f.id);feature={code:f.code as string,name:f.name as string,state_label:FEATURE_STATE_LABEL[f.state as keyof typeof FEATURE_STATE_LABEL]||String(f.state),life_label:LIFE_LABEL[((lc?.status as string)||'current') as keyof typeof LIFE_LABEL]};}}
 const words=keywords(question+' '+(b?.label||''));const nb=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const decisions=d.context.decisions.filter((x:any)=>{const t=nb(x.title+' '+(x.reason||''));return (b&&b.label.length>=4&&t.includes(nb(b.label)))||words.some(w=>t.includes(w));}).slice(0,5)
  .map((x:any)=>({title:x.title,reason:x.reason||'',reliability_word:x.reliability_word,source_ref:x.source_ref||''}));
 const passages:{title:string;excerpt:string;date:string}[]=[];
 for(const w of words.slice(0,3)){
  const like='%'+w.replace(/[\\%_]/g,(x:string)=>'\\'+x)+'%';
  const rows=await many<Row>(env,"SELECT bc.title,m.content,m.original_date FROM bridge_messages m JOIN bridge_conversations bc ON bc.id=m.conversation_id JOIN bridge_project_spaces bps ON bps.space_id=bc.space_id AND bps.user_id=m.owner_id WHERE m.owner_id=? AND bps.project_id=? AND m.content LIKE ? ESCAPE '\\' LIMIT 2",user,m.project_id,like);
  for(const r of rows){const t=String(r.content||''),i=Math.max(0,nb(t).indexOf(w)-80);if(passages.length<3&&!passages.some(p=>p.title===r.title))passages.push({title:String(r.title||'Conversation'),excerpt:t.slice(i,i+220).replace(/\s+/g,' ').trim(),date:String(r.original_date||'')});}
 }
 const conclusions=(await many<Row>(env,"SELECT body FROM mockup_messages WHERE user_id=? AND mockup_id=? AND kind='conclusion' AND level='confirmed' AND (?='' OR block_id=?) ORDER BY created_at",user,m.id,b?.id||'',b?.id||'')).map(r=>r.body as string);
 return {b,ctx:{question,block:b?{id:b.id,label:b.label,kind_label:b.kind_label,x:b.x,y:b.y,w:b.w,h:b.h,group:b.group_name||'',fill:b.fill,text_color:b.text_color,behavior:b.behavior}:null,
  group_mates:b?.group_name?d.blocks.filter((x:any)=>x.group_name===b.group_name&&x.id!==b.id).map((x:any)=>x.label as string):[],suggestions:sugg,feature,decisions,passages,conclusions}};
}
const askInput=z.object({block_id:z.string().uuid().nullable().default(null),question:z.string().max(2000)});
mockups.post('/:id/discussion',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=askInput.parse(await jsonBody(c));
 const question=d.question.trim();if(!question)fail(400,'Écrivez votre question.');
 if(secretFindings(question).length)fail(400,'Votre question semble contenir une clé ou un mot de passe : retirez-le.');
 const n=await one<Row>(c.env,'SELECT COUNT(*) AS n FROM mockup_messages WHERE user_id=? AND mockup_id=?',user,m.id);if(Number(n?.n||0)>=400)fail(409,'Cette discussion a atteint 400 messages : c’est la limite.');
 const {b,ctx}=await buildContext(c.env,user,m,d.block_id,question),ans=contextAnswer(ctx),at=now(),qid=uid(),aid=uid(),later=new Date(Date.parse(at)+1).toISOString();
 await c.env.DB.batch([
  c.env.DB.prepare("INSERT INTO mockup_messages(id,user_id,project_id,mockup_id,block_id,block_label,author,kind,body,created_at) VALUES(?,?,?,?,?,?,'martin','question',?,?)").bind(qid,user,m.project_id,m.id,b?.id??null,b?.label??'',question,at),
  c.env.DB.prepare("INSERT INTO mockup_messages(id,user_id,project_id,mockup_id,block_id,block_label,author,kind,body,sources,level,reply_to,created_at) VALUES(?,?,?,?,?,?,'atelier','answer',?,?,'',?,?)").bind(aid,user,m.project_id,m.id,b?.id??null,b?.label??'',ans.body,JSON.stringify(ans.sources),qid,later)
 ]);
 const rows=await many<Row>(c.env,'SELECT * FROM mockup_messages WHERE user_id=? AND id IN (?,?) ORDER BY created_at',user,qid,aid);
 return c.json({items:rows.map(msgView)},201);
});
const aiInput=z.object({connection_id:z.string().uuid(),model:z.string().min(1).max(160)});
mockups.post('/:id/discussion/:msg/ai',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=aiInput.parse(await jsonBody(c));
 const ans=await one<Row>(c.env,"SELECT * FROM mockup_messages WHERE id=? AND user_id=? AND mockup_id=? AND author='atelier'",c.req.param('msg'),user,m.id);if(!ans)fail(404,'Réponse introuvable.');
 if(await one(c.env,"SELECT id FROM mockup_messages WHERE user_id=? AND reply_to=? AND author='ai'",user,ans.id))fail(409,'Une IA a déjà répondu à cette question : une seule demande, jamais rejouée.');
 const qm=await one<Row>(c.env,'SELECT body FROM mockup_messages WHERE id=? AND user_id=?',ans.reply_to,user);
 const {conn,secret}=await credentialsFor(c.env,d.connection_id,user,'chat');
 if(!FREE_AI.includes(conn.provider)||!conn.api_consent||conn.status!=='connected')fail(403,'Seules vos connexions Gemini, Groq ou Mistral autorisées et testées peuvent répondre ici.');
 if(!parse<string[]>(conn.models,[]).includes(d.model))fail(400,'Modèle non confirmé : testez la connexion.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);let out='';
 try{for await(const x of generate(conn.provider,secret,d.model,[{role:'user',content:aiPrompt(String(qm?.body||''),String(ans.body))}],900,controller.signal)){out+=x.text||'';if(out.length>6000)break;}}
 catch{fail(502,'L’IA n’a pas répondu correctement. Rien n’a été ajouté et la demande n’est pas rejouée automatiquement.');}finally{clearTimeout(timer);}
 out=out.trim().slice(0,6000);if(!out)fail(422,'L’IA n’a rien répondu. Rien n’a été ajouté.');
 if(secretFindings(out).length)fail(422,'La réponse de l’IA contient ce qui ressemble à un secret. Rien n’a été ajouté.');
 const id=uid();
 await run(c.env,"INSERT INTO mockup_messages(id,user_id,project_id,mockup_id,block_id,block_label,author,kind,body,sources,level,ai_provider,ai_model,reply_to,created_at) VALUES(?,?,?,?,?,?,'ai','answer',?,'[]','hypothesis',?,?,?,?)",id,user,m.project_id,m.id,ans.block_id,ans.block_label,out,conn.provider,d.model,ans.id,now());
 return c.json(msgView((await one<Row>(c.env,'SELECT * FROM mockup_messages WHERE id=? AND user_id=?',id,user))!),201);
});
const conclInput=z.object({reply_to:z.string().uuid(),text:z.string().max(1000)});
mockups.post('/:id/discussion/conclusion',async c=>{
 const user=userId(c),m=await mine(c.env,user,c.req.param('id')),d=conclInput.parse(await jsonBody(c));
 const src=await one<Row>(c.env,"SELECT * FROM mockup_messages WHERE id=? AND user_id=? AND mockup_id=? AND kind='answer'",d.reply_to,user,m.id);if(!src)fail(404,'Réponse introuvable.');
 const text=d.text.trim();if(!text)fail(400,'Écrivez la conclusion que vous confirmez.');
 if(secretFindings(text).length)fail(400,'Ce texte semble contenir une clé ou un mot de passe : retirez-le.');
 const id=uid();
 await run(c.env,"INSERT INTO mockup_messages(id,user_id,project_id,mockup_id,block_id,block_label,author,kind,body,sources,level,reply_to,created_at) VALUES(?,?,?,?,?,?,'martin','conclusion',?,?,'confirmed',?,?)",id,user,m.project_id,m.id,src.block_id,src.block_label,text,JSON.stringify([{kind:'decision',label:src.author==='ai'?'Réponse d’une IA (Hypothèse) relue par vous':'Réponse d’Atelier',level:'confirmed',ref:src.id}]),src.id,now());
 await event(c.env,user,'mockup_conclusion_confirmed',text.slice(0,120),m.project_id);
 return c.json(msgView((await one<Row>(c.env,'SELECT * FROM mockup_messages WHERE id=? AND user_id=?',id,user))!),201);
});
