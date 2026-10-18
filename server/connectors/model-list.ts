type CataloguePage={data:Record<string,any>;quota:unknown};
type ReadPage=(path:string)=>Promise<CataloguePage>;

/** Official catalogue endpoints only; never returns a silently truncated list. */
export async function listModels(provider:string,readPage:ReadPage):Promise<{models:string[];quota:unknown}> {
 if(!['openai','anthropic','gemini'].includes(provider))throw new Error('Catalogue non pris en charge.');
 const initial=provider==='openai'?'/v1/models':provider==='anthropic'?'/v1/models?limit=100':'/v1beta/models?pageSize=1000';
 let path=initial,count=0;
 const models=new Set<string>(),cursors=new Set<string>();
 for(let page=0;page<10;page++){
  const result=await readPage(path),data=result.data;
  if(!data||typeof data!=='object')throw new Error('Catalogue fournisseur invalide.');
  if(provider==='anthropic'&&typeof data.has_more!=='boolean')throw new Error('Pagination fournisseur invalide ; la liste précédente est conservée.');
  const entries=provider==='gemini'?(data.models??[]):data.data;
  if(!Array.isArray(entries))throw new Error('Catalogue fournisseur invalide.');
  count+=entries.length;
  if(count>5000)throw new Error('Catalogue trop volumineux ; la liste précédente est conservée.');
  for(const entry of entries){
   if(!entry||typeof entry!=='object')throw new Error('Modèle fournisseur invalide.');
   if(provider==='anthropic'&&entry.lifecycle==='retired')continue;
   if(provider==='gemini'&&(!Array.isArray(entry.supportedGenerationMethods)||!entry.supportedGenerationMethods.includes('generateContent')))continue;
   const id=provider==='gemini'&&typeof entry.name==='string'?entry.name.replace(/^models\//,''):entry.id;
   if(typeof id!=='string'||!id.trim()||id.length>160)throw new Error('Identifiant de modèle fournisseur invalide.');
   models.add(id);
  }
  let cursor:unknown;
  if(provider==='anthropic'&&data.has_more===true)cursor=data.last_id;
  else if(provider==='gemini')cursor=data.nextPageToken;
  else if(provider==='openai')return {models:[...models].sort(),quota:result.quota};
  if((provider==='anthropic'&&data.has_more!==true)||(provider==='gemini'&&(cursor===undefined||cursor==='')))return {models:[...models].sort(),quota:result.quota};
  if(typeof cursor!=='string'||!cursor||cursor.length>4096||cursors.has(cursor))throw new Error('Pagination fournisseur invalide ; la liste précédente est conservée.');
  cursors.add(cursor);
  path=initial+(provider==='anthropic'?'&after_id=':'&pageToken=')+encodeURIComponent(cursor);
 }
 throw new Error('Catalogue incomplet après dix pages ; la liste précédente est conservée.');
}
