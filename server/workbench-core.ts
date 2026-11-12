/* Règles pures du poste de pilotage : questions dédupliquées, progression explicable, synthèse de reprise, consigne de développement. */
import {STATUS_LABEL,OWNER_LABEL} from './plan-core.ts';
export const CONVERSATION_CATEGORIES=['Vision','Fonctionnalités','UX/UI','Règles métier','Architecture','Développement','Bugs','Audits/Tests','Décisions','Planification','Questions','Autre'] as const;
export const CONVERSATION_STATUS:Record<string,string>={active:'Active',to_resume:'À reprendre',waiting:'En attente',archived:'Archivée'};
export const RELIABILITY:Record<string,string>={user_confirmed:'Confirmé par vous',verified:'Vérifié directement',reported:'Rapporté, non reproduit',deduced:'Déduit',ai_proposed:'Proposé par une IA',to_confirm:'À confirmer',superseded:'Remplacé ou obsolète',unverified:'Non vérifié'};
export const ACTION_KIND:Record<string,string>={provide:'Fournir',test:'Tester',answer:'Répondre',choose:'Choisir',validate:'Valider',confirm:'Confirmer',authorize:'Autoriser',other:'Autre'};

/** Clé de déduplication d'une question : sans accents, casse, ponctuation ni mots vides. */
const STOP=new Set(['le','la','les','un','une','des','de','du','d','l','et','ou','a','au','aux','en','est','ce','que','qu','qui','pour','dans','sur','faut','il','on','je','tu','vous','nous','quel','quelle','quels','quelles','doit','t']);
export function questionKey(text:string):string{
 return String(text||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').split(' ').filter(w=>w&&!STOP.has(w)).join(' ').slice(0,300);
}
const csvCell=(v:unknown)=>{const s=String(v??'');return /[",\n;]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
export function questionsCsv(rows:{id:string;project:string;theme:string;question:string;status:string;answer:string;answered_at:string|null}[]):string{
 return [['id','projet','theme','question','statut','reponse','repondu_le'],...rows.map(r=>[r.id,r.project,r.theme,r.question,r.status,r.answer,r.answered_at||''])].map(l=>l.map(csvCell).join(',')).join('\n')+'\n';
}
export function answerText(answer:any,options:{label:string}[]):string{
 if(!answer)return '';
 const parts:string[]=[];
 if(Array.isArray(answer.selected))for(const i of answer.selected)if(options[i])parts.push(options[i].label);
 if(answer.text)parts.push(String(answer.text));
 if(answer.unknown)parts.push('Je ne sais pas');
 return parts.join(' ; ');
}

/** Progression explicable : seules les tâches principales (sans parent) non abandonnées comptent ; trois mesures distinctes. */
export interface ProgressTask{status:string;proof?:string|null;validated_at?:string|null;parent_id?:string|null}
export function progressDetail(tasks:ProgressTask[]){
 const main=tasks.filter(t=>!t.parent_id&&t.status!=='abandoned');
 const done=main.filter(t=>t.status==='done');
 const proved=done.filter(t=>String(t.proof||'').trim());
 const validated=proved.filter(t=>t.validated_at);
 const pct=(n:number)=>main.length?Math.round(n*100/main.length):0;
 return {total:main.length,done:done.length,proved:proved.length,validated:validated.length,
  blocked:main.filter(t=>t.status==='blocked').length,in_progress:main.filter(t=>t.status==='in_progress').length,to_verify:main.filter(t=>t.status==='to_verify').length,
  percent_done:pct(done.length),percent_proved:pct(proved.length),percent_validated:pct(validated.length),
  formula:'Tâches principales non abandonnées. Terminé = statut « Terminé » ; vérifié = terminé avec une preuve ; validé = vérifié puis confirmé par vous. Les sous-tâches et les tâches bloquées ne comptent pas comme terminées.'};
}

export interface ResumeInput{
 project:string;objective:string;state:string;phase:string|null;generatedAt:string;
 repositories:{full_name:string;branch:string;head_sha:string;verified:boolean}[];
 progress:ReturnType<typeof progressDetail>;
 decisions:{id:string;title:string;status:string;source_ref:string}[];
 questions:{id:string;question:string}[];actions:{id:string;title:string;blocking:boolean}[];
 tasks:{id:string;title:string;status:string;owner:string;next_action:string;blocking_question:string}[];
 nextAction:{title:string;do:string}|null;documents:{title:string;doc_type:string;reliability:string}[];
}
/** Synthèse de reprise : assemblée seulement à partir d'objets enregistrés ; chaque ligne porte son identifiant source. */
export function resumeText(i:ResumeInput):string{
 const o:string[]=[];
 o.push('# Reprise du projet — '+i.project,'Générée le '+i.generatedAt+' à partir des données enregistrées dans Atelier (aucun résumé IA).','');
 o.push('## État','- État global : '+i.state,'- Objectif : '+(i.objective||'non renseigné'),'- Phase en cours : '+(i.phase||'aucune'),
  '- Avancement : '+i.progress.done+'/'+i.progress.total+' tâches terminées, '+i.progress.proved+' vérifiées (preuve), '+i.progress.validated+' validées par Martin','');
 o.push('## Dépôts');if(!i.repositories.length)o.push('- aucun dépôt associé');
 for(const r of i.repositories)o.push('- '+r.full_name+' · branche '+r.branch+' · dernier commit lu '+r.head_sha+(r.verified?'':' (non vérifié)'));
 o.push('','## Décisions applicables');
 const valid=i.decisions.filter(d=>d.status==='validated');if(!valid.length)o.push('- aucune décision validée');
 for(const d of valid)o.push('- '+d.title+(d.source_ref?' — source : '+d.source_ref:'')+' [décision '+d.id.slice(0,8)+']');
 const proposed=i.decisions.filter(d=>d.status==='proposed');
 if(proposed.length){o.push('','## Propositions non validées (ne pas les traiter comme des décisions)');for(const d of proposed)o.push('- '+d.title+' [décision '+d.id.slice(0,8)+']');}
 o.push('','## Questions ouvertes');if(!i.questions.length)o.push('- aucune');for(const q of i.questions)o.push('- '+q.question+' [question '+q.id.slice(0,8)+']');
 o.push('','## À faire par Martin');if(!i.actions.length)o.push('- rien');for(const a of i.actions)o.push('- '+a.title+(a.blocking?' (bloquant)':'')+' [action '+a.id.slice(0,8)+']');
 o.push('','## Tâches en cours, bloquées ou à vérifier');
 const live=i.tasks.filter(t=>['in_progress','blocked','to_verify','waiting'].includes(t.status));if(!live.length)o.push('- aucune');
 for(const t of live)o.push('- '+t.title+' — '+(STATUS_LABEL[t.status as keyof typeof STATUS_LABEL]||t.status)+', '+(OWNER_LABEL[t.owner]||t.owner)+(t.blocking_question?' — question : '+t.blocking_question:'')+(t.next_action?' — prochaine action : '+t.next_action:'')+' [tâche '+t.id.slice(0,8)+']');
 o.push('','## Prochaine action',i.nextAction?'- '+i.nextAction.title+' : '+i.nextAction.do:'- aucune action proposée');
 if(i.documents.length){o.push('','## Documents de référence');for(const d of i.documents)o.push('- '+d.title+' ('+d.doc_type+', '+(RELIABILITY[d.reliability]||d.reliability)+')');}
 o.push('','## Inconnues','- Tout ce qui n’est pas listé ci-dessus n’est pas enregistré dans Atelier : ne pas le supposer.');
 return o.join('\n');
}

export interface DevPromptInput{
 project:string;task:{title:string;objective:string;acceptance:string;context:string;files_hint:string;tests:string;risks:string;next_action:string;owner:string};
 repository:{full_name:string;branch:string;head_sha:string;verified:boolean}|null;
 decisions:{title:string;source_ref:string}[];dependencies:{title:string;status:string}[];
}
/** Consigne de développement autonome : jamais de date d'envoi, de modèle, de quota ni de preuve inventés. */
export function devPrompt(i:DevPromptInput):string{
 const t=i.task,o:string[]=[];
 o.push('# Mission — '+t.title,'','Projet : '+i.project,'');
 o.push('## Objectif',t.objective||'(à préciser avant transmission)','');
 if(t.context)o.push('## Contexte',t.context,'');
 o.push('## Dépôt et référence');
 if(i.repository)o.push('- Dépôt : '+i.repository.full_name,'- Branche : '+i.repository.branch,'- SHA de référence : '+i.repository.head_sha+(i.repository.verified?'':' (non vérifié : le confirmer avant de commencer)'));
 else o.push('- Aucun dépôt associé dans Atelier : demander le dépôt exact avant de commencer.');
 o.push('');
 if(i.decisions.length){o.push('## Décisions à respecter');for(const d of i.decisions)o.push('- '+d.title+(d.source_ref?' (source : '+d.source_ref+')':''));o.push('');}
 if(i.dependencies.length){o.push('## Dépendances');for(const d of i.dependencies)o.push('- '+d.title+' — '+(STATUS_LABEL[d.status as keyof typeof STATUS_LABEL]||d.status));o.push('');}
 if(t.files_hint)o.push('## Fichiers et fonctions concernés',t.files_hint,'');
 o.push('## Critères d’acceptation',t.acceptance||'(à préciser avant transmission)','');
 o.push('## Tests demandés',t.tests||'Tests ciblés du changement, puis la suite existante du dépôt. Indiquer les commandes réellement exécutées et leurs résultats.','');
 if(t.risks)o.push('## Risques',t.risks,'');
 o.push('## Règles','- Vérifier d’abord le dépôt, la branche et le SHA.','- Aucun secret dans le code, les journaux ou la PR.','- Ne jamais dire testé ce qui n’a pas été exécuté ; séparer test simulé, test réel et non vérifié.','- Une branche et une PR ; aucune fusion sans accord explicite de Martin.','');
 o.push('## Retour attendu','Résumé, branche, commit, PR, tests exécutés avec résultats, limites et ce qui reste à faire.');
 return o.join('\n');
}
