import { HTTPException } from 'hono/http-exception';
import type { Ctx, Env, Row } from './types.ts';
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export function fail(status:400|401|403|404|409|413|422|429|500|502|503, message:string):never { throw new HTTPException(status,{message}); }
export const one = <T=Row>(env:Env,sql:string,...args:any[]) => env.DB.prepare(sql).bind(...args).first<T>();
export async function many<T=Row>(env:Env,sql:string,...args:any[]):Promise<T[]> { return (await env.DB.prepare(sql).bind(...args).all<T>()).results; }
export const run = (env:Env,sql:string,...args:any[]) => env.DB.prepare(sql).bind(...args).run();
const ownedTables = new Set(['projects','connections','conversations','memory','files','tasks','repositories','deployment_targets','deployments','plan_tasks','plan_phases','project_decisions','handoff_packages','prompts','memory_repos','export_batches','ref_audits']);
export async function owned<T=Row>(env:Env,table:string,id:string,userId:string):Promise<T> {
 if(!ownedTables.has(table)) throw new Error('Unknown table');
 const row = await one<T>(env,`SELECT * FROM ${table} WHERE id=? AND user_id=?`,id,userId);
 if(!row) fail(404,'Cet élément est introuvable ou ne vous appartient pas.'); return row;
}
export const userId = (c:Ctx) => c.get('user').id;
export function page(c:Ctx) { const n=Number(c.req.query('limit')||30); const offset=Number(c.req.query('offset')||0); return {limit:Number.isInteger(n)?Math.max(1,Math.min(50,n)):30,offset:Number.isInteger(offset)?Math.max(0,offset):0}; }
export async function event(env:Env,user:string,kind:string,detail:string,project:string|null=null,task:string|null=null) {
 await run(env,'INSERT INTO events(user_id,project_id,task_id,kind,detail,created_at) VALUES(?,?,?,?,?,?)',user,project,task,kind,detail,now());
}
export function safeFilename(s:string) {const name=s.normalize('NFC').replace(/[\x00-\x1f\x7f/\\]/g,'_').replace(/^\.+/,'_').slice(0,180).trim();return name||'fichier';}
export async function jsonBody(c:Ctx) { const raw=await c.req.text(); if(raw.length>300000) fail(413,'Contenu trop volumineux.'); try{return JSON.parse(raw);}catch{fail(400,'Le formulaire est invalide.');} }
