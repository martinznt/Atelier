// Persistence without provider or HTTP dependencies; also exercised on real SQLite.
export const MAX_TEXT_BYTES = 262144;
export const DEFAULT_STORAGE_BYTES = 20 * 1048576;
export const SHARED_STORAGE_BYTES = 100 * 1048576;
export class StorageError extends Error {
 status:404|409|413|422;
 constructor(status:404|409|413|422,message:string){super(message);this.status=status;}
}
export function storedText(bytes:Uint8Array):string {
 if(bytes.byteLength>MAX_TEXT_BYTES)throw new StorageError(413,'Le stockage texte intégré est limité à 256 Kio par version. Conservez ce fichier sur GitHub ou sur votre appareil. Aucune version existante n’a été supprimée.');
 let text:string;
 try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);}catch{throw new StorageError(422,'Ce fichier binaire doit être conservé dans GitHub ou sur votre appareil. Le stockage intégré accepte les petits fichiers UTF-8, dont JSON et SVG.');}
 if(text.includes('\0'))throw new StorageError(422,'Ce contenu binaire ne peut pas être enregistré comme texte. Utilisez GitHub ou le stockage local.');
 return text;
}
export async function persistTextVersion(DB:D1Database,d:{user:string;file:string;expected:number;id:string;content:string;size:number;sha:string;state:string;date:string;quota:number}) {
 if(!Number.isSafeInteger(d.expected)||d.expected<0)throw new StorageError(409,'Version attendue invalide.');
 const result=await DB.batch([
  DB.prepare(`INSERT INTO file_versions(id,file_id,user_id,version,size,sha256,object_key,state,created_at)
   SELECT ?,f.id,f.user_id,?,?,?, ?,?,? FROM files f JOIN users u ON u.id=f.user_id
   WHERE f.id=? AND f.user_id=? AND f.current_version=? AND u.deleted_at IS NULL
   AND COALESCE((SELECT bytes FROM file_storage_usage WHERE user_id=?),0)+?<=?`).bind(d.id,d.expected+1,d.size,d.sha,`d1:${d.id}`,d.state,d.date,d.file,d.user,d.expected,d.user,d.size,d.quota),
  DB.prepare('INSERT INTO file_contents(version_id,user_id,content,bytes) SELECT id,user_id,?,size FROM file_versions WHERE id=? AND user_id=?').bind(d.content,d.id,d.user),
  DB.prepare('UPDATE files SET current_version=current_version+1,updated_at=? WHERE id=? AND user_id=? AND current_version=? AND EXISTS(SELECT 1 FROM file_contents WHERE version_id=?)').bind(d.date,d.file,d.user,d.expected,d.id)
 ]).catch(error=>{
  if(String(error).includes('file_storage_full'))throw new StorageError(413,'Le stockage texte partagé est plein. Exportez puis supprimez explicitement des fichiers, ou utilisez GitHub. Aucun historique n’a été effacé.');
  throw error;
 });
 if(result[0].meta.changes)return;
 const file=await DB.prepare('SELECT current_version FROM files WHERE id=? AND user_id=?').bind(d.file,d.user).first<{current_version:number}>();
 if(!file)throw new StorageError(404,'Fichier introuvable.');
 if(file.current_version!==d.expected)throw new StorageError(409,'Une autre version a été enregistrée. Rechargez et comparez ; votre contenu n’a pas remplacé cette version.');
 throw new StorageError(413,'Votre espace de textes est plein. Exportez puis supprimez explicitement des fichiers, ou enregistrez-les sur GitHub. Aucune version n’a été supprimée.');
}
export async function readTextVersion(DB:D1Database,user:string,versionId:string) {
 const row=await DB.prepare('SELECT c.content FROM file_contents c JOIN file_versions v ON v.id=c.version_id JOIN files f ON f.id=v.file_id WHERE c.version_id=? AND c.user_id=? AND v.user_id=? AND f.user_id=?').bind(versionId,user,user,user).first<{content:string}>();
 if(!row)throw new StorageError(404,'Le contenu de cette ancienne version n’est pas disponible dans le stockage actuel. Sa référence et son historique sont conservés. Importez une copie ou une sauvegarde pour la récupérer.');
 return row.content;
}
