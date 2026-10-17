import {vault} from './vault';
import {createApiClient} from './transport';
import {sessionScope} from './session';
export {ApiError} from './transport';
const client=createApiClient({cache:vault,scope:sessionScope,online:()=>navigator.onLine,onExpired:()=>window.dispatchEvent(new Event('atelier:session-expired'))});
export const api=client.api;
export const apiBlob=client.blob;
export const post=(path:string,data:unknown)=>api(path,{method:'POST',body:JSON.stringify(data)});
export const patch=(path:string,data:unknown)=>api(path,{method:'PATCH',body:JSON.stringify(data)});
export const remove=(path:string,data?:unknown)=>api(path,{method:'DELETE',body:data?JSON.stringify(data):undefined});
export async function download(path:string,name:string,init?:RequestInit){saveBlob(await client.blob(path,init),name);}
export function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export const bytes=(value:number)=>value<1024?`${value} o`:value<1048576?`${(value/1024).toFixed(1)} Ko`:`${(value/1048576).toFixed(1)} Mo`;
export const date=(value:string)=>new Date(value).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'});
export const statusLabel:Record<string,string>={queued:'En attente',running:'En cours',completed:'Terminée',interrupted:'À reprendre',cancelled:'Arrêtée',quota:'Limite atteinte',connected:'Connecté',untested:'À tester',expired:'Accès expiré',error:'Erreur',draft:'Brouillon',incomplete:'Incomplet',final:'Final',ready:'Prêt',success:'Réussi',failure:'Échec',pending:'En attente',building:'Construction en cours'};
