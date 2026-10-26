export type GithubNetworkProbe={
 reachable:boolean;http_status:number|null;outcome:'ok'|'http'|'redirect'|'timeout'|'network';
 advice:string;
};
/**
 * Sonde volontaire et sans jeton. Les erreurs internes ne sont jamais rendues
 * au navigateur : des URL, headers ou secrets peuvent s'y trouver.
 */
export async function probeGithubNetwork(fetcher:typeof fetch=fetch):Promise<GithubNetworkProbe>{
 try{
  const response=await fetcher('https://api.github.com/zen',{
   method:'GET',redirect:'manual',
   headers:{Accept:'text/plain','User-Agent':'Atelier/0.1'},
   signal:AbortSignal.timeout(10000)
  });
  try{await response.body?.cancel();}catch{}
  if(response.status>=300&&response.status<400)return {reachable:true,http_status:response.status,outcome:'redirect',advice:'GitHub a répondu avec une redirection. Atelier ne la suit pas.'};
  if(response.ok)return {reachable:true,http_status:response.status,outcome:'ok',advice:'La connexion réseau Cloudflare → GitHub répond sans jeton. Le test de votre jeton est distinct.'};
  return {reachable:true,http_status:response.status,outcome:'http',advice:response.status===403||response.status===429?'GitHub répond, mais limite ou refuse cet appel anonyme. Tester le jeton séparément, sans modifier ses permissions.':'GitHub a répondu avec un statut HTTP non attendu. Consultez son état avant de retenter.'};
 }catch(error){
  const timeout=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name);
  return {reachable:false,http_status:null,outcome:timeout?'timeout':'network',advice:timeout?'Cloudflare n’a pas reçu la réponse dans les 10 secondes. Vérifier les journaux du Worker.':'Cloudflare ne parvient pas à appeler GitHub sans jeton. Vérifier le réseau ou la compatibilité du Worker avant de modifier les accès.'};
 }
}
