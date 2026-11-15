/* Lot 1 — Modèle de projet : gabarit et modules, cycle de vie (états + fiabilité) et suivi des fonctionnalités.
   Chaque requête est filtrée par l'utilisateur de la session ET par le projet. Aucune suppression d'information. */
import {Hono} from 'hono';import {z} from 'zod';
import {event,fail,jsonBody,many,now,one,owned,run,uid,userId} from '../core.ts';
import {FEATURE_STATES,FEATURE_STATE_LABEL,KINDS,LIFE,LIFE_LABEL,MODULES,MODULE_KEYS,PROJECT_TEMPLATES,RELIABILITY_VIEW,STORED_RELIABILITY,applyChange,effectiveModules,effectiveReliability,featureCode,initialState,legacyDecision,legacyDecisionMirror,legacyDocument,legacyMemory,templateOf,type Author,type ItemState,type Kind,type Life,type ModuleKey} from '../lifecycle-core.ts';
import {checkSeed,importReason,seedFile,seedId} from '../seed-core.ts';
import type {AppEnv,Env,Row} from '../types.ts';
export const model=new Hono<AppEnv>();
const text=(n:number)=>z.string().max(n).default('');

/* ───────── Lecture de l'état d'une information (ligne explicite, sinon déduit des anciennes colonnes) ───────── */
const SOURCE_TABLE:Record<Kind,string>={decision:'project_decisions',document:'project_documents',memory:'memory',feature:'project_features'};
async function sourceRow(env:Env,user:string,project:string,kind:Kind,id:string):Promise<Row|null>{
 return one<Row>(env,`SELECT * FROM ${SOURCE_TABLE[kind]} WHERE id=? AND user_id=? AND project_id=?`,id,user,project);
}
export function stateOf(kind:Kind,row:Row,lc:Row|null):ItemState{
 if(lc)return {status:lc.status,reliability:lc.reliability,source_ref:lc.source_ref||'',proof_kind:lc.proof_kind||'',fit_confirmed_at:lc.fit_confirmed_at||null,replaced_by_id:lc.replaced_by_id||null,author_kind:lc.author_kind,derived:false};
 const d=kind==='decision'?legacyDecision(row.status):kind==='document'?legacyDocument(row.reliability):kind==='memory'?legacyMemory(row.source):{status:'current' as Life,reliability:'confirmed' as const};
 const src=kind==='decision'?row.source_ref:kind==='document'?(row.origin||''):kind==='feature'?row.source_ref:'';
 return {...d,source_ref:src||'',proof_kind:'',fit_confirmed_at:null,replaced_by_id:null,author_kind:'martin',derived:true};
}
const view=(kind:Kind,id:string,title:string,s:ItemState,extra:Record<string,unknown>={})=>({kind,id,title,status:s.status,status_label:LIFE_LABEL[s.status],reliability:effectiveReliability(s.status,s.reliability),reliability_stored:s.reliability,reliability_view:RELIABILITY_VIEW[effectiveReliability(s.status,s.reliability)],source_ref:s.source_ref,proof_kind:s.proof_kind,fit_confirmed_at:s.fit_confirmed_at,replaced_by_id:s.replaced_by_id,author_kind:s.author_kind,derived:s.derived,...extra});

/** Écrit l'état (upsert), l'événement d'historique et, pour une décision, le miroir de l'ancienne colonne `status`. */
export async function writeState(env:Env,user:string,project:string,kind:Kind,id:string,prev:ItemState|null,next:Omit<ItemState,'derived'>,reason:string,at:string){
 const stmts=[
  env.DB.prepare(`INSERT INTO item_lifecycle(user_id,project_id,kind,item_id,status,reliability,source_ref,proof_kind,fit_confirmed_at,replaced_by_id,author_kind,revision,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,1,?)
   ON CONFLICT(user_id,kind,item_id) DO UPDATE SET status=excluded.status,reliability=excluded.reliability,source_ref=excluded.source_ref,proof_kind=excluded.proof_kind,fit_confirmed_at=excluded.fit_confirmed_at,replaced_by_id=excluded.replaced_by_id,author_kind=excluded.author_kind,revision=item_lifecycle.revision+1,updated_at=excluded.updated_at`)
   .bind(user,project,kind,id,next.status,next.reliability,next.source_ref,next.proof_kind,next.fit_confirmed_at,next.replaced_by_id,next.author_kind,at),
  env.DB.prepare('INSERT INTO lifecycle_events(id,user_id,project_id,kind,item_id,from_status,to_status,from_reliability,to_reliability,reason,source_ref,replaced_by_id,author_kind,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
   .bind(uid(),user,project,kind,id,prev?.status??null,next.status,prev?.reliability??null,next.reliability,reason.trim().slice(0,500),next.source_ref,next.replaced_by_id,next.author_kind,at)
 ];
 if(kind==='decision')stmts.push(env.DB.prepare('UPDATE project_decisions SET status=?,decided_at=CASE WHEN ?=\'validated\' AND decided_at IS NULL THEN ? ELSE decided_at END,updated_at=? WHERE id=? AND user_id=? AND project_id=?').bind(legacyDecisionMirror(next.status),legacyDecisionMirror(next.status),at,at,id,user,project));
 await env.DB.batch(stmts);
}
/** Appelée par les anciennes routes de décisions : un changement d'état classique laisse sa trace et son état à jour. */
export async function recordLegacyDecisionChange(env:Env,user:string,project:string,id:string,fromLegacy:string|null,toLegacy:string,reason:string){
 if(fromLegacy===toLegacy)return;
 const a=fromLegacy?legacyDecision(fromLegacy):null,b=legacyDecision(toLegacy),lc=await one<Row>(env,"SELECT * FROM item_lifecycle WHERE user_id=? AND kind='decision' AND item_id=?",user,id);
 const keep=lc&&lc.status===b.status?lc:null;if(keep)return;
 const at=now();
 await env.DB.batch([
  env.DB.prepare(`INSERT INTO item_lifecycle(user_id,project_id,kind,item_id,status,reliability,source_ref,proof_kind,fit_confirmed_at,replaced_by_id,author_kind,revision,updated_at) VALUES(?,?,'decision',?,?,?,'','',NULL,NULL,'martin',1,?)
   ON CONFLICT(user_id,kind,item_id) DO UPDATE SET status=excluded.status,reliability=excluded.reliability,proof_kind='',fit_confirmed_at=NULL,revision=item_lifecycle.revision+1,updated_at=excluded.updated_at`).bind(user,project,id,b.status,b.reliability,at),
  env.DB.prepare("INSERT INTO lifecycle_events(id,user_id,project_id,kind,item_id,from_status,to_status,from_reliability,to_reliability,reason,source_ref,replaced_by_id,author_kind,created_at) VALUES(?,?,?,'decision',?,?,?,?,?,?,'',NULL,'martin',?)").bind(uid(),user,project,id,a?.status??null,b.status,a?.reliability??null,b.reliability,reason,at)
 ]);
}

/* ───────── Gabarit et modules ───────── */
async function modelOf(env:Env,user:string,project:string){
 const setup=await one<Row>(env,'SELECT * FROM project_setup WHERE project_id=? AND user_id=?',project,user),profile=await one<Row>(env,'SELECT space_key FROM project_profiles WHERE project_id=? AND user_id=?',project,user);
 const saved=await many<Row>(env,'SELECT module_key,enabled FROM project_modules WHERE project_id=? AND user_id=?',project,user);
 const template=templateOf(setup?.template,profile?.space_key),mods=effectiveModules(template,saved as any);
 return {template,template_label:PROJECT_TEMPLATES[template].label,explicit:Boolean(setup),modules:MODULE_KEYS.map(k=>({key:k,label:MODULES[k].label,help:MODULES[k].help,skeleton:MODULES[k].skeleton,enabled:mods[k],default_on:PROJECT_TEMPLATES[template].modules.includes(k)})),enabled:mods};
}
model.get('/templates',c=>c.json({templates:Object.entries(PROJECT_TEMPLATES).map(([key,t])=>({key,label:t.label,modules:t.modules})),modules:MODULE_KEYS.map(k=>({key:k,label:MODULES[k].label,help:MODULES[k].help,skeleton:MODULES[k].skeleton}))}));
model.get('/:project',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);
 return c.json({project:{id:p.id,name:p.name},...await modelOf(c.env,user,p.id)});
});
const modulesInput=z.object({template:z.string().optional(),modules:z.record(z.string(),z.boolean()).default({})});
model.put('/:project/modules',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user),d=modulesInput.parse(await jsonBody(c));
 if(d.template&&!PROJECT_TEMPLATES[d.template])fail(400,'Ce gabarit n’existe pas.');
 for(const k of Object.keys(d.modules))if(!(MODULE_KEYS as string[]).includes(k))fail(400,'Ce module n’existe pas.');
 const at=now(),cur=await modelOf(c.env,user,p.id),stmts=[c.env.DB.prepare('INSERT INTO project_setup(project_id,user_id,template,feature_seq,created_at,updated_at) VALUES(?,?,?,0,?,?) ON CONFLICT(project_id) DO UPDATE SET template=excluded.template,updated_at=excluded.updated_at').bind(p.id,user,d.template||cur.template,at,at)];
 for(const [k,v] of Object.entries(d.modules))stmts.push(c.env.DB.prepare('INSERT INTO project_modules(project_id,user_id,module_key,enabled,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(project_id,module_key) DO UPDATE SET enabled=excluded.enabled,updated_at=excluded.updated_at').bind(p.id,user,k,v?1:0,at));
 await c.env.DB.batch(stmts);
 return c.json({project:{id:p.id,name:p.name},...await modelOf(c.env,user,p.id)});
});
async function needModule(env:Env,user:string,project:string,key:ModuleKey){
 const m=await modelOf(env,user,project);if(!m.enabled[key])fail(403,'Le module « '+MODULES[key].label+' » n’est pas activé pour ce projet. Activez-le d’abord dans « Modèle du projet ».');
}

/* ───────── Cycle de vie : liste, changement, historique ───────── */
const kindParam=z.enum(['decision','document','memory','feature']);
model.get('/:project/items',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user),all=c.req.query('all')==='1',kinds=c.req.query('kind')?[kindParam.parse(c.req.query('kind'))]:KINDS;
 const out:any[]=[];let hidden=0;
 for(const kind of kinds){
  const col=kind==='decision'||kind==='feature'?(kind==='decision'?'title':'name'):'title';
  const rows=await many<Row>(c.env,`SELECT t.*,l.status AS lc_status,l.reliability AS lc_reliability,l.source_ref AS lc_source,l.proof_kind AS lc_proof,l.fit_confirmed_at AS lc_fit,l.replaced_by_id AS lc_by,l.author_kind AS lc_author FROM ${SOURCE_TABLE[kind]} t LEFT JOIN item_lifecycle l ON l.user_id=t.user_id AND l.kind=? AND l.item_id=t.id WHERE t.user_id=? AND t.project_id=? ORDER BY t.updated_at DESC LIMIT 300`,kind,user,p.id);
  for(const r of rows){
   const lc=r.lc_status?{status:r.lc_status,reliability:r.lc_reliability,source_ref:r.lc_source,proof_kind:r.lc_proof,fit_confirmed_at:r.lc_fit,replaced_by_id:r.lc_by,author_kind:r.lc_author}:null,s=stateOf(kind,r,lc);
   if(!all&&s.status!=='current'){hidden++;continue;}
   out.push(view(kind,r.id,r[col],s,kind==='feature'?{code:r.code}:{}));
  }
 }
 return c.json({items:out,hidden,showing:all?'all':'current',notice:all?'Tout est affiché, y compris ce qui est remplacé, abandonné, rejeté ou à l’état d’hypothèse.':'Seules les informations « Actuelles » sont affichées. '+(hidden?hidden+' autre(s) masquée(s) : demandez « Tout afficher ».':'')});
});
const changeInput=z.object({to_status:z.enum(LIFE).optional(),to_reliability:z.enum(STORED_RELIABILITY).optional(),reason:z.string().max(500).default(''),source_ref:z.string().max(500).optional(),fit_confirmed:z.boolean().optional(),test_passed:z.boolean().optional(),validated_by_martin:z.boolean().optional(),replaced_by_id:z.string().uuid().nullable().optional(),author_kind:z.enum(['martin','ai']).default('martin')});
model.post('/:project/lifecycle/:kind/:id',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user),kind=kindParam.parse(c.req.param('kind')),id=c.req.param('id'),d=changeInput.parse(await jsonBody(c));
 const row=await sourceRow(c.env,user,p.id,kind,id);if(!row)fail(404,'Cette information est introuvable dans ce projet.');
 const lc=await one<Row>(c.env,'SELECT * FROM item_lifecycle WHERE user_id=? AND kind=? AND item_id=?',user,kind,id),cur=stateOf(kind,row,lc);
 let replacement:{exists:boolean;status?:Life}|null=null;
 if(d.replaced_by_id){const r2=await sourceRow(c.env,user,p.id,kind,d.replaced_by_id);if(r2){const l2=await one<Row>(c.env,'SELECT * FROM item_lifecycle WHERE user_id=? AND kind=? AND item_id=?',user,kind,r2.id);replacement={exists:true,status:stateOf(kind,r2,l2).status};}else replacement={exists:false};}
 const at=now(),res=applyChange({kind,cur,itemId:id,author:d.author_kind as Author,reason:d.reason,to_status:d.to_status,to_reliability:d.to_reliability,source_ref:d.source_ref,fit_confirmed:d.fit_confirmed,test_passed:d.test_passed,validated_by_martin:d.validated_by_martin,replaced_by_id:d.replaced_by_id??null,replacement},at);
 if(!res.ok)fail(422,res.message);
 await writeState(c.env,user,p.id,kind,id,cur,res.next,d.reason,at);
 const fresh=stateOf(kind,row,await one<Row>(c.env,'SELECT * FROM item_lifecycle WHERE user_id=? AND kind=? AND item_id=?',user,kind,id));
 return c.json(view(kind,id,row.title||row.name,fresh));
});
model.get('/:project/lifecycle/:kind/:id/history',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user),kind=kindParam.parse(c.req.param('kind'));
 return c.json({items:await many<Row>(c.env,'SELECT id,from_status,to_status,from_reliability,to_reliability,reason,source_ref,replaced_by_id,author_kind,created_at FROM lifecycle_events WHERE user_id=? AND project_id=? AND kind=? AND item_id=? ORDER BY created_at DESC,id',user,p.id,kind,c.req.param('id'))});
});

/* ───────── Suivi des fonctionnalités ───────── */
const featureInput=z.object({name:z.string().trim().min(1).max(140),description:text(3000),state:z.enum(FEATURE_STATES),source_kind:z.enum(['conversation','request','repo_file','other']),source_ref:text(300),group_name:text(80),author_kind:z.enum(['martin','ai']),revision:z.number().int()});
async function featureView(env:Env,user:string,r:Row){
 const lc=await one<Row>(env,"SELECT * FROM item_lifecycle WHERE user_id=? AND kind='feature' AND item_id=?",user,r.id),s=stateOf('feature',r,lc);
 const links=await many<Row>(env,'SELECT id,target_kind,target_id FROM feature_links WHERE user_id=? AND feature_id=? ORDER BY created_at',user,r.id);
 return {id:r.id,code:r.code,name:r.name,description:r.description,state:r.state,state_label:FEATURE_STATE_LABEL[r.state as keyof typeof FEATURE_STATE_LABEL],source_kind:r.source_kind,source_ref:r.source_ref,group_name:r.group_name,revision:r.revision,created_at:r.created_at,updated_at:r.updated_at,
  life:view('feature',r.id,r.name,s),links};
}
model.get('/:project/features',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);await needModule(c.env,user,p.id,'features');
 const all=c.req.query('all')==='1',rows=await many<Row>(c.env,'SELECT * FROM project_features WHERE user_id=? AND project_id=? ORDER BY group_name,position,code',user,p.id),out=[];let hidden=0;
 for(const r of rows){const v=await featureView(c.env,user,r);if(!all&&v.life.status!=='current'){hidden++;continue;}out.push(v);}
 return c.json({items:out,hidden,showing:all?'all':'current'});
});
model.post('/:project/features',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);await needModule(c.env,user,p.id,'features');
 const d=featureInput.partial().required({name:true}).parse(await jsonBody(c)),author=(d.author_kind||'martin') as Author,at=now();
 if(d.state==='phone_verified'||d.state==='done')fail(422,'Une nouvelle fonctionnalité commence « À concevoir », « En cours » ou « Bloquée ».');
 // Numéro stable et jamais réutilisé : compteur par projet, avancé atomiquement.
 await run(c.env,'INSERT INTO project_setup(project_id,user_id,template,feature_seq,created_at,updated_at) VALUES(?,?,?,0,?,?) ON CONFLICT(project_id) DO NOTHING',p.id,user,(await modelOf(c.env,user,p.id)).template,at,at);
 const seq=await one<Row>(c.env,'UPDATE project_setup SET feature_seq=feature_seq+1,updated_at=? WHERE project_id=? AND user_id=? RETURNING feature_seq',at,p.id,user);
 const id=uid(),code=featureCode(seq!.feature_seq),init=initialState('feature',author,d.source_ref||'');
 await c.env.DB.batch([
  c.env.DB.prepare('INSERT INTO project_features(id,user_id,project_id,code,name,description,state,source_kind,source_ref,group_name,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,user,p.id,code,d.name,d.description||'',d.state||'to_design',d.source_kind||'other',d.source_ref||'',d.group_name||'',seq!.feature_seq,at,at),
  c.env.DB.prepare('INSERT INTO item_lifecycle(user_id,project_id,kind,item_id,status,reliability,source_ref,proof_kind,fit_confirmed_at,replaced_by_id,author_kind,revision,updated_at) VALUES(?,?,?,?,?,?,?,?,NULL,NULL,?,1,?)').bind(user,p.id,'feature',id,init.status,init.reliability,init.source_ref,'',init.author_kind,at),
  c.env.DB.prepare('INSERT INTO lifecycle_events(id,user_id,project_id,kind,item_id,from_status,to_status,from_reliability,to_reliability,reason,source_ref,replaced_by_id,author_kind,created_at) VALUES(?,?,?,?,?,NULL,?,NULL,?,?,?,NULL,?,?)').bind(uid(),user,p.id,'feature',id,init.status,init.reliability,author==='ai'?'Création proposée par une IA : à relire.':'Création par Martin.',init.source_ref,author,at)
 ]);
 return c.json(await featureView(c.env,user,(await sourceRow(c.env,user,p.id,'feature',id))!),201);
});
model.patch('/:project/features/:id',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);await needModule(c.env,user,p.id,'features');
 const d=featureInput.partial().required({revision:true}).parse(await jsonBody(c)),cur=await sourceRow(c.env,user,p.id,'feature',c.req.param('id'));
 if(!cur)fail(404,'Cette fonctionnalité est introuvable dans ce projet.');
 const lc=await one<Row>(c.env,"SELECT status FROM item_lifecycle WHERE user_id=? AND kind='feature' AND item_id=?",user,cur.id);
 if(lc&&['replaced','abandoned','rejected'].includes(lc.status))fail(422,'Cette fonctionnalité est '+LIFE_LABEL[lc.status as Life].toLowerCase()+' : elle ne se modifie plus.');
 if(d.state==='phone_verified'&&(d.author_kind||'martin')==='ai')fail(422,'Seul Martin peut noter « Vérifié sur téléphone ».');
 const at=now(),r=await run(c.env,'UPDATE project_features SET name=?,description=?,state=?,source_kind=?,source_ref=?,group_name=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND project_id=? AND revision=?',d.name??cur.name,d.description??cur.description,d.state??cur.state,d.source_kind??cur.source_kind,d.source_ref??cur.source_ref,d.group_name??cur.group_name,at,cur.id,user,p.id,d.revision);
 if(!r.meta.changes)fail(409,'Cette fonctionnalité a changé sur un autre appareil. Rechargez-la avant de réappliquer vos changements.');
 return c.json(await featureView(c.env,user,(await sourceRow(c.env,user,p.id,'feature',cur.id))!));
});
const linkInput=z.object({target_kind:z.enum(['task','decision']),target_id:z.string().uuid()});
model.post('/:project/features/:id/links',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);await needModule(c.env,user,p.id,'features');
 const f=await sourceRow(c.env,user,p.id,'feature',c.req.param('id'));if(!f)fail(404,'Cette fonctionnalité est introuvable dans ce projet.');
 const d=linkInput.parse(await jsonBody(c)),table=d.target_kind==='task'?'plan_tasks':'project_decisions';
 if(!await one(c.env,`SELECT id FROM ${table} WHERE id=? AND user_id=? AND project_id=?`,d.target_id,user,p.id))fail(400,'Cet élément n’appartient pas à ce projet.');
 await run(c.env,'INSERT INTO feature_links(id,user_id,feature_id,target_kind,target_id,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(feature_id,target_kind,target_id) DO NOTHING',uid(),user,f.id,d.target_kind,d.target_id,now());
 return c.json(await featureView(c.env,user,f),201);
});
model.delete('/:project/features/:id/links/:link',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user),f=await sourceRow(c.env,user,p.id,'feature',c.req.param('id'));
 if(!f)fail(404,'Cette fonctionnalité est introuvable dans ce projet.');
 await run(c.env,'DELETE FROM feature_links WHERE id=? AND user_id=? AND feature_id=?',c.req.param('link'),user,f.id);
 return c.json(await featureView(c.env,user,f));
});

/* ───────── Lot 4 : importer un fichier de départ (créer seulement, jamais modifier ni supprimer) ───────── */
model.post('/:project/import',async c=>{
 const user=userId(c),p=await owned(c.env,'projects',c.req.param('project'),user);await needModule(c.env,user,p.id,'features');
 const dry=c.req.query('dry_run')==='1',parsed=seedFile.safeParse(await jsonBody(c));
 if(!parsed.success)fail(422,'Ce fichier n’est pas un fichier de départ valable : '+parsed.error.issues.slice(0,3).map(i=>(i.path.join('.')||'fichier')+' — '+i.message).join(' ; ')+'. Rien n’a été importé.');
 const seed=parsed.data,problems=checkSeed(seed);
 if(problems.length)return c.json({ok:false,imported:false,problems,message:'Le fichier contient '+problems.length+' problème(s). Rien n’a été importé.'},422);
 const fIds=await Promise.all(seed.features.map(f=>seedId(user,p.id,'feature',f.key))),dIds=await Promise.all(seed.decisions.map(d=>seedId(user,p.id,'decision',d.key)));
 const have=async(table:string,ids:string[])=>{const s=new Set<string>();for(let i=0;i<ids.length;i+=40){const part=ids.slice(i,i+40);for(const r of await many<Row>(c.env,`SELECT id FROM ${table} WHERE user_id=? AND project_id=? AND id IN (${part.map(()=>'?').join(',')})`,user,p.id,...part))s.add(r.id);}return s;};
 const hasF=await have('project_features',fIds),hasD=await have('project_decisions',dIds);
 // Un identifiant dérivé qui existerait dans un AUTRE projet ou compte ne peut pas arriver ici (le projet et l'utilisateur sont dans le calcul).
 const newF=seed.features.map((f,i)=>({f,id:fIds[i]})).filter(x=>!hasF.has(x.id)),newD=seed.decisions.map((d,i)=>({d,id:dIds[i]})).filter(x=>!hasD.has(x.id));
 const summary={features:{new:newF.length,already_present:seed.features.length-newF.length},decisions:{new:newD.length,already_present:seed.decisions.length-newD.length}};
 const names={features:{new:newF.map(x=>x.f.name),already_present:seed.features.filter((_,i)=>hasF.has(fIds[i])).map(f=>f.name)},decisions:{new:newD.map(x=>x.d.title),already_present:seed.decisions.filter((_,i)=>hasD.has(dIds[i])).map(d=>d.title)}};
 if(dry||(!newF.length&&!newD.length))return c.json({ok:true,imported:false,dry_run:dry,summary,names,message:dry?'Aperçu seulement : rien n’a été écrit.':'Tout est déjà présent : rien n’a été ajouté, rien n’a été modifié.'});
 const at=now();
 let start=0;
 if(newF.length){
  await run(c.env,'INSERT INTO project_setup(project_id,user_id,template,feature_seq,created_at,updated_at) VALUES(?,?,?,0,?,?) ON CONFLICT(project_id) DO NOTHING',p.id,user,(await modelOf(c.env,user,p.id)).template,at,at);
  const seq=await one<Row>(c.env,'UPDATE project_setup SET feature_seq=feature_seq+?,updated_at=? WHERE project_id=? AND user_id=? RETURNING feature_seq',newF.length,at,p.id,user);
  start=seq!.feature_seq-newF.length;
 }
 const stmts:D1PreparedStatement[]=[];
 for(const [i,{f,id}] of newF.entries()){
  const n=start+i+1,verified=f.reliability==='verified',rel=f.reliability,src=verified?(f.source_ref+' · test : '+f.test_ref).slice(0,300):f.source_ref,evId=await seedId(user,p.id,'event',f.key);
  const status=rel==='hypothesis'?'hypothesis':'current';
  stmts.push(
   c.env.DB.prepare('INSERT INTO project_features(id,user_id,project_id,code,name,description,state,source_kind,source_ref,group_name,position,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(id,user,p.id,featureCode(n),f.name,f.description,f.state,f.source_kind,f.source_ref,f.group,n,at,at),
   c.env.DB.prepare('INSERT INTO item_lifecycle(user_id,project_id,kind,item_id,status,reliability,source_ref,proof_kind,fit_confirmed_at,replaced_by_id,author_kind,revision,updated_at) VALUES(?,?,?,?,?,?,?,?,?,NULL,?,1,?) ON CONFLICT(user_id,kind,item_id) DO NOTHING').bind(user,p.id,'feature',id,status,rel,src,verified?'test':'',verified?at:null,'martin',at),
   c.env.DB.prepare('INSERT INTO lifecycle_events(id,user_id,project_id,kind,item_id,from_status,to_status,from_reliability,to_reliability,reason,source_ref,replaced_by_id,author_kind,created_at) VALUES(?,?,?,?,?,NULL,?,NULL,?,?,?,NULL,?,?) ON CONFLICT(id) DO NOTHING').bind(evId,user,p.id,'feature',id,status,rel,importReason(rel),src,'martin',at));
 }
 for(const {d,id} of newD){
  const evId=await seedId(user,p.id,'event','decision:'+d.key);
  stmts.push(
   c.env.DB.prepare("INSERT INTO project_decisions(id,user_id,project_id,title,reason,status,source_kind,source_ref,created_at,updated_at) VALUES(?,?,?,?,?,'proposed','other',?,?,?) ON CONFLICT(id) DO NOTHING").bind(id,user,p.id,d.title,d.reason,d.source_ref,at,at),
   c.env.DB.prepare("INSERT INTO item_lifecycle(user_id,project_id,kind,item_id,status,reliability,source_ref,proof_kind,fit_confirmed_at,replaced_by_id,author_kind,revision,updated_at) VALUES(?,?,'decision',?,'proposed','hypothesis',?,'',NULL,NULL,'ai',1,?) ON CONFLICT(user_id,kind,item_id) DO NOTHING").bind(user,p.id,id,d.source_ref,at),
   c.env.DB.prepare("INSERT INTO lifecycle_events(id,user_id,project_id,kind,item_id,from_status,to_status,from_reliability,to_reliability,reason,source_ref,replaced_by_id,author_kind,created_at) VALUES(?,?,?,'decision',?,NULL,'proposed',NULL,'hypothesis',?,?,NULL,'ai',?) ON CONFLICT(id) DO NOTHING").bind(evId,user,p.id,id,'Décision recopiée du fichier de départ : à valider par vous, une par une.',d.source_ref,at));
 }
 for(let i=0;i<stmts.length;i+=90)await c.env.DB.batch(stmts.slice(i,i+90));
 await event(c.env,user,'seed_import','Fichier de départ importé : '+newF.length+' fonctionnalité(s) et '+newD.length+' décision(s) ajoutée(s), rien modifié.',p.id);
 return c.json({ok:true,imported:true,dry_run:false,summary,names,message:'Importé : '+newF.length+' fonctionnalité(s) et '+newD.length+' décision(s) ajoutée(s). Les décisions sont « Proposées » : validez-les vous-même, une par une.'},201);
});
