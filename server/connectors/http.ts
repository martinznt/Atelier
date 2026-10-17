export class ProviderError extends Error {
 constructor(public status:number, public code:string, public retryAfter:string|null=null){super(status===401||status===403?'Accès refusé ou révoqué. Vérifiez les droits et remplacez le jeton.':status===429?'Limite du fournisseur atteinte. L’avancement est conservé ; attendez ou choisissez explicitement un autre assistant.':status===409||status===422?'Le contenu distant a changé ou la demande est incompatible. Rechargez les données.':'Le fournisseur n’a pas terminé la demande. Vérifiez son état avant de réessayer.');}
}
export const origins:Record<string,string>={github:'https://api.github.com',openai:'https://api.openai.com',anthropic:'https://api.anthropic.com',gemini:'https://generativelanguage.googleapis.com',cloudflare:'https://api.cloudflare.com',netlify:'https://api.netlify.com'};
export async function request(provider:string,secret:string,path:string,init:RequestInit={}) {
 const origin=origins[provider];if(!origin||!path.startsWith('/')||path.startsWith('//'))throw new Error('Destination non autorisée');
 const headers=new Headers(init.headers);headers.set('Accept','application/json');headers.set('User-Agent','Atelier/0.1');
 if(provider==='anthropic'){headers.set('x-api-key',secret);headers.set('anthropic-version','2023-06-01');}
 else if(provider==='gemini')headers.set('x-goog-api-key',secret);
 else headers.set('Authorization',`Bearer ${secret}`);
 if(provider==='github')headers.set('X-GitHub-Api-Version','2022-11-28');
 if(typeof init.body==='string'&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
 let response:Response;
 try{response=await fetch(origin+path,{...init,headers,redirect:'error',signal:init.signal??AbortSignal.timeout(90000)});}catch{throw new ProviderError(503,'network');}
 if(!response.ok){await response.body?.cancel();throw new ProviderError(response.status,'http',response.headers.get('retry-after'));}
 return response;
}
export function quotaHeaders(headers:Headers){const values:Record<string,string>={};for(const [key,value] of headers)if(/^(x-ratelimit-|anthropic-ratelimit-|ratelimit-)/.test(key)&&value.length<150)values[key]=value;return {kind:Object.keys(values).length?'official':'unavailable',scope:'API, pas abonnement grand public',values,updated_at:new Date().toISOString()};}
export async function jsonRequest(provider:string,secret:string,path:string,init:RequestInit={}) {const r=await request(provider,secret,path,init);const text=await r.text();if(text.length>8000000)throw new ProviderError(413,'response_too_large');return {data:JSON.parse(text),quota:quotaHeaders(r.headers),hasNext:!!r.headers.get('Link')?.includes('rel="next"')};}
