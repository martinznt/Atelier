import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectConfiguration} from './deploy-check.mjs';

/** Configuration only: no request, resource creation, migration or deployment. */
export function productionConfiguration(source,{databaseId,origin,accountId}={}) {
 const config=structuredClone(source);
 // Remove the obsolete binding even from an existing private production copy.
 delete config.r2_buckets;
 config.vars={...config.vars,STORAGE_LIMIT_MB:'20',MAX_FILE_MB:'0.25'};
 const database=config.d1_databases?.find(binding=>binding.binding==='DB');
 if(!database)throw new Error('Le binding D1 DB manque dans la configuration.');
 if(databaseId!==undefined)database.database_id=databaseId.trim();
 config.vars={...config.vars};
 if(origin!==undefined)config.vars.APP_ORIGIN=origin.trim();
 if(accountId!==undefined){
  if(!/^[0-9a-f]{32}$/i.test(accountId.trim()))throw new Error('CLOUDFLARE_ACCOUNT_ID doit être l’identifiant réel du compte Cloudflare.');
  config.account_id=accountId.trim();
 }
 let url;
 try{url=new URL(config.vars.APP_ORIGIN);}catch{}
 if(url?.hostname.endsWith('.workers.dev')){
  if(!url.hostname.startsWith(`${config.name}.`)||url.hostname.split('.').length!==4||url.port)throw new Error('L’adresse workers.dev doit correspondre au Worker Atelier et au sous-domaine réel de votre compte.');
  config.workers_dev=true;
 }
 const errors=inspectConfiguration(config).filter(check=>!check.ok);
 if(errors.length)throw new Error('Configuration de production incomplète :\n'+errors.map(check=>`- ${check.detail}`).join('\n')+'\nComplétez cloudflare.production.json ou les variables de build ATELIER_D1_DATABASE_ID / ATELIER_PUBLIC_ORIGIN. Aucun déploiement n’a été lancé.');
 return config;
}

export function prepareConfiguration({directory=process.cwd(),environment=process.env}={}){
 const target=resolve(directory,'wrangler.production.jsonc');
 const existing=existsSync(target);
 const source=JSON.parse(readFileSync(existing?target:resolve(directory,'wrangler.jsonc'),'utf8'));
 const settingsPath=resolve(directory,'cloudflare.production.json');
 const settings=existsSync(settingsPath)?JSON.parse(readFileSync(settingsPath,'utf8')):{};
 if(!settings||Array.isArray(settings)||typeof settings!=='object'||Object.entries(settings).some(([key,value])=>!['databaseId','origin','accountId'].includes(key)||(value!==null&&typeof value!=='string'))){
  throw new Error('cloudflare.production.json accepte seulement databaseId, accountId et origin (texte ou null). Aucun secret ne doit y figurer.');
 }
 // Explicit environment overrides win. An existing private production copy is
 // preserved; tracked non-secret settings initialize a fresh build checkout.
 const defaults=existing?{}:settings;
 const config=productionConfiguration(source,{
  databaseId:environment.ATELIER_D1_DATABASE_ID??defaults.databaseId??undefined,
  origin:environment.ATELIER_PUBLIC_ORIGIN??defaults.origin??undefined,
  accountId:environment.CLOUDFLARE_ACCOUNT_ID??defaults.accountId??undefined,
 });
 // Validate everything before touching an existing file or starting migrations.
 writeFileSync(target,JSON.stringify(config,null,2)+'\n',{mode:0o600});
 return config;
}

export function main(){
 try{
  prepareConfiguration();
  console.log('Configuration de production préparée. Aucun service créé ni déploiement lancé.');
  console.log('Les droits, l’existence des ressources et le secret serveur doivent être vérifiés auprès de Cloudflare.');
 }catch(error){console.error(error instanceof SyntaxError?'La configuration doit être du JSON valide, comme l’exemple du dépôt.':error.message);process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main();
