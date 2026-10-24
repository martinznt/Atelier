import { Hono } from 'hono';
import {getCookie,setCookie,deleteCookie} from 'hono/cookie';
import {z} from 'zod';
import {digest,randomToken} from './crypto.ts';
import {hashPassword,verifyPassword} from './password.ts';
import {createSession,recoverAccount,changePassword,revokeSession,enrollEmail} from './auth-store.ts';
import {fail,one,run,now,uid,jsonBody} from './core.ts';
import type {AppEnv,Ctx,Env,User} from './types.ts';

import {normalizeEmail,validNewPassword} from './account-policy.ts';
const emailField=z.string().refine(value=>normalizeEmail(value)!==null,'Adresse email invalide.').transform(value=>normalizeEmail(value)!);
const newPassword=z.string().refine(validNewPassword,'Le mot de passe doit contenir au moins 8 caractères (128 maximum).');
const credentials=z.object({email:emailField,password:z.string().min(1).max(128)});
const legacyCredentials=z.object({username:z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9_.-]+$/),password:z.string().min(1).max(128)});
const visible=(u:User)=>({id:u.id,username:u.username,email:u.email,needs_email:u.email===null,created_at:u.created_at,storage_used:u.storage_used,monthly_tokens:u.monthly_tokens});
export async function rateLimit(env:Env,key:string,max:number,seconds=900) {
 const time=Math.floor(Date.now()/1000),hash=await digest(key);
 const result=await one<{count:number}>(env,`INSERT INTO auth_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<? THEN ? ELSE expires_at END RETURNING count`,hash,time+seconds,time,time,time+seconds);
 if(result && result.count>max)fail(429,'Trop de tentatives. Réessayez dans quelques minutes.');
}
async function newSession() {
 const token=randomToken();
 return {token,tokenHash:await digest(token),createdAt:now(),expiresAt:new Date(Date.now()+14*86400000).toISOString()};
}
function sessionCookie(c:Ctx,token:string) {
 setCookie(c,'atelier_session',token,{httpOnly:true,secure:new URL(c.env.APP_ORIGIN).protocol==='https:',sameSite:'Strict',path:'/',maxAge:14*86400});
}
export async function requireAuth(c:Ctx,next:()=>Promise<void>) {
 const token=getCookie(c,'atelier_session');if(!token)fail(401,'Connectez-vous pour continuer.');
 const hash=await digest(token);
 const user=await one<User>(c.env,'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.deleted_at IS NULL',hash,now());
 if(!user)fail(401,'La session a expiré. Vos brouillons locaux restent conservés.');
 // This is a consistency check for shared browser cookies, never an identity source.
 // Another tab can replace the cookie before its account-change event is received.
 const expected=c.req.header('X-Atelier-Account');
 if(expected!==undefined&&expected!==user.id)fail(401,'Le compte connecté a changé dans un autre onglet. Reconnectez-vous au compte souhaité.');
 if(user.email===null&&!['/api/auth/me','/api/auth/email','/api/auth/logout-all','/api/auth/password','/api/account','/api/account/export'].includes(c.req.path))fail(403,'Ajoutez une adresse email à votre compte pour continuer. Vos données sont conservées.');
 c.set('user',user);c.set('sessionHash',hash);await next();
}
export const auth=new Hono<AppEnv>();
auth.post('/register',async c=>{
 if(c.env.ALLOW_REGISTRATION!=='true')fail(403,'Les inscriptions sont fermées.');
 await rateLimit(c.env,`register:${c.req.header('CF-Connecting-IP')||'local'}`,10);
 const {email,password}=credentials.extend({password:newPassword}).parse(await jsonBody(c));
 if(await one(c.env,'SELECT id FROM users WHERE email=?',email))fail(409,'Cette adresse email est indisponible.');
 const id=uid(),username=email,date=now(),hash=await hashPassword(password),codes=Array.from({length:8},()=>randomToken().slice(0,24));
 const hashes=await Promise.all(codes.map(digest)),session=await newSession();
 try{await c.env.DB.batch([
 c.env.DB.prepare('INSERT INTO users(id,username,email,password_hash,created_at) VALUES(?,?,?,?,?)').bind(id,username,email,hash,date),
 ...hashes.map(h=>c.env.DB.prepare('INSERT INTO recovery_codes(user_id,code_hash) VALUES(?,?)').bind(id,h)),
 c.env.DB.prepare('INSERT INTO sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').bind(session.tokenHash,id,session.createdAt,session.expiresAt)]);}
 catch(error){if(await one(c.env,'SELECT id FROM users WHERE email=?',email))fail(409,'Cette adresse email est indisponible.');throw error;}
 sessionCookie(c,session.token);return c.json({user:{id,username,email,needs_email:false,created_at:date,storage_used:0,monthly_tokens:100000},recoveryCodes:codes},201);
});
// Email is a login key only. Recovery always requires an independent recovery code.
auth.post('/login',async c=>{
 const {email,password}=credentials.parse(await jsonBody(c));
 await rateLimit(c.env,`login-ip:${c.req.header('CF-Connecting-IP')||'local'}`,40);
 await rateLimit(c.env,`login-email:${email}`,12);
 const user=await one<User>(c.env,'SELECT * FROM users WHERE email=? AND deleted_at IS NULL',email);
 const valid=user?await verifyPassword(password,user.password_hash):(await hashPassword(password),false);
 if(!valid||!user)fail(401,'Adresse email ou mot de passe incorrect.');
 const session=await newSession();
 if(!await createSession(c.env.DB,user.id,user.password_hash,session))fail(401,'Adresse email ou mot de passe incorrect.');
 sessionCookie(c,session.token);return c.json({user:visible(user)});
});
auth.post('/recover',async c=>{
 await rateLimit(c.env,`recover:${c.req.header('CF-Connecting-IP')||'local'}`,8);
 const data=credentials.extend({password:newPassword,code:z.string().min(20).max(80)}).parse(await jsonBody(c));
 await rateLimit(c.env,`recover-email:${data.email}`,8);
 const user=await one<User>(c.env,'SELECT * FROM users WHERE email=? AND deleted_at IS NULL',data.email);
 if(!user)fail(401,'Adresse email ou code de récupération incorrect.');
 const hash=await hashPassword(data.password),session=await newSession();
 if(!await recoverAccount(c.env.DB,user.id,await digest(data.code.trim()),hash,session))fail(401,'Adresse email ou code de récupération incorrect.');
 sessionCookie(c,session.token);return c.json({user:visible(user)});
});
// Compatibility exists only for accounts that have not yet enrolled an email.
auth.post('/legacy-login',async c=>{
 const {username,password}=legacyCredentials.parse(await jsonBody(c));
 await rateLimit(c.env,`login-ip:${c.req.header('CF-Connecting-IP')||'local'}`,40);
 await rateLimit(c.env,`login-legacy:${username.toLowerCase()}`,12);
 const user=await one<User>(c.env,'SELECT * FROM users WHERE username=? AND email IS NULL AND deleted_at IS NULL',username);
 const valid=user?await verifyPassword(password,user.password_hash):(await hashPassword(password),false);
 if(!user||!valid)fail(401,'Ancien identifiant ou mot de passe incorrect. Si une adresse a déjà été ajoutée, utilisez la connexion par email.');
 const session=await newSession();if(!await createSession(c.env.DB,user.id,user.password_hash,session,true))fail(401,'Reconnectez-vous avec vos accès actuels.');
 sessionCookie(c,session.token);return c.json({user:visible(user)});
});
auth.post('/legacy-recover',async c=>{
 await rateLimit(c.env,`recover:${c.req.header('CF-Connecting-IP')||'local'}`,8);
 const data=legacyCredentials.extend({password:newPassword,code:z.string().min(20).max(80)}).parse(await jsonBody(c));
 await rateLimit(c.env,`recover-legacy:${data.username.toLowerCase()}`,8);
 const user=await one<User>(c.env,'SELECT * FROM users WHERE username=? AND email IS NULL AND deleted_at IS NULL',data.username);
 if(!user)fail(401,'Ancien identifiant ou code de récupération incorrect.');
 const hash=await hashPassword(data.password),session=await newSession();
 if(!await recoverAccount(c.env.DB,user.id,await digest(data.code.trim()),hash,session,true))fail(401,'Ancien identifiant ou code de récupération incorrect.');
 sessionCookie(c,session.token);return c.json({user:visible(user)});
});
// Ending a session must also succeed after expiry/revocation or without a cookie,
// otherwise an offline logout marker could block the next startup indefinitely.
// The application-wide exact Origin check still protects this POST from CSRF.
auth.post('/logout',async c=>{
 const token=getCookie(c,'atelier_session');
 const ended=await revokeSession(c.env.DB,token?await digest(token):null,c.req.header('X-Atelier-Account'));
 if(!ended)fail(401,'Un autre compte est maintenant connecté. Sa session n’a pas été fermée.');
 deleteCookie(c,'atelier_session',{path:'/'});return c.json({ok:true});
});
auth.use('*',requireAuth);
auth.get('/me',c=>c.json({user:visible(c.get('user'))}));
auth.post('/email',async c=>{
 const data=z.object({email:emailField,password:z.string().min(1).max(128)}).parse(await jsonBody(c));
 const user=c.get('user');await rateLimit(c.env,`email-enroll:${user.id}`,8);
 if(user.email!==null)fail(409,'Une adresse de connexion est déjà associée à ce compte.');
 if(!await verifyPassword(data.password,user.password_hash))fail(403,'Mot de passe incorrect.');
 const session=await newSession();
 try{if(!await enrollEmail(c.env.DB,user.id,user.password_hash,data.email,session))fail(409,'Le compte a changé. Reconnectez-vous avant d’ajouter une adresse.');}
 catch(error){if(await one(c.env,'SELECT id FROM users WHERE email=? AND id<>?',data.email,user.id))fail(409,'Cette adresse email est indisponible.');throw error;}
 sessionCookie(c,session.token);return c.json({user:visible({...user,email:data.email})});
});
auth.post('/logout-all',async c=>{await run(c.env,'DELETE FROM sessions WHERE user_id=?',c.get('user').id);deleteCookie(c,'atelier_session',{path:'/'});return c.json({ok:true});});
auth.post('/password',async c=>{
 const data=z.object({currentPassword:z.string().max(128),newPassword}).parse(await jsonBody(c));
 await rateLimit(c.env,`password:${c.get('user').id}`,8);
 if(!await verifyPassword(data.currentPassword,c.get('user').password_hash))fail(403,'Mot de passe actuel incorrect.');
 const session=await newSession(),hash=await hashPassword(data.newPassword);
 if(!await changePassword(c.env.DB,c.get('user').id,c.get('user').password_hash,hash,session))fail(409,'Le mot de passe a changé pendant cette opération. Reconnectez-vous avec le mot de passe actuel.');
 sessionCookie(c,session.token);return c.json({ok:true});
});
auth.patch('/preferences',async c=>{const d=z.object({monthly_tokens:z.number().int().min(100).max(10000000)}).parse(await jsonBody(c));await run(c.env,'UPDATE users SET monthly_tokens=? WHERE id=?',d.monthly_tokens,c.get('user').id);return c.json({ok:true});});
