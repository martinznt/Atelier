import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function assertProductionBranch(branch){
 if(branch!=='main')throw new Error('Publication et migrations de production réservées à main. Cette branche sert à la vérification ; aucune migration distante ni publication n’a été lancée.');
}
export function deploymentBranch(directory=process.cwd(),environment=process.env){
 if(environment.WORKERS_CI_BRANCH)return environment.WORKERS_CI_BRANCH;
 if(environment.GITHUB_REF_NAME)return environment.GITHUB_REF_NAME;
 try{return readFileSync(resolve(directory,'.git/HEAD'),'utf8').trim().replace(/^ref: refs\/heads\//,'');}catch{return null;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{assertProductionBranch(deploymentBranch());}catch(error){console.error(error.message);process.exitCode=1;}
}
