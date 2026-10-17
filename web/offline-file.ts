import type {createSessionScope} from './session.ts';
import type {createVault} from './vault-store.ts';

type FileReference={id:string;current_version:number;size:number;sha256:string};
type Dependencies={
 cache:Pick<ReturnType<typeof createVault>,'user'|'epoch'|'unlocked'|'putFile'|'getFile'>;
 scope:ReturnType<typeof createSessionScope>;
 load:(path:string)=>Promise<Blob>;
};
async function sha256(blob:Blob){
 const buffer=await blob.arrayBuffer();
 return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(b=>b.toString(16).padStart(2,'0')).join('');
}

/** A download belongs to the identity which requested it, including the time
 * spent receiving, hashing, encrypting and checking the local copy. */
export async function retainOfflineFile(file:FileReference,{cache,scope,load}:Dependencies){
 const session=scope.snapshot(),epoch=cache.epoch,owner=cache.user;
 if(!cache.unlocked||!owner||owner!==session.owner)throw new Error('Déverrouillez votre appareil de confiance dans Réglages.');
 const assertCurrent=()=>{
  if(!scope.current(session)||cache.epoch!==epoch||cache.user!==owner)throw new Error('Le compte a changé ou le coffre a été verrouillé. Le téléchargement a été interrompu.');
 };
 const blob=await load(`/files/${file.id}/download?version=${file.current_version}`);assertCurrent();
 const hash=await sha256(blob);assertCurrent();
 if(blob.size!==file.size||hash!==file.sha256)throw new Error('L’intégrité du fichier ne correspond pas. Rien n’a été mis hors connexion.');
 const id=`${file.id}:v${file.current_version}`;
 await cache.putFile(id,blob);assertCurrent();
 const saved=await cache.getFile(id);assertCurrent();
 if(!saved||saved.size!==file.size)throw new Error('Vérification de la copie locale impossible.');
 const savedHash=await sha256(saved);assertCurrent();
 if(savedHash!==file.sha256)throw new Error('La copie locale est endommagée. Téléchargez à nouveau ce fichier.');
}
