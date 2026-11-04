import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildReviewComment,neutralizeMentions,postReviewComment,commentFailureMessage,commentMarker} from '../server/review-comment.ts';
import {ProviderError} from '../server/connectors/http.ts';
// Réponses simulées : aucune requête GitHub réelle.
const sha='a'.repeat(40);
test('les mentions @ sont neutralisées : aucun utilisateur ni bot n’est notifié',()=>{
 const out=neutralizeMentions('@claude corrige ceci, merci @martinznt ; email a@b.fr ; seul @ reste');
 assert.doesNotMatch(out,/@(claude|martinznt)/);
 assert.match(out,/@​claude/);
 assert.match(out,/seul @ reste/);
});
test('le commentaire contient le marqueur, le dossier, la mention de lecture seule, sans déclencher d’agent',()=>{
 const body=buildReviewComment({sha,handoff:'DOSSIER @claude à vérifier'});
 assert.ok(body.startsWith(commentMarker(sha)));
 assert.match(body,/DOSSIER/);assert.match(body,/lecture seule/);assert.match(body,/aucun agent n’a été lancé automatiquement/);
 assert.doesNotMatch(body,/@claude/);
});
test('publication : POST sur issues/<PR>/comments, jeton en Authorization, redirection refusée, lien conservé',async()=>{
 let seen;const original=globalThis.fetch;
 globalThis.fetch=async(url,init)=>{seen={url,init};return new Response(JSON.stringify({html_url:'https://github.com/o/r/pull/105#issuecomment-1'}),{status:201,headers:{'content-type':'application/json'}});};
 try{
  const r=await postReviewComment('ghp_FIXTURE','o/r',105,{sha,handoff:'texte'});
  assert.equal(r.url,'https://github.com/o/r/pull/105#issuecomment-1');
 }finally{globalThis.fetch=original;}
 assert.equal(seen.url,'https://api.github.com/repos/o/r/issues/105/comments');
 assert.equal(seen.init.method,'POST');assert.equal(seen.init.redirect,'manual');
 assert.equal(new Headers(seen.init.headers).get('authorization'),'Bearer ghp_FIXTURE');
 assert.doesNotMatch(String(seen.init.body),/ghp_FIXTURE/);
 assert.match(JSON.parse(seen.init.body).body,/atelier-review/);
});
test('un lien hors github.com est ignoré',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({html_url:'https://evil.example/x'}),{status:201});
 try{assert.equal((await postReviewComment('t','o/r',1,{sha,handoff:'x'})).url,null);}finally{globalThis.fetch=original;}
});
test('échec 403 : message clair sans détail brut ni secret',()=>{
 const m=commentFailureMessage(new ProviderError(403,'http'));
 assert.match(m,/HTTP 403/);assert.match(m,/droit d’écrire des commentaires/);assert.match(m,/conservé dans Atelier/);
 assert.doesNotMatch(commentFailureMessage(new Error('Bearer ghp_SECRET')),/ghp_SECRET|Bearer/);
});
