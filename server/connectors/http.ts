export function providerErrorMessage(status:number,code:string):string {
 if(code==='timeout')return 'Le fournisseur n’a pas répondu dans le délai du test. Aucun appel n’a été relancé automatiquement ; vérifiez son état avant de retester.';
 if(code==='redirect')return 'Le fournisseur a demandé une redirection HTTP ('+status+'). Atelier ne la suit pas, pour ne jamais transmettre votre jeton à une autre adresse.';
 if(code==='network')return 'Le serveur Atelier ne parvient pas à joindre le fournisseur (réseau ou délai dépassé). La connexion enregistrée est conservée ; consultez le diagnostic avant un nouvel essai.';
 if(status===401||status===403)return 'Le fournisseur refuse cet accès (HTTP '+status+'). Vérifiez que le jeton est valide et autorisé pour le dépôt ; ne lui donnez pas de droits d’écriture supplémentaires.';
 if(status===429)return 'Le fournisseur indique une limite temporaire (HTTP 429). N’insistez pas : vérifiez les quotas avant une nouvelle tentative.';
 if(status===404)return 'Le fournisseur ne trouve pas la ressource demandée (HTTP 404). Vérifiez le dépôt ou le point d’accès, sans recréer votre jeton.';
 if(status===409||status===422)return 'Le contenu distant a changé ou la demande est incompatible (HTTP '+status+'). Rechargez les données.';
 if(status>=500)return 'Le service distant ou sa passerelle a échoué (HTTP '+status+'). L’accès enregistré est conservé. Consultez l’état du fournisseur avant de réessayer.';
 return 'Le fournisseur a refusé la demande (HTTP '+status+'). L’accès enregistré est conservé ; vérifiez les détails avant de réessayer.';
}
export class ProviderError extends Error {
 readonly status:number;
 readonly code:string;
 readonly retryAfter:string|null;
 constructor(status:number,code:string,retryAfter:string|null=null){
  super(providerErrorMessage(status,code));
  this.status=status;
  this.code=code;
  this.retryAfter=retryAfter;
 }
}
export const origins:Record<string,string>={github:'https://api.github.com',openai:'https://api.openai.com',anthropic:'https://api.anthropic.com',gemini:'https://generativelanguage.googleapis.com',mistral:'https://api.mistral.ai',cloudflare:'https://api.cloudflare.com',netlify:'https://api.netlify.com'};
export async function request(provider:string,secret:string,path:string,init:RequestInit={}) {
 const origin=origins[provider];if(!origin||!path.startsWith('/')||path.startsWith('//'))throw new Error('Destination non autorisée');
 const headers=new Headers(init.headers);headers.set('Accept','application/json');headers.set('User-Agent','Atelier/0.1');
 if(provider==='anthropic'){headers.set('x-api-key',secret);headers.set('anthropic-version','2023-06-01');}
 else if(provider==='gemini')headers.set('x-goog-api-key',secret);
 else headers.set('Authorization',`Bearer ${secret}`);
 if(provider==='github')headers.set('X-GitHub-Api-Version','2022-11-28');
 if(typeof init.body==='string'&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
 let response:Response;
 try{
  // Cloudflare Workers n'implémente PAS redirect:'error' : cela lève un
  // TypeError avant le départ. manual empêche la fuite d'Authorization.
  response=await fetch(origin+path,{...init,headers,redirect:'manual',signal:init.signal??AbortSignal.timeout(90000)});
 }catch(error){
  const timedOut=(init.signal?.aborted===true)|| (error instanceof Error && ['TimeoutError','AbortError'].includes(error.name));
  throw new ProviderError(timedOut?504:503,timedOut?'timeout':'network');
 }
 // Ni cookie ni clé API ne peut être envoyé à l'URL d'une redirection.
 if(response.status>=300&&response.status<400){
  try{await response.body?.cancel();}catch{}
  throw new ProviderError(response.status,'redirect');
 }
 if(!response.ok){try{await response.body?.cancel();}catch{/* garder le code HTTP du fournisseur */}throw new ProviderError(response.status,'http',response.headers.get('retry-after'));}
 return response;
}
export function quotaHeaders(headers:Headers){const values:Record<string,string>={};for(const [key,value] of headers)if(/^(x-ratelimit-|anthropic-ratelimit-|ratelimit-)/.test(key)&&value.length<150)values[key]=value;return {kind:Object.keys(values).length?'official':'unavailable',scope:'API, pas abonnement grand public',values,updated_at:new Date().toISOString()};}
export async function jsonRequest(provider:string,secret:string,path:string,init:RequestInit={}) {const r=await request(provider,secret,path,init);const text=await r.text();if(text.length>8000000)throw new ProviderError(413,'response_too_large');return {data:JSON.parse(text),quota:quotaHeaders(r.headers),hasNext:!!r.headers.get('Link')?.includes('rel="next"')};}
