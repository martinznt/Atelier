import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isClaudeCodeWork,roleIntro,roleTitle} from '../server/review-roles.ts';
import {buildRoleComment,postRoleComments,roleMarker} from '../server/review-comment.ts';
const sha='a'.repeat(40);
test('travail de Claude Code reconnu par la branche claude/ ou la mention dans la description',()=>{
 assert.equal(isClaudeCodeWork({head:{ref:'claude/atelier-multi-ia-aaaze2'}}),true);
 assert.equal(isClaudeCodeWork({head:{ref:'Claude/Autre'}}),true);
 assert.equal(isClaudeCodeWork({head:{ref:'feat/x'},body:'… 🤖 Generated with [Claude Code](https://claude.com/claude-code)'}),true);
 assert.equal(isClaudeCodeWork({head:{ref:'feat/x'},body:'Session : https://claude.ai/code/session_01'}),true);
});
test('une PR ordinaire n’est pas prise pour du travail de Claude Code',()=>{
 for(const pr of [{head:{ref:'codex/f1-cuisine'},body:'Décision sans Martin'},{head:{ref:'feat/claudette'},body:null},{head:{ref:'chatgpt/conception'}},{},null,undefined])
  assert.equal(isClaudeCodeWork(pr),false);
});
test('chaque rôle a son titre et ses consignes ; Claude Code reproduit et corrige, ChatGPT donne un avis indépendant',()=>{
 assert.match(roleTitle.claude_code,/Claude Code/);assert.match(roleTitle.chatgpt,/ChatGPT/);
 assert.match(roleIntro.claude_code,/reproduis d’abord/);assert.match(roleIntro.claude_code,/hors périmètre/);
 assert.match(roleIntro.chatgpt,/avis indépendant/);assert.match(roleIntro.chatgpt,/ne demande ni clé ni secret/);
});
test('commentaire par rôle : marqueur par rôle et par commit, consignes du rôle, aucune mention active',()=>{
 const handoff='DOSSIER @claude @martinznt à vérifier';
 const a=buildRoleComment('claude_code',{sha,handoff}),b=buildRoleComment('chatgpt',{sha,handoff});
 assert.ok(a.startsWith(roleMarker(sha,'claude_code')));assert.ok(b.startsWith(roleMarker(sha,'chatgpt')));
 assert.match(a,/Pour Claude Code/);assert.match(a,/reproduis d’abord/);assert.doesNotMatch(a,/avis indépendant à partir/);
 assert.match(b,/Pour ChatGPT/);assert.match(b,/avis indépendant/);assert.doesNotMatch(b,/reproduis d’abord/);
 for(const t of [a,b]){assert.doesNotMatch(t,/@claude|@martinznt/);assert.match(t,/aucun agent n’a été lancé automatiquement/);assert.match(t,/DOSSIER/);}
});
test('publication : deux commentaires (Claude Code puis ChatGPT) ; l’échec de l’un ne masque pas l’autre',async()=>{
 const original=globalThis.fetch,bodies=[];let n=0;
 globalThis.fetch=async(url,init)=>{n++;bodies.push(JSON.parse(init.body).body);
  if(n===2)return new Response('{}',{status:403});
  return new Response(JSON.stringify({html_url:'https://github.com/o/r/pull/9#issuecomment-'+n}),{status:201});};
 try{
  const r=await postRoleComments('tok','o/r',9,{sha,handoff:'D'});
  assert.equal(r.claude_code.url,'https://github.com/o/r/pull/9#issuecomment-1');
  assert.match(r.chatgpt.error,/HTTP 403/);
 }finally{globalThis.fetch=original;}
 assert.equal(bodies.length,2);assert.match(bodies[0],/Pour Claude Code/);assert.match(bodies[1],/Pour ChatGPT/);
});
