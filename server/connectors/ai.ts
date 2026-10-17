import {jsonRequest,request,quotaHeaders,ProviderError} from './http.ts';
export interface AIMessage {role:'user'|'assistant';content:string}
export interface Delta {text?:string;model?:string;input?:number;output?:number;quota?:unknown}
export async function testConnection(provider:string,secret:string) {
 if(provider==='github'){const r=await jsonRequest(provider,secret,'/user');return {account:r.data.login,models:[],quota:r.quota};}
 if(provider==='cloudflare'){const r=await jsonRequest(provider,secret,'/client/v4/user/tokens/verify');if(!r.data.success||r.data.result.status!=='active')throw new ProviderError(401,'inactive');return {account:'Jeton actif · droits à vérifier par compte',models:[],quota:r.quota};}
 if(provider==='netlify'){const r=await jsonRequest(provider,secret,'/api/v1/user');return {account:r.data.full_name||r.data.id,models:[],quota:r.quota};}
 const path=provider==='openai'?'/v1/models':provider==='anthropic'?'/v1/models?limit=100':'/v1beta/models?pageSize=1000';
 const r=await jsonRequest(provider,secret,path);
 const models=provider==='gemini'?(r.data.models||[]).filter((m:any)=>m.supportedGenerationMethods?.includes('generateContent')).map((m:any)=>m.name.replace('models/','')):(r.data.data||[]).map((m:any)=>m.id);
 return {account:'Accès API vérifié',models:models.sort(),quota:r.quota};
}
async function* sse(response:Response):AsyncGenerator<any> {
 if(!response.body)throw new ProviderError(502,'empty');const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
 try{while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value,{stream:!done}).replace(/\r\n/g,'\n');let end;
 while((end=buffer.indexOf('\n\n'))>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=block.split('\n').filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(data&&data!=='[DONE]')yield JSON.parse(data);}
 if(buffer.length>2000000)throw new ProviderError(413,'stream_too_large');if(done)break;}}
 finally{await reader.cancel().catch(()=>{});}
}
export async function* generate(provider:string,secret:string,model:string,messages:AIMessage[],maxTokens:number,signal:AbortSignal):AsyncGenerator<Delta>{
 let path:string,body:any;
 if(provider==='openai'){path='/v1/responses';body={model,input:messages,max_output_tokens:maxTokens,stream:true,store:false};}
 else if(provider==='anthropic'){path='/v1/messages';body={model,messages,max_tokens:maxTokens,stream:true};}
 else if(provider==='gemini'){path=`/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;body={contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:maxTokens}};}
 else throw new ProviderError(400,'unsupported');
 const response=await request(provider,secret,path,{method:'POST',body:JSON.stringify(body),signal});yield {quota:quotaHeaders(response.headers)};
 let ended=false;
 for await(const data of sse(response)){
 if(data.error||data.type==='error'||data.type==='response.failed')throw new ProviderError(502,'stream_error');
 if(provider==='openai'){
 if(data.type==='response.output_text.delta')yield {text:data.delta};
 if(data.type==='response.completed'||data.type==='response.incomplete'){ended=true;yield {model:data.response.model,input:data.response.usage?.input_tokens,output:data.response.usage?.output_tokens};if(data.type==='response.incomplete')throw new ProviderError(422,'output_limit');}
 }else if(provider==='anthropic'){
 if(data.type==='message_start')yield {model:data.message.model,input:data.message.usage?.input_tokens};
 if(data.type==='content_block_delta'&&data.delta.type==='text_delta')yield {text:data.delta.text};
 if(data.type==='message_delta')yield {output:data.usage?.output_tokens};
 if(data.type==='message_stop')ended=true;
 }else{
 const candidate=data.candidates?.[0];if(candidate?.content?.parts)for(const p of candidate.content.parts)if(p.text&&!p.thought)yield {text:p.text};
 if(data.modelVersion)yield {model:data.modelVersion};if(data.usageMetadata)yield {input:data.usageMetadata.promptTokenCount,output:data.usageMetadata.candidatesTokenCount};if(candidate?.finishReason){ended=true;if(candidate.finishReason!=='STOP')throw new ProviderError(422,'output_limit');}
 }
 }
 if(!ended)throw new ProviderError(502,'interrupted_stream');
}
