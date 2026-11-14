/* État public du schéma D1 : uniquement des numéros de migration présents ou manquants.
   Aucune donnée, aucun nom de compte, aucun secret. Sert à vérifier un déploiement sans session. */
export interface SchemaStatus{complete:boolean|null;applied:string[];missing:string[]}
const checks:{id:string;table:string;columns:string[]}[]=[
 {id:'0007',table:'users',columns:['email']},
 {id:'0008',table:'review_runs',columns:['head_sha','report']},
 {id:'0009',table:'review_configs',columns:['daily_limit']},
 {id:'0010',table:'review_runs',columns:['stage','diagnostic']},
 {id:'0011',table:'review_configs',columns:['post_comment']},
 {id:'0012',table:'review_configs',columns:['review_mode']},
 {id:'0013',table:'review_configs',columns:['relay','relay_max_attempts']},
 {id:'0013',table:'review_runs',columns:['resume_at','resume_state']},
 {id:'0013',table:'ai_usage',columns:['connection_id','outcome']},
 {id:'0014',table:'review_configs',columns:['auto_scope']},
 {id:'0015',table:'review_configs',columns:['no_daily_cap']},
 {id:'0016',table:'review_configs',columns:['auto_mark']},
 {id:'0017',table:'handoff_packages',columns:['content_hash','status']},
 {id:'0017',table:'plan_tasks',columns:['depends_on','proof']},
 {id:'0017',table:'repositories',columns:['verified_at']},
 {id:'0018',table:'conversations',columns:['category','status']},
 {id:'0018',table:'atelier_questions',columns:['dedupe_key']},
 {id:'0018',table:'prompt_versions',columns:['locked','sent_at']},
 {id:'0018',table:'ref_audit_files',columns:['read_status']},
 {id:'0019',table:'plan_tasks',columns:['work_kind','do_not_touch']},
 {id:'0019',table:'quota_readings',columns:['used_percent','source']},
 {id:'0019',table:'checkpoints',columns:['next_action']},
 {id:'0020',table:'export_batches',columns:['ai_consent_at']},
 {id:'0020',table:'analysis_items',columns:['quote_verified','agreement']},
 {id:'0021',table:'export_files',columns:['sniff_kind','sha256']},
 {id:'0021',table:'export_conversations',columns:['segment']},
 {id:'0022',table:'export_conversations',columns:['meta','source_index']},
 {id:'0022',table:'export_files',columns:['group_name']},
 {id:'0022',table:'export_attachment_refs',columns:['link_source','note']},
 {id:'0022',table:'export_segments',columns:['rows_stored','nodes_stored','dropped_fields','issues','wrapper','reason_code']},
 {id:'0022',table:'export_nodes',columns:['id','user_id','batch_id','conversation_id','node_id','parent_id','children','role','content_type','create_time','has_text','text_chars','attachment_refs','meta']},
 {id:'0022',table:'export_annexes',columns:['id','user_id','batch_id','name','kind','size','sha256','status','shape','content','note','created_at']},
 {id:'0022',table:'export_links',columns:['id','user_id','batch_id','ref_key','declared_path','file_id','status']}
];
let cache:{at:number;value:SchemaStatus}|null=null;
/** Cache de 60 s par instance : la page de santé est publique, elle ne doit pas solliciter D1 à chaque appel. */
export async function schemaStatus(db:D1Database,now=Date.now()):Promise<SchemaStatus>{
 if(cache&&now-cache.at<60_000&&cache.value.complete!==null)return cache.value;
 const value=await readSchema(db);
 if(value.complete!==null)cache={at:now,value};
 return value;
}
export function resetSchemaCache(){cache=null;}
async function readSchema(db:D1Database):Promise<SchemaStatus>{
 try{
  const cache=new Map<string,Set<string>>();
  const columnsOf=async(table:string)=>{
   if(!cache.has(table)){const rows=await db.prepare('PRAGMA table_info('+table+')').all<{name:string}>();cache.set(table,new Set(rows.results.map(r=>r.name)));}
   return cache.get(table)!;
  };
  const ok=new Map<string,boolean>();
  for(const c of checks){
   const cols=await columnsOf(c.table);
   ok.set(c.id,(ok.get(c.id)??true)&&c.columns.every(x=>cols.has(x)));
  }
  const ids=[...ok.keys()];
  return {complete:ids.every(i=>ok.get(i)),applied:ids.filter(i=>ok.get(i)),missing:ids.filter(i=>!ok.get(i))};
 }catch{return {complete:null,applied:[],missing:[]};} // base illisible : état inconnu, jamais « complet » par défaut
}
