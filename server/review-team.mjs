/**
 * Recommendations are based on existing *tested* API connections, not an invented
 * benchmark or a provider's alleged free allowance. No network request here.
 */
const unavailableModels=/(embedding|(^|[-_])embed|realtime|transcri|whisper|speech|tts|audio|dall-e|imagen|vision-only|moderation)/i;
const economicalHint=/(mini|small|flash|lite|light|haiku|ministral|codestral|devstral)/i;
export function readableQuota(input){
 if(input && typeof input==='object' && !Array.isArray(input))return input;
 try{const value=typeof input==='string' ? JSON.parse(input) : {};return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}
}
export function activeReviewConnections(connections,at=Date.now()){
 return connections.filter(c=>{
  const models=Array.isArray(c.models)?c.models:[];
  const scopes=Array.isArray(c.scopes)?c.scopes:[];
  if(!['mistral','groq','openai','anthropic','gemini'].includes(c.provider)||c.status!=='connected'||!c.api_consent||!scopes.includes('chat')||!models.some(m=>!unavailableModels.test(m)))return false;
  if(c.expires_at && (Date.parse(c.expires_at)<=at||!Number.isFinite(Date.parse(c.expires_at))))return false;
  const quota=readableQuota(c.quota);
  if(quota.status==='rate_limited')return false; // No automatic retry after a 429, even if a date was suggested.
  return true;
 });
}
export function recommendedReviewTeam(connections,at=Date.now()){
 const available=activeReviewConnections(connections,at);
 const sorted=[...available].sort((a,b)=>{
  const score=x=>x.provider==='mistral'?0:x.provider==='gemini'?1:x.provider==='groq'?2:x.provider==='openai'?3:4;
  return score(a)-score(b)||String(a.label).localeCompare(String(b.label));
 });
 const pick=c=>{
  const models=(c.models||[]).filter(m=>!unavailableModels.test(m));
  models.sort((a,b)=>Number(economicalHint.test(b))-Number(economicalHint.test(a))||a.localeCompare(b));
  return {connection_id:c.id,model:models[0]};
 };
 const primary=sorted.length?pick(sorted[0]):null;
 const secondary=sorted.find(c=>c.provider!==sorted[0]?.provider);
 return {
  primary,secondary:secondary?pick(secondary):null,
  ready:available.length,
  rationale:'Préférences de coût présumé, sans garantie de gratuité ni de qualité. Deuxième IA seulement si fournisseur différent.',
  warning:'Vérifiez l’éligibilité et les limites gratuites de chaque clé chez son fournisseur avant de lancer une revue.'
 };
}
export function reviewHandoff(result){
 const checks=(result.checks||[]).filter(c=>c.conclusion==='failure'||c.conclusion==='timed_out'||c.conclusion==='cancelled');
 const reviewers=result.reviewers||[];
 const byKey=new Map();
 for(const reviewer of reviewers){
  const who=(reviewer.provider?reviewer.provider+' · ':'')+(reviewer.model||reviewer.role||'IA');
  for(const finding of reviewer.review?.findings||[]){
   const key=String(finding.file||'')+'|'+String(finding.reason||'').toLowerCase().trim();
   const known=byKey.get(key);
   if(known){if(!known.sources.includes(who))known.sources.push(who);continue;}
   byKey.set(key,{severity:finding.severity,file:finding.file,reason:finding.reason,reproduction:finding.reproduction,sources:[who]});
  }
 }
 const findings=[...byKey.values()];
 const rank={P0:0,P1:1,P2:2};
 findings.sort((a,b)=>(rank[a.severity]??3)-(rank[b.severity]??3));
 const repo=String(result.repo||''),number=String(result.pr_number||'');
 const link=repo&&number?'https://github.com/'+repo+'/pull/'+number:'';
 const done=reviewers.filter(r=>r.review),failed=reviewers.filter(r=>r.error);
 const testsLine=result.checks_unavailable?'Tests GitHub NON lus : '+result.checks_unavailable
  :checks.length?'Contrôles GitHub en échec : '+checks.map(c=>c.name+' ('+c.conclusion+')').join('; ')
  :'Aucun contrôle GitHub en échec dans la liste consultée (ne prouve pas leur couverture complète).';
 const cov=reviewers.map(r=>r.coverage).find(Boolean);
 const lines=[
  'DOSSIER DE TRANSMISSION — REVUE DE PR : '+repo+' #'+number,
  link?'Lien : '+link:'',
  'Commit : '+String(result.head_sha||'')+' ; risque : '+String(result.risk||'non classé'),
  'Attention : rapport automatisé. Aucun correctif exécuté, aucun test lancé par Atelier, aucune erreur prouvée par le seul avis IA. Une IA qui ne détecte rien ne prouve pas que le code est correct.',
  'IA ayant analysé : '+(done.length?done.map(r=>(r.provider?r.provider+' · ':'')+(r.model||r.role)+' ('+r.role+')').join(' ; '):'aucune')+(failed.length?' ; sans résultat : '+failed.map(r=>(r.provider||'IA')+' ('+r.role+')').join(', '):''),
  cov?'Couverture du diff : '+cov.included+' fichier(s) lu(s), '+cov.excluded+' exclu(s), '+cov.redacted+' ligne(s) masquée(s)'+(cov.complete?'.':' — diff incomplet.'):'',
  result.files_partial||result.checks_partial?'Couverture GitHub partielle : vérifier le diff et les contrôles manquants.':'',
  testsLine,
  result.plan?String(result.plan.summary||'')+(result.plan.skipped||[]).map(x=>'\n   Non sollicité : '+x.reason).join(''):'',
  findings.length?'Anomalies IA proposées à reproduire et corriger :':'Aucune anomalie IA étayée sur le diff transmis.',
  ...findings.slice(0,20).map((f,i)=>(i+1)+'. ['+f.severity+'] '+f.file+' — '+f.reason+'\n   Reproduction : '+f.reproduction+' ; source : '+f.sources.join(', ')+(f.sources.length>1?' (concordance de plusieurs IA, non une preuve)':' (une seule IA)')),
  failed.length?'Une ou plusieurs IA n’ont pas terminé leur analyse : ne pas conclure à partir des seules analyses disponibles.':'',
  'Questions pour l’assistant qui reprend : (1) lesquelles de ces anomalies sont réelles, avec quel test pour le prouver ? (2) y a-t-il des risques d’architecture, de sécurité ou d’ergonomie que les IA de revue n’ont pas vus ? (3) que faut-il vérifier avant de fusionner ?',
  'Consigne : confirmer les anomalies par un test, corriger seulement celles reproduites, relancer les tests ciblés puis la CI. Ne pas fusionner sur la seule base de ce rapport.'
 ];
 return lines.filter(Boolean).join('\n').slice(0,12000);
}
