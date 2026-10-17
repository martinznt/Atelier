import {existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

/** Local readiness only: presence of a credential never proves remote permissions. */
export function inspectDeployment({config,hasDependencies,hasBuild,hasToken,hasAccount}) {
 const checks=[];
 const check=(id,ok,detail)=>checks.push({id,ok:!!ok,detail});
 check('dependencies',hasDependencies,'Installer les dépendances, puis compiler et exécuter les tests.');
 check('build',hasBuild,'Produire le bundle React/PWA et le Worker ; sa présence ne prouve pas sa validation.');
 check('cloudflare-token',hasToken,'Configurer CLOUDFLARE_API_TOKEN dans les secrets de l’environnement. Ne jamais le coller dans le dépôt ou les logs.');
 check('cloudflare-account',hasAccount,'Configurer CLOUDFLARE_ACCOUNT_ID pour le compte de déploiement choisi.');
 check('configuration',config,'Préparer wrangler.production.jsonc à partir de l’exemple, avec les ressources réelles.');
 if(config){
  const db=config.d1_databases?.find(x=>x.binding==='DB');
  check('database',db?.database_id&&db.database_id!=='00000000-0000-0000-0000-000000000000','Renseigner l’identifiant D1 réellement retourné par Cloudflare.');
  check('files',config.r2_buckets?.some(x=>x.binding==='FILES'&&x.bucket_name),'Déclarer FILES sur le bucket R2 privé.');
  const queue=config.queues?.producers?.find(x=>x.binding==='TASKS');
  check('tasks',queue?.queue&&config.queues?.consumers?.some(x=>x.queue===queue.queue),'Déclarer TASKS et son consommateur sur la même Queue.');
  check('maintenance',config.triggers?.crons?.length,'Conserver le planificateur de reprise et suppression des comptes.');
  let https=false;
  try{const u=new URL(config.vars?.APP_ORIGIN);https=u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&u.origin===config.vars.APP_ORIGIN&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname);}catch{}
  check('https-origin',https,'Renseigner APP_ORIGIN avec l’origine HTTPS exacte, sans chemin ni slash final.');
  check('route',config.workers_dev===true||config.routes?.length||config.route,'Déclarer la route de publication ou activer explicitement workers_dev.');
  check('no-plaintext-key',!config.vars?.MASTER_KEY,'MASTER_KEY doit rester un secret serveur, jamais une variable dans la configuration.');
  check('no-sites-identity',config.vars?.SITES_AUTHENTICATION!=='true','Ne pas accepter l’identité Sites sur un Worker Cloudflare autonome.');
 }
 return checks;
}

export function main(){
 const file='wrangler.production.jsonc';let config=null;
 if(existsSync(file)){
  try{config=JSON.parse(readFileSync(file,'utf8'));}
  catch{console.error('Ce contrôle local lit une copie JSON sans commentaires, comme l’exemple du dépôt. Le format JSONC complet sera contrôlé par Wrangler.');process.exitCode=1;return;}
 }
 const checks=inspectDeployment({config,hasDependencies:existsSync('node_modules/.bin/tsc')&&existsSync('node_modules/.bin/wrangler'),hasBuild:existsSync('dist/index.html')&&existsSync('dist/sw.js')&&existsSync('dist-worker/index.js'),hasToken:!!process.env.CLOUDFLARE_API_TOKEN,hasAccount:!!process.env.CLOUDFLARE_ACCOUNT_ID});
 console.log('Préparation locale uniquement. Aucun accès distant ni déploiement effectué.');
 for(const item of checks)console.log(`${item.ok?'PRÉSENT':'MANQUANT'} · ${item.id} · ${item.detail}`);
 console.log('Restent à vérifier réellement : droits Cloudflare, ressources, secret MASTER_KEY, CPU/coûts, migrations, tests intégrés et navigateur.');
 if(checks.some(item=>!item.ok))process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
