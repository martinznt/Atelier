/**
 * GitHub Actions: contrôle NON AUTHENTIFIÉ de la production Cloudflare.
 * Ne déploie rien, ne lit aucun compte, n'utilise aucun secret ni quota IA.
 */
const origin='https://atelier.martin-zannet22.workers.dev';
const expected=(process.env.GITHUB_SHA||'').trim().toLowerCase();
if(!/^[0-9a-f]{40}$/.test(expected)){
 console.error('SHA attendu non disponible : impossible de vérifier quelle version est publiée.');
 process.exit(1);
}
const max=12;
const sleep=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
async function get(path){
 const response=await fetch(origin+path,{
  method:'GET',
  redirect:'manual',
  headers:{Accept:'application/json','Cache-Control':'no-cache'},
  signal:AbortSignal.timeout(10000)
 });
 return response;
}
let seen='unknown';
for(let attempt=1;attempt<=max;attempt++){
 try{
  const response=await get('/api/health');
  if(response.status===200){
   const data=await response.json();
   seen=typeof data.release_sha==='string'?data.release_sha:'unknown';
   if(data.status==='ok'&&data.runtime==='cloudflare-workers'&&
      data.features?.private_readiness==='v1'&&seen===expected){
    const checks=['/api/auth/me','/api/connections','/api/account/readiness'];
    for(const path of checks){
     const restricted=await get(path);
     if(restricted.status!==401)throw Error('Une route privée ne refuse pas l’accès anonyme : '+path+' (HTTP '+restricted.status+').');
    }
    const home=await fetch(origin+'/',{redirect:'manual',signal:AbortSignal.timeout(10000)});
    if(home.status!==200)throw Error('Accueil inaccessible : HTTP '+home.status);
    console.log('✓ Cloudflare publie exactement le commit '+expected.slice(0,12)+'.');
    console.log('✓ Health, accueil et accès privé refusés sans session.');
    console.log('Attention : les jetons GitHub personnels et API IA ne sont pas testés ici.');
    process.exit(0);
   }
  }else console.log('Health HTTP '+response.status+'.');
 }catch(error){console.log('Lecture ou vérification réseau impossible : '+(error instanceof Error?error.name:'unknown'));}
 console.log('Contrôle '+attempt+'/'+max+' : publication attendue '+expected.slice(0,12)+', observée '+seen.slice(0,12)+'.');
 if(attempt<max)await sleep(15000);
}
console.error('Échec de validation Cloudflare : le commit attendu ne répond pas après vérification. Vérifier Workers Builds et la commande npm run deploy:cloudflare.');
process.exitCode=1;
