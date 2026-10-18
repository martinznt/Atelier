import {test} from 'node:test';
import assert from 'node:assert/strict';
import {listModels} from '../server/connectors/model-list.ts';
// These explicit fixtures validate pagination logic, not a real provider connection.
const page=data=>({data,quota:{kind:'unavailable'}});
test('Anthropic parcourt les pages, encode le curseur, déduplique et écarte les modèles retirés',async()=>{
 const paths=[];
 const result=await listModels('anthropic',async path=>{paths.push(path);return paths.length===1?page({data:[{id:'m2'},{id:'old',lifecycle:'retired'}],has_more:true,last_id:'m2/&?'}):page({data:[{id:'m1'},{id:'m2'}],has_more:false,last_id:'m2'});});
 assert.deepEqual(result.models,['m1','m2']);assert.equal(paths[1],'/v1/models?limit=100&after_id=m2%2F%26%3F');
});
test('Gemini parcourt toutes les pages et conserve seulement les modèles generateContent',async()=>{
 const paths=[];
 const result=await listModels('gemini',async path=>{paths.push(path);return paths.length===1?page({models:[{name:'models/embedding',supportedGenerationMethods:['embedContent']}],nextPageToken:'next&page'}):page({models:[{name:'models/chat-test',supportedGenerationMethods:['generateContent']}]});});
 assert.deepEqual(result.models,['chat-test']);assert.equal(paths[1],'/v1beta/models?pageSize=1000&pageToken=next%26page');
});
test('OpenAI conserve les identifiants réellement listés, sans classement inventé',async()=>{
 assert.deepEqual((await listModels('openai',async()=>page({data:[{id:'b'},{id:'a'},{id:'a'}]}))).models,['a','b']);
});
test('un curseur cyclique ou absent n’est jamais présenté comme un catalogue complet',async()=>{
 for(const last_id of [undefined,'repeat'])await assert.rejects(()=>listModels('anthropic',async()=>page({data:[{id:'model'}],has_more:true,last_id})),/Pagination/);
 await assert.rejects(()=>listModels('anthropic',async()=>page({data:[{id:'model'}]})),/Pagination/);
});
test('les limites de volume et de pages sont explicites, sans résultat partiel réussi',async()=>{
 let calls=0;await assert.rejects(()=>listModels('anthropic',async()=>page({data:[{id:'m'}],has_more:true,last_id:String(++calls)})),/dix pages/);assert.equal(calls,10);
 await assert.rejects(()=>listModels('openai',async()=>page({data:Array.from({length:5001},(_,id)=>({id:String(id)}))})),/volumineux/);
});
test('une erreur ou une réponse malformée sur une page suivante reste un échec',async()=>{
 let count=0;await assert.rejects(()=>listModels('gemini',async()=>{if(count++)throw new Error('fixture réseau interrompu');return page({models:[],nextPageToken:'next'});}),/réseau/);
 await assert.rejects(()=>listModels('openai',async()=>page({data:[{id:42}]})),/invalide/);
});
