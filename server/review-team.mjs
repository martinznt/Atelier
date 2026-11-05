/**
 * Recommendations are based on existing *tested* API connections, not an invented
 * benchmark or a provider's alleged free allowance. No network request here.
 */
const unavailableModels=/(embedding|(^|[-_])embed|realtime|transcri|whisper|speech|tts|audio|dall-e|imagen|vision-only|moderation)/i;
const economicalHint=/(mini|small|flash|lite|light|haiku|ministral|codestral|devstral)/i;
/** Modèle économique et adapté au texte d'une connexion : celui que le fournisseur liste, sans classement inventé. */
export function pickReviewModel(connection){
 const models=(Array.isArray(connection.models)?connection.models:[]).filter(m=>!unavailableModels.test(m));
 models.sort((a,b)=>Number(economicalHint.test(b))-Number(economicalHint.test(a))||a.localeCompare(b));
 return models[0];
}
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
 const pick=c=>({connection_id:c.id,model:pickReviewModel(c)});
 const primary=sorted.length?pick(sorted[0]):null;
 const secondary=sorted.find(c=>c.provider!==sorted[0]?.provider);
 return {
  primary,secondary:secondary?pick(secondary):null,
  ready:available.length,
  rationale:'Préférences de coût présumé, sans garantie de gratuité ni de qualité. Deuxième IA seulement si fournisseur différent.',
  warning:'Vérifiez l’éligibilité et les limites gratuites de chaque clé chez son fournisseur avant de lancer une revue.'
 };
}
/** Ce qui n'a PAS été vérifié : calculé de façon déterministe, jamais par une IA. */
export function notVerified(result){
 const out=['Aucun test n’a été exécuté par Atelier : seuls les résultats GitHub existants sont lus.'];
 const reviewers=result.reviewers||[];
 const cov=reviewers.map(r=>r.coverage).find(Boolean);
 if(cov&&cov.complete===false){
  const missed=(cov.files||[]).filter(f=>f.state!=='full'&&!/sensible/.test(f.reason||'')).map(f=>f.name+(f.state==='truncated'?' (tronqué)':''));
  out.push('Diff incomplet : '+(cov.percent??'?')+' % des caractères transmis'+(missed.length?' ; fichiers non lus ou tronqués : '+missed.slice(0,12).join(', ')+(missed.length>12?' et '+(missed.length-12)+' autre(s)':''):'')+'.');
 }
 if(result.files_partial)out.push('Liste des fichiers de la PR incomplète côté GitHub (plus de 60 fichiers).');
 if(result.checks_unavailable)out.push('Tests GitHub non lus : '+result.checks_unavailable);
 else if(result.checks_partial)out.push('Liste des tests GitHub incomplète.');
 for(const r of reviewers.filter(x=>!x.review))out.push('Vérification « '+r.role+' » sans résultat'+(r.partial?' (réponse interrompue : texte partiel inexploitable comme résultat)':'')+'.');
 out.push('Les anomalies listées sont des pistes à reproduire ; l’accord de plusieurs IA n’est pas une preuve.');
 return out;
}
/** Désaccords : une anomalie P0/P1 signalée par une IA sur un fichier que l'autre a lu sans rien signaler. */
export function disagreements(result){
 const done=(result.reviewers||[]).filter(r=>r.review);
 if(done.length<2)return [];
 const out=[];
 for(const r of done)for(const f of r.review.findings||[]){
  if(!['P0','P1'].includes(f.severity))continue;
  const others=done.filter(o=>o!==r&&!(o.review.findings||[]).some(x=>x.file===f.file));
  if(others.length)out.push(f.file+' ('+f.severity+') signalé par '+(r.provider?r.provider+' · ':'')+(r.model||r.role)+', non signalé par '+others.map(o=>(o.provider?o.provider+' · ':'')+(o.model||o.role)).join(', ')+' — à départager par un test.');
 }
 return [...new Set(out)];
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
   byKey.set(key,{...finding,sources:[who]});
  }
 }
 const findings=[...byKey.values()];
 const rank={P0:0,P1:1,P2:2,P3:3,info:4};
 findings.sort((a,b)=>(rank[a.severity]??5)-(rank[b.severity]??5));
 const repo=String(result.repo||''),number=String(result.pr_number||'');
 const link=repo&&number?'https://github.com/'+repo+'/pull/'+number:'';
 const done=reviewers.filter(r=>r.review),failed=reviewers.filter(r=>r.error);
 const testsLine=result.checks_unavailable?'Tests GitHub NON lus : '+result.checks_unavailable
  :checks.length?'Contrôles GitHub en échec : '+checks.map(c=>c.name+' ('+c.conclusion+')').join('; ')
  :(result.checks||[]).length?'Contrôles GitHub lus : '+(result.checks||[]).map(c=>c.name+' ('+(c.conclusion||c.status)+')').join('; ')+' (ne prouve pas leur couverture complète).'
  :'Aucun contrôle GitHub dans la liste consultée.';
 const cov=reviewers.map(r=>r.coverage).find(Boolean);
 const lines=[
  'DOSSIER DE TRANSMISSION — REVUE DE PR : '+repo+' #'+number,
  link?'Lien : '+link:'',
  'Commit analysé : '+String(result.head_sha||'')+' ; risque : '+String(result.risk||'non classé'),
  'Attention : rapport automatisé. Aucun correctif exécuté, aucun test lancé par Atelier, aucune erreur prouvée par le seul avis IA. Une IA qui ne détecte rien ne prouve pas que le code est correct.',
  'IA ayant analysé : '+(done.length?done.map(r=>(r.provider?r.provider+' · ':'')+(r.model||r.role)+' ('+r.role+')').join(' ; '):'aucune')+(failed.length?' ; sans résultat : '+failed.map(r=>(r.provider||'IA')+' ('+r.role+')').join(', '):''),
  ...reviewers.filter(r=>(r.attempts||[]).some(t=>t.outcome==='refused')).map(r=>'Relais ('+r.role+') : '+r.attempts.filter(t=>t.outcome!=='skipped').map(t=>t.provider+' '+t.model+' → '+(t.outcome==='completed'?'a répondu':(t.kind_label||t.outcome))).join(' ; ')),
  ...reviewers.filter(r=>r.partial&&r.partial.complete===false).map(r=>'Analyse INCOMPLÈTE ('+r.role+') : réponse interrompue, texte partiel non exploitable comme résultat.'),
  cov?'Couverture du diff : '+(cov.percent??'?')+' % des caractères'+(cov.code_percent!=null?' (dont '+cov.code_percent+' % du code source modifié, '+cov.code_files+' fichier(s))':'')+' ; '+cov.included+' fichier(s) lu(s), '+cov.excluded+' exclu(s), '+cov.redacted+' ligne(s) masquée(s)'+(cov.complete?'.':' — diff incomplet.'):'',
  testsLine,
  result.plan?String(result.plan.summary||'')+(result.plan.skipped||[]).map(x=>'\n   Non sollicité : '+x.reason).join(''):'',
  findings.length?'Anomalies proposées par les IA (pistes à reproduire, pas des faits établis) :':'Aucune anomalie étayée sur le diff transmis.',
  ...findings.slice(0,20).map((f,i)=>(i+1)+'. ['+f.severity+'] '+f.file+(f.location?' — '+f.location:'')+' — '+f.reason
   +(f.impact?'\n   Conséquence : '+f.impact:'')+'\n   Reproduction : '+(f.reproduction||'non précisée')+(f.fix?'\n   Correction suggérée : '+f.fix:'')
   +'\n   Source : '+f.sources.join(', ')+(f.sources.length>1?' (concordance de plusieurs IA, non une preuve)':' (une seule IA)')),
  ...(disagreements(result).length?['Désaccords entre les IA :',...disagreements(result).map(d=>'   - '+d)]:[]),
  'Ce qui n’a PAS été vérifié :',...notVerified(result).map(x=>'   - '+x),
  'Questions pour l’assistant qui reprend : (1) lesquelles de ces anomalies sont réelles, avec quel test pour le prouver ? (2) y a-t-il des risques d’architecture, de sécurité ou d’ergonomie que les IA de revue n’ont pas vus ? (3) que faut-il vérifier avant de fusionner ?',
  'Consigne : confirmer les anomalies par un test, corriger seulement celles reproduites, relancer les tests ciblés puis la CI. Ne pas fusionner sur la seule base de ce rapport.'
 ];
 return lines.filter(Boolean).join('\n').slice(0,16000);
}
