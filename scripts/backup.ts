import {cp,mkdir,readdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {createHash} from 'node:crypto';import {readFile} from 'node:fs/promises';
// Stop wrangler dev first. A local snapshot is not a managed-cloud backup.
if(!process.argv.includes('--stopped'))throw new Error('Arrêtez Wrangler, puis lancez npm run backup:local -- --stopped.');
const destination=resolve('backups',new Date().toISOString().replace(/[:.]/g,'-'));
await mkdir(destination,{recursive:true});await cp('.wrangler/state',`${destination}/state`,{recursive:true,errorOnExist:true,force:false});
const manifest:Record<string,string>={};for(const entry of await readdir(`${destination}/state`,{recursive:true,withFileTypes:true})){if(entry.isFile()){const path=`${entry.parentPath}/${entry.name}`;manifest[path.slice(destination.length+1)]=createHash('sha256').update(await readFile(path)).digest('hex');}}
await writeFile(`${destination}/integrite.json`,JSON.stringify(manifest,null,2));console.log(`Sauvegarde locale : ${destination}. Conservez MASTER_KEY séparément dans un coffre sécurisé.`);
