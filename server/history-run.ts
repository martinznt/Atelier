/* Moteur d'analyse de l'historique importé : une unité par appel, avec relais entre Gemini, Groq et Mistral.
   Garanties : aucun envoi sans accord enregistré ; une unité déjà analysée n'est jamais renvoyée ; toute réponse brute est conservée ;
   une limite de fournisseur met l'analyse en pause avec l'heure connue, sans rien perdre ; Claude n'est jamais sollicité ici. */
import {many,now,one,run,uid} from './core.ts';
import {credentialsFor} from './routes/connections.ts';
import {generate} from './connectors/ai.ts';
import {availabilityOf,estimateTokens,storedFailure,type Availability} from './ai-availability.ts';
import {selectCandidates,runWithRelay,AttemptError} from './ai-relay.ts';
import {recordObservation,loadAiConnections,recentCalls,recordUsage,unavailable} from './ai-persist.ts';
import {pickReviewModel} from './review-team.mjs';
import {sha256Hex} from './handoff-core.ts';
import {ANALYSIS_PROVIDERS,PROMPT_VERSION,analysisPrompt,chunkMessages,compareItems,needsSecondPass,parseAnalysis,providerOrder,unitFingerprint,type SourceMessage,type Unit} from './history-analysis.ts';
import type {Env,Row} from './types.ts';
const models=(c:any):string[]=>{try{const m=typeof c.models==='string'?JSON.parse(c.models):c.models;return Array.isArray(m)?m.map(String):[];}catch{return [];}};
export async function unitMessages(env:Env,user:string,unit:Row):Promise<SourceMessage[]>{
 return (await many<Row>(env,'SELECT m.seq,m.source_key,m.role,m.content,m.original_date,m.content_hash FROM bridge_messages m WHERE m.conversation_id=? AND m.owner_id=? AND m.seq BETWEEN ? AND ? ORDER BY m.seq',unit.bridge_conversation_id,user,unit.first_seq,unit.last_seq))
  .map(r=>({seq:r.seq,key:String(r.source_key),role:r.role,content:r.content,date:r.original_date,hash:r.content_hash}));
}
/** Découpage local (aucune IA) des conversations importées d'un inventaire. Reprend là où il s'est arrêté grâce au curseur. */
export async function prepareUnits(env:Env,user:string,batch:Row,opts:{lot?:string;after?:string;limit?:number}={}){
 const limit=Math.min(40,Math.max(1,opts.limit||15));
 const convs=await many<Row>(env,"SELECT id,source_id,title,lot FROM export_conversations WHERE user_id=? AND batch_id=? AND parse_status!='ignored' AND (?='' OR lot=?) AND id>? ORDER BY id LIMIT ?",user,batch.id,opts.lot||'',opts.lot||'',opts.after||'',limit+1);
 let created=0,unchanged=0,without=0,superseded=0;const at=now();
 for(const c of convs.slice(0,limit)){
  const bc=await one<Row>(env,'SELECT bc.id FROM bridge_conversations bc JOIN bridge_spaces s ON s.id=bc.space_id WHERE s.owner_id=? AND bc.provider=? AND bc.source_key=?',user,batch.provider,batch.provider+':'+c.source_id);
  const rows=bc?await many<Row>(env,'SELECT seq,source_key,role,content,original_date,content_hash FROM bridge_messages WHERE conversation_id=? AND owner_id=? ORDER BY seq',bc.id,user):[];
  if(!bc||!rows.length){without++;continue;}
  const units=chunkMessages(rows.map(r=>({seq:r.seq,key:String(r.source_key),role:r.role,content:r.content,date:r.original_date,hash:r.content_hash})));
  const hashes:string[]=[];
  for(const u of units){
   const hash=await sha256Hex(unitFingerprint(u));hashes.push(hash);
   const res=await run(env,'INSERT INTO analysis_units(id,user_id,batch_id,conversation_id,bridge_conversation_id,lot,chunk_index,chunk_count,first_seq,last_seq,message_count,chars,truncated,content_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,batch_id,conversation_id,chunk_index,content_hash) DO NOTHING',
    uid(),user,batch.id,c.id,bc.id,c.lot||'',u.index,u.count,u.first_seq,u.last_seq,u.messages.length,u.chars,u.truncated?1:0,hash,at,at);
   if(res.meta.changes)created++;else unchanged++;
  }
  // Le contenu a changé depuis un découpage précédent : l'ancienne unité est gardée (avec ses résultats) mais n'est plus à traiter.
  const old=await many<Row>(env,"SELECT id,content_hash FROM analysis_units WHERE user_id=? AND batch_id=? AND conversation_id=? AND status!='superseded'",user,batch.id,c.id);
  for(const o of old)if(!hashes.includes(o.content_hash)){await run(env,"UPDATE analysis_units SET status='superseded',updated_at=? WHERE id=? AND user_id=?",at,o.id,user);superseded++;}
 }
 const more=convs.length>limit;
 return {created,unchanged,without_messages:without,superseded,next:more?convs[limit-1].id:null};
}
export interface StepResult{status:'done'|'analysed'|'invalid'|'paused'|'no_provider'|'interrupted';pass?:'first'|'second';unit_id?:string;items?:number;dropped?:number;provider?:string;model?:string;relayed?:boolean;until?:string|null;reasons?:string[];message:string}
/** Traite UNE unité : première lecture en priorité, puis secondes lectures demandées. */
export async function analysisStep(env:Env,user:string,batch:Row,opts:{lot?:string}={}):Promise<StepResult>{
 if(!batch.ai_consent_at)return {status:'no_provider',message:'Accord non enregistré : rien n’est envoyé à une IA sans votre accord pour cet export.'};
 const lot=opts.lot||'';
 let pass:'first'|'second'='first';
 let unit=await one<Row>(env,"SELECT * FROM analysis_units WHERE user_id=? AND batch_id=? AND status='pending' AND (?='' OR lot=?) ORDER BY fail_count,lot,conversation_id,chunk_index LIMIT 1",user,batch.id,lot,lot);
 if(!unit){pass='second';unit=await one<Row>(env,"SELECT * FROM analysis_units WHERE user_id=? AND batch_id=? AND status='analysed' AND second_status='wanted' AND (?='' OR lot=?) ORDER BY lot,conversation_id,chunk_index LIMIT 1",user,batch.id,lot,lot);}
 if(!unit)return {status:'done',message:'Aucune unité en attente.'};
 const conv=await one<Row>(env,'SELECT title FROM export_conversations WHERE id=? AND user_id=?',unit.conversation_id,user);
 const messages=await unitMessages(env,user,unit);
 if(!messages.length){await run(env,"UPDATE analysis_units SET status='failed',last_error=?,updated_at=? WHERE id=? AND user_id=?",'Messages source introuvables : réimportez la conversation, puis préparez de nouveau l’analyse.',now(),unit.id,user);return {status:'invalid',pass,unit_id:unit.id,message:'Messages source introuvables pour cette unité.'};}
 const u:Unit={index:unit.chunk_index,count:unit.chunk_count,messages,chars:unit.chars,truncated:Boolean(unit.truncated),first_seq:unit.first_seq,last_seq:unit.last_seq};
 const prompt=analysisPrompt(u,conv?.title||'Sans titre'),estimate=estimateTokens(prompt.length,2500);
 const firstOk=pass==='second'?await one<Row>(env,"SELECT id,provider FROM analysis_results WHERE user_id=? AND unit_id=? AND pass='first' AND status='ok' ORDER BY created_at DESC LIMIT 1",user,unit.id):null;
 // Seuls Gemini, Groq et Mistral : Claude et les fournisseurs facturés ne sont jamais utilisés pour cette migration.
 let connections=(await loadAiConnections(env.DB,user)).filter(c=>(ANALYSIS_PROVIDERS as readonly string[]).includes(c.provider));
 if(pass==='second'&&firstOk)connections=connections.filter(c=>c.provider!==firstOk.provider);     // lecture indépendante : un autre fournisseur
 const order=providerOrder({chars:unit.chars,chunk_count:unit.chunk_count,pass});
 const preferred=[...connections].sort((a,b)=>order.indexOf(a.provider)-order.indexOf(b.provider)).map(c=>({connection_id:c.id,model:pickReviewModel({models:models(c)})})).filter(p=>p.model) as {connection_id:string;model:string}[];
 const selection=selectCandidates({connections,preferred,allowRelay:false,now:now(),estimateTokens:estimate,usage:await recentCalls(env.DB,user,now())});
 const fresh=new Map<string,{conn:any;secret:string}>(),tokens:Record<string,{input?:number;output?:number}>={};
 const relay=await runWithRelay<{provider:string;model:string;output:string}>({
  candidates:selection.candidates,excluded:selection.excluded,maxAttempts:3,now,
  recheck:async c=>{try{const cs=await credentialsFor(env,c.connection_id,user,'chat');fresh.set(c.connection_id,cs);return availabilityOf(cs.conn,{model:c.model,now:now(),estimateTokens:estimate}) as Availability;}catch{return unavailable('Connexion indisponible (accès refusé, expiré ou désactivé).');}},
  onFailure:async(c,cl)=>{if(['request_rejected','unknown','interrupted'].includes(cl.kind))return;const snap=fresh.get(c.connection_id)?.conn.secret;if(snap)await recordObservation(env.DB,c.connection_id,user,snap,{type:'failure',failure:storedFailure(cl,c.model,now())},now());},
  attempt:async c=>{
   const cs=fresh.get(c.connection_id);if(!cs)throw new AttemptError(new Error('Connexion non préparée'),true);
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
   let output='',model=c.model,input:number|undefined,out:number|undefined,accepted=false;
   try{for await(const d of generate(cs.conn.provider,cs.secret,c.model,[{role:'user',content:prompt}],2500,controller.signal)){
     if(d.quota){accepted=true;try{await recordObservation(env.DB,c.connection_id,user,cs.conn.secret,{type:'success',model:c.model,headers:d.quota as any},now());}catch{/* diagnostic seulement */}}
     output+=d.text||'';if(d.model)model=d.model;if(d.input!==undefined)input=d.input;if(d.output!==undefined)out=d.output;
     if(output.length>30000){controller.abort();throw Error('Réponse trop volumineuse.');}}
   }catch(error){throw new AttemptError(error,accepted,output);}finally{clearTimeout(timer);}
   tokens[c.connection_id+'\n'+c.model]={input,output:out};return {provider:cs.conn.provider,model,output};
  }
 });
 await recordUsage(env.DB,user,{task_kind:'export_analysis',task_id:batch.id,role:pass,attempts:relay.attempts,tokens});
 const at=now(),relayed=relay.attempts.some(a=>a.outcome==='refused'||a.outcome==='skipped');
 if(relay.status!=='completed'||!relay.value||!relay.used){
  const all=[...relay.excluded.map(e=>({label:e.label,reason:e.reason,until:e.until})),...relay.attempts.filter(a=>a.outcome!=='completed').map(a=>({label:a.label,reason:a.reason,until:a.until}))];
  const untils=all.map(e=>e.until).filter(Boolean).sort() as string[],reasons=[...new Set(all.map(e=>e.label+' : '+e.reason))].slice(0,6);
  if(relay.status==='interrupted'){
   // Réponse coupée : le texte partiel est gardé comme trace, jamais comme résultat ; l'unité reste à reprendre.
   await run(env,'INSERT INTO analysis_results(id,user_id,unit_id,pass,connection_id,provider,model,prompt_version,status,raw,note,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',uid(),user,unit.id,pass,relay.used?.connection_id||'',relay.used?.provider||'',relay.used?.model||'',PROMPT_VERSION,'invalid',String(relay.partial||'').slice(0,30000),'Réponse interrompue : incomplète.',at);
   await run(env,'UPDATE analysis_units SET fail_count=fail_count+1,last_error=?,updated_at=? WHERE id=? AND user_id=?','Réponse interrompue.',at,unit.id,user);
   return {status:'interrupted',pass,unit_id:unit.id,provider:relay.used?.provider,model:relay.used?.model,reasons,message:'Réponse interrompue : l’unité reste à reprendre, rien n’est perdu.'};
  }
  if(pass==='second'&&!connections.length)return {status:'no_provider',pass,unit_id:unit.id,reasons,message:'Seconde lecture impossible : aucun autre fournisseur que '+(firstOk?.provider||'le premier')+' n’est connecté. Les éléments restent marqués « une seule lecture ».'};
  if(!connections.length)return {status:'no_provider',pass,reasons,message:'Aucune connexion Gemini, Groq ou Mistral utilisable. Ajoutez-en une dans Réglages → Connexions, testez-la et autorisez la discussion.'};
  return {status:'paused',pass,unit_id:unit.id,until:untils[0]||null,reasons,message:untils[0]?'Toutes les IA disponibles sont en limite. Reprise possible à l’heure indiquée ; l’unité reste en attente.':'Aucune IA disponible pour l’instant ; l’unité reste en attente.'};
 }
 const v=relay.value,parsed=parseAnalysis(v.output,u),resultId=uid(),tk=tokens[relay.used.connection_id+'\n'+relay.used.model]||{};
 await run(env,'INSERT INTO analysis_results(id,user_id,unit_id,pass,connection_id,provider,model,prompt_version,status,raw,note,input_tokens,output_tokens,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  resultId,user,unit.id,pass,relay.used.connection_id,v.provider,v.model,PROMPT_VERSION,parsed.ok?'ok':'invalid',v.output.slice(0,30000),parsed.ok?(parsed.dropped.length?parsed.dropped.length+' élément(s) écarté(s) faute de message source : '+parsed.dropped.slice(0,5).join(' | '):''):String(parsed.error),tk.input??null,tk.output??null,at);
 if(!parsed.ok){
  const fails=unit.fail_count+1,giveUp=fails>=3;
  if(pass==='first')await run(env,"UPDATE analysis_units SET fail_count=?,status=?,last_error=?,updated_at=? WHERE id=? AND user_id=?",fails,giveUp?'failed':'pending',v.provider+' : '+parsed.error,at,unit.id,user);
  else await run(env,"UPDATE analysis_units SET fail_count=?,second_status=?,last_error=?,updated_at=? WHERE id=? AND user_id=?",fails,giveUp?'failed':'wanted',v.provider+' : '+parsed.error,at,unit.id,user);
  return {status:'invalid',pass,unit_id:unit.id,provider:v.provider,model:v.model,relayed,message:'Réponse de '+v.provider+' inexploitable ('+parsed.error+'). Elle est conservée ; '+(giveUp?'après trois essais l’unité est marquée « en échec », à reprendre à la main.':'l’unité sera retentée.')};
 }
 const insert=parsed.items.map(i=>env.DB.prepare('INSERT INTO analysis_items(id,user_id,batch_id,unit_id,result_id,pass,kind,text,source_keys,quote,quote_verified,reclassified,project_hint,important,agreement,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(uid(),user,batch.id,unit.id,resultId,pass,i.kind,i.text,JSON.stringify(i.source_keys),i.quote,i.quote_verified?1:0,i.reclassified?1:0,i.project_hint,i.important?1:0,'unchecked',at));
 for(let k=0;k<insert.length;k+=40)await env.DB.batch(insert.slice(k,k+40));
 if(pass==='first'){
  await run(env,"UPDATE analysis_units SET status='analysed',second_status=?,fail_count=0,last_error='',updated_at=? WHERE id=? AND user_id=?",needsSecondPass(parsed.items)?'wanted':'none',at,unit.id,user);
 }else{
  const load=async(p:string)=>(await many<Row>(env,'SELECT id,kind,source_keys FROM analysis_items WHERE user_id=? AND unit_id=? AND pass=? ORDER BY created_at,id',user,unit.id,p)).map(r=>({id:r.id as string,kind:r.kind as string,source_keys:JSON.parse(r.source_keys) as string[]}));
  const a=await load('first'),b=await load('second'),cmp=compareItems(a,b);
  const st=[...a.map((x,k)=>[x.id,cmp.first[k]]),...b.map((x,k)=>[x.id,cmp.second[k]])].map(([id,ag])=>env.DB.prepare('UPDATE analysis_items SET agreement=? WHERE id=? AND user_id=?').bind(ag,id,user));
  for(let k=0;k<st.length;k+=40)await env.DB.batch(st.slice(k,k+40));
  await run(env,"UPDATE analysis_units SET second_status='done',fail_count=0,last_error='',updated_at=? WHERE id=? AND user_id=?",at,unit.id,user);
 }
 return {status:'analysed',pass,unit_id:unit.id,items:parsed.items.length,dropped:parsed.dropped.length,provider:v.provider,model:v.model,relayed,message:(pass==='first'?'Première lecture':'Seconde lecture')+' par '+v.provider+' : '+parsed.items.length+' élément(s) relevé(s).'};
}
