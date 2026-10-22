import type { Context } from 'hono';
export interface Env {
 DB: D1Database; TASKS: Queue<{id:string}>; ASSETS: Fetcher;
 MASTER_KEY: string; APP_ORIGIN: string; ALLOW_REGISTRATION: string;
 STORAGE_LIMIT_MB: string; MAX_FILE_MB: string;
 SITES_AUTHENTICATION?: string;
}
export type AppEnv = { Bindings: Env; Variables: { user: User; sessionHash: string } };
export type Ctx = Context<AppEnv>;
export interface User {id:string; username:string; password_hash:string; storage_used:number; monthly_tokens:number; created_at:string}
export interface Connection {id:string; user_id:string; provider:string; label:string; secret:string; scopes:string; status:string; models:string; api_consent:number; expires_at:string|null}
export interface Task {id:string; user_id:string; project_id:string; conversation_id:string; status:string; payload:string; context:string; kind:string; cancel_requested:number}
export type Row = Record<string, any>;
