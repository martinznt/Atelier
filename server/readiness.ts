import type {Env} from './types.ts';

type Level='ok'|'error';
type Diagnostic={id:string;label:string;status:Level;detail:string};
const required=['users','sessions','projects','connections','tasks','repositories','file_contents','review_configs','review_runs'] as const;

/**
 * Diagnostic local et en lecture seule. Aucune clé, donnée utilisateur ou
 * information sur les comptes d'un autre utilisateur n'est renvoyée.
 * Ne contacte ni GitHub, ni un modèle IA, ni un service payant.
 */
export async function inspectAtelierReadiness(env:Env):Promise<{ready:boolean;checks:Diagnostic[]}>{
 const checks:Diagnostic[]=[];
 const add=(id:string,label:string,ok:boolean,detail:string)=>
  checks.push({id,label,status:ok?'ok':'error',detail});
 let validKey=false;
 try{
  const key=env.MASTER_KEY||'';
  // Validation de format seulement : aucun déchiffrement de secret utilisateur.
  const bytes=atob(key);
  validKey=bytes.length===32 && /^[A-Za-z0-9+/]{43}=$/.test(key);
 }catch{/* secret absent ou invalide */}
 add('master-key','Chiffrement des connexions',validKey,validKey
  ?'Le secret serveur existe et son format est valide.'
  :'MASTER_KEY est absent ou ne correspond pas à une clé Base64 de 32 octets. Conservez une clé existante avant toute modification.');
 let validOrigin=false;
 try{
  const u=new URL(env.APP_ORIGIN);
  validOrigin=u.protocol==='https:'&&u.origin===env.APP_ORIGIN&&!u.username&&!u.password;
 }catch{}
 add('origin','Adresse publique',validOrigin,validOrigin
  ?'L’adresse HTTPS officielle est configurée.'
  :'APP_ORIGIN doit être l’origine HTTPS exacte de ce site, sans barre finale.');
 const queue=!!env.TASKS&&typeof env.TASKS.send==='function';
 add('queue','Tâches en arrière-plan',queue,queue
  ?'Binding TASKS présent (l’exécution distante reste à tester).'
  :'Binding de file TASKS indisponible ; les tâches IA et revues de PR ne pourront pas démarrer.');
 const assets=!!env.ASSETS&&typeof env.ASSETS.fetch==='function';
 add('assets','Interface web',assets,assets
  ?'Binding ASSETS présent.'
  :'Binding ASSETS indisponible : l’interface pourrait ne pas charger.');
 try{
  const rows=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users','sessions','projects','connections','tasks','repositories','file_contents','review_configs','review_runs')").all<{name:string}>();
  const found=new Set(rows.results.map(row=>row.name));
  const missing=required.filter(name=>!found.has(name));
  add('database','Base de données D1',missing.length===0,missing.length===0
   ?'Les tables indispensables sont présentes.'
   :'Tables manquantes : '+missing.join(', ')+'. Sauvegarder D1, puis vérifier les migrations existantes sans réinitialiser la base.');
  if(found.has('review_configs')){
   const columns=await env.DB.prepare('PRAGMA table_info(review_configs)').all<{name:string}>();
   const hasLimit=columns.results.some(c=>c.name==='daily_limit');
   add('review-migration','Plafonds des revues IA',hasLimit,hasLimit
    ?'La colonne daily_limit est présente.'
    :'La migration 0009_review_daily_limit.sql manque probablement. Ne pas supprimer la base.');
  }else add('review-migration','Plafonds des revues IA',false,'Appliquer les migrations additives 0008 et 0009 après sauvegarde de D1.');
  if(found.has('review_runs')){
   const runColumns=await env.DB.prepare('PRAGMA table_info(review_runs)').all<{name:string}>();
   const hasDiagnostic=runColumns.results.some(c=>c.name==='diagnostic')&&runColumns.results.some(c=>c.name==='stage');
   add('review-diagnostics','Diagnostic des revues IA',hasDiagnostic,hasDiagnostic
    ?'Les colonnes de diagnostic (migration 0010) sont présentes.'
    :'La migration 0010_review_diagnostics.sql manque. Elle est additive : l’appliquer après sauvegarde de D1, sans supprimer la base.');
   const hasRelay=runColumns.results.some(c=>c.name==='resume_at')&&runColumns.results.some(c=>c.name==='resume_state');
   add('ai-relay','Relais et reprise automatique des IA',hasRelay,hasRelay
    ?'Les colonnes de reprise (migration 0013) sont présentes.'
    :'La migration 0013_ai_relay.sql manque. Elle est additive : l’appliquer après sauvegarde de D1, sans supprimer la base. Sans elle, le relais fonctionne mais la reprise automatique est désactivée.');
  }
 }catch{
  add('database','Base de données D1',false,'Impossible de lire la structure D1. Vérifier le binding DB et les migrations dans Cloudflare.');
  add('review-migration','Plafonds des revues IA',false,'État des migrations inconnu tant que D1 est inaccessible.');
 }
 return {ready:checks.every(c=>c.status==='ok'),checks};
}
