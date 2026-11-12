/* Conseil de modèle, relevés de quota, retours de travail et points de reprise. Module pur : aucun réseau, aucune mesure.
   La répartition Haiku / Sonnet / Opus / Fable applique la stratégie écrite par Martin le 12 novembre 2026 ;
   ce n'est pas un classement mesuré des modèles. Atelier ne connaît jamais un quota restant : il n'affiche que des relevés saisis. */
export const WORK_KINDS=['mechanical_check','classification','documentation','development','fix','analysis','review','audit','architecture','blocker'] as const;
export type WorkKind=typeof WORK_KINDS[number];
export const WORK_KIND_LABEL:Record<WorkKind,string>={mechanical_check:'Vérification mécanique',classification:'Classement ou extraction simple',documentation:'Documentation',development:'Développement courant',fix:'Correction',analysis:'Analyse ordinaire',review:'Relecture indépendante',audit:'Audit approfondi',architecture:'Architecture',blocker:'Blocage non résolu'};
export const COMPLEXITIES=['simple','ordinary','complex','hard'] as const;export type Complexity=typeof COMPLEXITIES[number];
export const IMPORTANCES=['low','normal','high','critical'] as const;export type Importance=typeof IMPORTANCES[number];
export type Family='haiku'|'sonnet'|'opus'|'fable';
export const FAMILY_LABEL:Record<Family|'none'|'all'|'other',string>={none:'Aucun modèle',haiku:'Haiku',sonnet:'Sonnet 5.5',opus:'Opus',fable:'Fable 5.2',all:'Tous modèles',other:'Autre'};
export interface AdviceInput{kind?:WorkKind|'';complexity?:Complexity|'';importance?:Importance|'';failed_attempts?:number;failure_analysed?:boolean;files_count?:number;whole_repo?:boolean;has_tests?:boolean;has_objective?:boolean;has_acceptance?:boolean;has_files?:boolean;haiku_available?:boolean}
export interface Advice{model:Family|'none';effort:'low'|'medium'|'high'|null;complexity:Complexity;importance:Importance;verification:'automated_tests'|'tests_then_self_review'|'tests_then_independent_review';cost_risk:'low'|'medium'|'high';reasons:string[];savings:string[];warnings:string[];assumed:string[]}
const rank=<T extends string>(list:readonly T[],v:T)=>list.indexOf(v);

/** Le modèle le moins coûteux jugé suffisant, selon la stratégie de Martin. Toute valeur absente est signalée dans « assumed ». */
export function recommend(i:AdviceInput):Advice{
 const assumed:string[]=[],reasons:string[]=[],savings:string[]=[],warnings:string[]=[];
 const kind=(i.kind||'development') as WorkKind;if(!i.kind)assumed.push('Type de travail non précisé : traité comme du développement courant.');
 const complexity=(i.complexity||'ordinary') as Complexity;if(!i.complexity)assumed.push('Complexité non précisée : supposée ordinaire.');
 const importance=(i.importance||'normal') as Importance;if(!i.importance)assumed.push('Importance non précisée : supposée normale.');
 const fails=Math.max(0,Math.floor(i.failed_attempts||0));
 let model:Family|'none'='sonnet',effort:Advice['effort']='medium';
 if(kind==='mechanical_check'){
  model='none';effort=null;reasons.push('Une vérification mécanique se fait d’abord par un test automatisé ou un contrôle simple, sans modèle.');
  savings.push('Écrire ou lancer le test évite toute consommation ; ne demander une lecture à un modèle que si le test échoue sans explication.');
 }else if(kind==='classification'&&rank(COMPLEXITIES,complexity)<=1&&rank(IMPORTANCES,importance)<=1){
  if(i.haiku_available===false){model='sonnet';effort='low';reasons.push('Tâche répétitive à faible enjeu ; Haiku indiqué comme indisponible, donc Sonnet en effort faible.');}
  else{model='haiku';effort='low';reasons.push('Classement ou extraction simple à faible enjeu : le plus petit modèle suffit.');}
 }else if(kind==='blocker'||complexity==='hard'){
  if(fails>=1&&!i.failure_analysed){model='sonnet';effort='high';reasons.push('Avant de monter en gamme, l’échec précédent doit être analysé : sinon le modèle plus puissant refait la même erreur plus cher.');}
  else if(fails>=2||complexity==='hard'&&(kind==='architecture'||kind==='blocker')){model='fable';effort='high';reasons.push(fails>=2?'Deux tentatives ou plus ont échoué après analyse : blocage réel, Fable justifié.':'Problème d’architecture ou blocage jugé très difficile : raisonnement approfondi justifié.');}
  else{model='opus';effort='high';reasons.push('Travail très difficile mais pas encore bloqué : Opus avant Fable.');}
 }else if(kind==='audit'||kind==='review'){
  if(rank(IMPORTANCES,importance)>=2||complexity==='complex'){model='opus';effort=importance==='critical'?'high':'medium';reasons.push('Vérification indépendante d’un travail important ou transversal : Opus est réservé à ce cas.');}
  else{model='sonnet';effort='medium';reasons.push('Relecture d’un travail ordinaire : Sonnet suffit ; Opus n’apporterait pas un gain proportionné.');}
 }else if(kind==='architecture'){
  model=complexity==='complex'?'opus':'sonnet';effort=complexity==='complex'?'high':'medium';reasons.push(complexity==='complex'?'Architecture complexe : Opus en effort élevé, Fable seulement si Opus échoue.':'Choix d’architecture simple : Sonnet suffit.');
 }else{
  effort=complexity==='complex'?'high':complexity==='simple'?'low':'medium';
  reasons.push(complexity==='complex'?'Travail courant mais complexe : Sonnet en effort élevé avant tout modèle plus coûteux.':complexity==='simple'?'Modification simple : Sonnet en effort faible.':'Travail courant : Sonnet en effort moyen, le réglage par défaut.');
 }
 if(fails>=1&&model!=='none')warnings.push(i.failure_analysed?fails+' tentative(s) déjà échouée(s) : joindre l’analyse de l’échec au dossier.':fails+' tentative(s) déjà échouée(s) sans analyse : ne pas relancer à l’identique.');
 let verification:Advice['verification']=importance==='critical'||kind==='architecture'&&complexity!=='simple'?'tests_then_independent_review':importance==='high'||complexity==='complex'||complexity==='hard'?'tests_then_self_review':'automated_tests';
 if(kind==='mechanical_check')verification='automated_tests';
 if(verification==='tests_then_independent_review')reasons.push('Enjeu critique : tests automatisés d’abord, puis une relecture indépendante (Opus) seulement si les tests passent.');
 const files=i.files_count||0;let cost:Advice['cost_risk']=i.whole_repo||files>15?'high':files>5||complexity==='complex'||complexity==='hard'||model==='opus'||model==='fable'?'medium':'low';
 if(model==='none')cost='low';
 if(i.whole_repo){warnings.push('Relecture de tout le dépôt demandée : très coûteux. Limiter aux fichiers concernés si la modification est localisée.');}
 if(files>15)savings.push('Plus de 15 fichiers cités : découper en plusieurs tâches réduit le contexte de chacune.');
 if(i.has_files===false&&model!=='none')savings.push('Aucun fichier concerné indiqué : les nommer évite à Claude d’explorer le dépôt.');
 if(i.has_tests===false&&model!=='none')savings.push('Aucun test indiqué : donner la commande de test permet à Claude de se vérifier sans nouvelle demande.');
 if(i.has_objective===false)warnings.push('Objectif absent : une demande vague provoque une exploration large.');
 if(i.has_acceptance===false&&model!=='none')savings.push('Critères de réussite absents : les écrire évite les allers-retours.');
 if(model==='opus'||model==='fable')savings.push('Commencer dans une session neuve avec seulement le dossier de travail : un long historique est renvoyé à chaque message.');
 return {model,effort,complexity,importance,verification,cost_risk:cost,reasons,savings,warnings,assumed};
}
export const VERIFICATION_LABEL:Record<Advice['verification'],string>={automated_tests:'Tests automatisés',tests_then_self_review:'Tests automatisés, puis relecture par le même modèle',tests_then_independent_review:'Tests automatisés, puis relecture indépendante'};
export const EFFORT_LABEL:Record<string,string>={low:'faible',medium:'moyen',high:'élevé',xhigh:'très élevé',max:'maximal'};
export const COST_LABEL:Record<Advice['cost_risk'],string>={low:'faible',medium:'moyen',high:'élevé'};
export function adviceLine(a:Advice){return a.model==='none'?'Aucun modèle : test automatisé d’abord':FAMILY_LABEL[a.model]+' · effort '+EFFORT_LABEL[a.effort||'medium'];}

/* ---------- Relevés de quota ---------- */
export const QUOTA_SCOPES=['session_5h','weekly','weekly_model','spend','other'] as const;export type QuotaScope=typeof QUOTA_SCOPES[number];
export const SCOPE_LABEL:Record<QuotaScope,string>={session_5h:'Fenêtre de 5 heures',weekly:'Semaine (tous modèles)',weekly_model:'Semaine (un modèle)',spend:'Crédits d’usage',other:'Autre limite'};
export const SOURCE_LABEL:Record<string,string>={usage_screen:'relevé par vous sur l’écran /usage',statusline_json:'collé depuis la ligne d’état de Claude Code',screenshot:'relevé par vous sur une capture d’écran',declared:'déclaré par vous, sans écran officiel'};
export interface Reading{scope:QuotaScope;model_family:string;used_percent:number|null;resets_at:string|null;observed_at:string;source:string}
/** Lit le JSON que Claude Code envoie à la ligne d'état (champs rate_limits.five_hour / seven_day). Ne complète jamais un champ absent. */
export function parseStatusline(text:string,observedAt:string):{readings:Omit<Reading,'source'>[];model:string|null;cost_usd:number|null;error:string|null}{
 let j:any;try{j=JSON.parse(text);}catch{return {readings:[],model:null,cost_usd:null,error:'Ce texte n’est pas un JSON valide.'};}
 if(!j||typeof j!=='object'||Array.isArray(j))return {readings:[],model:null,cost_usd:null,error:'Ce JSON n’est pas celui de la ligne d’état.'};
 const out:Omit<Reading,'source'>[]=[],rl=j.rate_limits&&typeof j.rate_limits==='object'?j.rate_limits:null;
 const take=(key:string,scope:QuotaScope)=>{const w=rl?.[key];if(!w||typeof w!=='object')return;const p=Number(w.used_percentage);if(!Number.isFinite(p)||p<0||p>100)return;
  const r=Number(w.resets_at);out.push({scope,model_family:'all',used_percent:Math.round(p*10)/10,resets_at:Number.isFinite(r)&&r>0?new Date(r*1000).toISOString():null,observed_at:observedAt});};
 take('five_hour','session_5h');take('seven_day','weekly');take('spend_limit','spend');
 const cost=Number(j.cost?.total_cost_usd);
 return {readings:out,model:typeof j.model?.display_name==='string'?j.model.display_name.slice(0,80):typeof j.model?.id==='string'?j.model.id.slice(0,80):null,cost_usd:Number.isFinite(cost)&&cost>=0?cost:null,
  error:out.length?null:'Ce JSON ne contient aucune limite (rate_limits). Claude Code ne les fournit que pour un abonnement, après la première réponse de la session.'};
}
export interface ReadingState extends Reading{state:'current'|'expired'|'no_reset';label:string}
/** Un relevé dont la fenêtre s'est réinitialisée depuis n'est plus une information : il est marqué périmé, jamais remis à zéro par supposition. */
export function readingState(r:Reading,nowIso:string):ReadingState{
 const state=!r.resets_at?'no_reset':r.resets_at<=nowIso?'expired':'current';
 return {...r,state,label:state==='expired'?'Périmé : la fenêtre s’est réinitialisée depuis ce relevé. La valeur actuelle est inconnue.':state==='no_reset'?'Date de réinitialisation non relevée : on ne sait pas si cette valeur est encore valable.':'Valable jusqu’à la réinitialisation relevée.'};
}
export interface AlertRule{scope:string;model_family:string;threshold:number;enabled:boolean}
export function triggeredAlerts(latest:ReadingState[],rules:AlertRule[]):{scope:string;model_family:string;used_percent:number;threshold:number;text:string}[]{
 const out=[];for(const rule of rules){if(!rule.enabled)continue;const r=latest.find(x=>x.scope===rule.scope&&x.model_family===rule.model_family);
  if(!r||r.state==='expired'||r.used_percent===null||r.used_percent<rule.threshold)continue;
  out.push({scope:r.scope,model_family:r.model_family,used_percent:r.used_percent,threshold:rule.threshold,text:(SCOPE_LABEL[r.scope as QuotaScope]||r.scope)+(r.model_family!=='all'?' · '+(FAMILY_LABEL[r.model_family as Family]||r.model_family):'')+' : '+r.used_percent+' % relevés (seuil '+rule.threshold+' %).'});}
 return out;
}

/* ---------- Retour de travail ---------- */
export const REPORT_SECTIONS:[string,string,RegExp][]=[
 ['changes','Modifications effectuées',/modif|changement|réalis|livr/i],['files_modified','Fichiers modifiés',/fichier/i],['tests_run','Tests réellement exécutés',/test/i],
 ['results','Résultats',/résultat/i],['unresolved','Problèmes non résolus',/non résolu|problème|limite|blocage|reste des/i],['decisions','Décisions prises',/décision/i],['next_steps','Prochaines étapes',/prochain|suite|reste à faire/i]];
export const REPORT_TEMPLATE=REPORT_SECTIONS.map(([,label])=>'## '+label+'\n').join('\n');
/** Découpe la réponse de Claude Code selon les titres demandés dans le dossier. Ce qui n'entre dans aucune rubrique est rendu à part, jamais jeté. */
export function parseWorkReport(text:string):{fields:Record<string,string>;unmatched:string;found:number}{
 const fields:Record<string,string>={};for(const [k] of REPORT_SECTIONS)fields[k]='';
 let current:string|null=null;const rest:string[]=[];let found=0;
 for(const line of String(text||'').replace(/\r\n?/g,'\n').split('\n')){
  const h=line.match(/^\s{0,3}(?:#{1,4}\s+|\*\*)(.+?)(?:\*\*)?\s*:?\s*$/);
  if(h){const title=h[1].replace(/^\d+[.)]\s*/,'');const hit=/fichier/i.test(title)?REPORT_SECTIONS[1]:REPORT_SECTIONS.find(([,,re])=>re.test(title));
   if(hit){current=hit[0];if(!fields[current])found++;continue;}current=null;rest.push(line);continue;}
  if(current)fields[current]+=(fields[current]?'\n':'')+line;else rest.push(line);
 }
 for(const k of Object.keys(fields))fields[k]=fields[k].trim().slice(0,6000);
 return {fields,unmatched:rest.join('\n').trim().slice(0,6000),found};
}

/* ---------- Point de reprise ---------- */
export interface CheckpointInput{title:string;project?:string|null;objective:string;done:string;remaining:string;decisions:string;files_modified:string;errors:string;tests:string;next_action:string;updated_at?:string}
export function checkpointText(c:CheckpointInput):string{
 const o=['# Point de reprise — '+c.title];if(c.project)o.push('Projet : '+c.project);if(c.updated_at)o.push('État au : '+c.updated_at);
 const part=(t:string,v:string,empty:string)=>{o.push('','## '+t,v.trim()||empty);};
 part('Objectif',c.objective,'(non renseigné)');part('Terminé',c.done,'(rien de noté)');part('Reste à faire',c.remaining,'(rien de noté)');
 part('Décisions importantes',c.decisions,'(aucune notée)');part('Fichiers modifiés',c.files_modified,'(aucun noté)');part('Erreurs rencontrées',c.errors,'(aucune notée)');
 part('Tests effectués',c.tests,'(aucun noté : ne rien supposer testé)');part('Prochaine action exacte',c.next_action,'(à préciser avant de reprendre)');
 o.push('','## Règle de reprise','Repartir de cet état dans une session neuve. Ne pas relire l’ancienne conversation ni tout le dépôt : seulement les fichiers cités. Ce qui n’est pas écrit ici n’est pas acquis.');
 return o.join('\n');
}
export function checkpointGaps(c:CheckpointInput):string[]{const g=[];if(!c.objective.trim())g.push('objectif');if(!c.next_action.trim())g.push('prochaine action exacte');if(!c.done.trim()&&!c.remaining.trim())g.push('ce qui est terminé ou ce qui reste');return g;}
