import {Hono} from 'hono';
import {z} from 'zod';
import {event,fail,jsonBody,many,now,one,owned,page,run,uid,userId} from '../core.ts';
import type {AppEnv} from '../types.ts';
export const projects=new Hono<AppEnv>();
const projectInput=z.object({name:z.string().trim().min(1).max(100),description:z.string().max(2000).default(''),instructions:z.string().max(12000).default(''),color:z.enum(['sage','amber','blue','rose']).default('sage')});
projects.get('/',async c=>{const {limit,offset}=page(c),q=`%${(c.req.query('q')||'').slice(0,120)}%`;return c.json({items:await many(c.env,'SELECT * FROM projects WHERE user_id=? AND (name LIKE ? OR description LIKE ?) AND archived=? ORDER BY favorite DESC,updated_at DESC,id LIMIT ? OFFSET ?',userId(c),q,q,c.req.query('archived')==='true'?1:0,limit,offset),limit,offset});});
projects.post('/',async c=>{const d=projectInput.parse(await jsonBody(c)),id=uid(),date=now();await run(c.env,'INSERT INTO projects(id,user_id,name,description,instructions,color,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',id,userId(c),d.name,d.description,d.instructions,d.color,date,date);await event(c.env,userId(c),'project',`Projet créé : ${d.name}`,id);return c.json(await owned(c.env,'projects',id,userId(c)),201);});
projects.get('/:id',async c=>c.json(await owned(c.env,'projects',c.req.param('id'),userId(c))));
projects.patch('/:id',async c=>{
 const d=projectInput.partial().extend({revision:z.number().int(),archived:z.boolean().optional(),favorite:z.boolean().optional()}).parse(await jsonBody(c));
 const p=await owned(c.env,'projects',c.req.param('id'),userId(c));
 const r=await run(c.env,'UPDATE projects SET name=?,description=?,instructions=?,color=?,archived=?,favorite=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?',d.name??p.name,d.description??p.description,d.instructions??p.instructions,d.color??p.color,d.archived===undefined?p.archived:Number(d.archived),d.favorite===undefined?p.favorite:Number(d.favorite),now(),p.id,userId(c),d.revision);
 if(!r.meta.changes)fail(409,'Ce projet a changé sur un autre appareil. Rechargez-le avant de réappliquer vos changements.');return c.json(await owned(c.env,'projects',p.id,userId(c)));
});
projects.delete('/:id',async c=>{
 const p=await owned(c.env,'projects',c.req.param('id'),userId(c));
 if(await one(c.env,"SELECT id FROM tasks WHERE project_id=? AND user_id=? AND status IN ('queued','running')",p.id,userId(c)))fail(409,'Arrêtez les tâches du projet avant de le supprimer.');
 // Contents and metadata are deleted in the same D1 transaction; external repositories remain unchanged.
 const versions=await many(c.env,'SELECT v.object_key,v.size FROM file_versions v JOIN files f ON f.id=v.file_id WHERE f.project_id=? AND f.user_id=?',p.id,userId(c));
 await c.env.DB.batch([c.env.DB.prepare('DELETE FROM projects WHERE id=? AND user_id=?').bind(p.id,userId(c)),c.env.DB.prepare('UPDATE users SET storage_used=MAX(0,storage_used-?) WHERE id=?').bind(versions.reduce((s,v)=>s+v.size,0),userId(c))]);return c.json({ok:true});
});

export const conversations=new Hono<AppEnv>();
conversations.get('/',async c=>{const {limit,offset}=page(c);return c.json({items:await many(c.env,'SELECT c.*,p.name AS project_name FROM conversations c JOIN projects p ON p.id=c.project_id WHERE c.user_id=? AND (? IS NULL OR c.project_id=?) ORDER BY c.updated_at DESC,c.id LIMIT ? OFFSET ?',userId(c),c.req.query('project')||null,c.req.query('project')||null,limit,offset),limit,offset});});
conversations.post('/',async c=>{const d=z.object({project_id:z.string().uuid(),title:z.string().trim().min(1).max(120),parent_id:z.string().uuid().optional()}).parse(await jsonBody(c));await owned(c.env,'projects',d.project_id,userId(c));if(d.parent_id){const parent=await owned(c.env,'conversations',d.parent_id,userId(c));if(parent.project_id!==d.project_id)fail(400,'La reprise doit rester dans le même projet.');}const id=uid(),date=now();await run(c.env,'INSERT INTO conversations(id,user_id,project_id,title,parent_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',id,userId(c),d.project_id,d.title,d.parent_id??null,date,date);return c.json(await owned(c.env,'conversations',id,userId(c)),201);});
conversations.get('/:id/messages',async c=>{await owned(c.env,'conversations',c.req.param('id'),userId(c));const {limit}=page(c);const before=Number(c.req.query('before')||Number.MAX_SAFE_INTEGER);const q=`%${(c.req.query('q')||'').slice(0,120)}%`;const items=await many(c.env,'SELECT * FROM messages WHERE user_id=? AND conversation_id=? AND seq<? AND content LIKE ? ORDER BY seq DESC LIMIT ?',userId(c),c.req.param('id'),before,q,limit+1);return c.json({items:items.slice(0,limit).reverse(),next:items.length>limit?items[limit-1].seq:null});});
conversations.post('/:id/notes',async c=>{const conversation=await owned(c.env,'conversations',c.req.param('id'),userId(c));const d=z.object({content:z.string().trim().min(1).max(12000)}).parse(await jsonBody(c));const id=uid();await run(c.env,'INSERT INTO messages(id,user_id,conversation_id,role,content,created_at) VALUES(?,?,?,?,?,?)',id,userId(c),conversation.id,'note',d.content,now());return c.json({id},201);});

export const memory=new Hono<AppEnv>();
const memoryInput=z.object({project_id:z.string().uuid().nullable().default(null),title:z.string().trim().min(1).max(140),content:z.string().min(1).max(12000),kind:z.enum(['note','decision','constraint','summary','preference']).default('note'),source:z.string().max(300).default('Saisie utilisateur'),pinned:z.boolean().default(false)});
memory.get('/',async c=>{const {limit,offset}=page(c);return c.json({items:await many(c.env,'SELECT * FROM memory WHERE user_id=? AND (project_id=? OR project_id IS NULL) ORDER BY pinned DESC,updated_at DESC,id LIMIT ? OFFSET ?',userId(c),c.req.query('project')||null,limit,offset),limit,offset});});
memory.post('/',async c=>{const d=memoryInput.parse(await jsonBody(c));if(d.project_id)await owned(c.env,'projects',d.project_id,userId(c));const id=uid(),date=now();await run(c.env,'INSERT INTO memory(id,user_id,project_id,title,content,kind,source,pinned,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,userId(c),d.project_id,d.title,d.content,d.kind,d.source,Number(d.pinned),date,date);return c.json(await owned(c.env,'memory',id,userId(c)),201);});
memory.patch('/:id',async c=>{
 const original=await owned(c.env,'memory',c.req.param('id'),userId(c));const d=memoryInput.omit({project_id:true}).partial().extend({revision:z.number().int()}).parse(await jsonBody(c));
 if(d.revision!==original.revision)fail(409,'Cette mémoire a changé. Rechargez-la avant de réappliquer votre correction.');
 const results=await c.env.DB.batch([
 c.env.DB.prepare('INSERT INTO memory_history(id,memory_id,user_id,content,title,revision,created_at) SELECT ?,id,user_id,content,title,revision,? FROM memory WHERE id=? AND user_id=? AND revision=?').bind(uid(),now(),original.id,userId(c),d.revision),
 c.env.DB.prepare('UPDATE memory SET title=?,content=?,kind=?,source=?,pinned=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=? AND revision=?').bind(d.title??original.title,d.content??original.content,d.kind??original.kind,d.source??original.source,d.pinned===undefined?original.pinned:Number(d.pinned),now(),original.id,userId(c),d.revision)]);
 if(!results[1].meta.changes)fail(409,'Une correction concurrente a été conservée. Rechargez la mémoire.');return c.json(await owned(c.env,'memory',original.id,userId(c)));
});
memory.get('/:id/history',async c=>{await owned(c.env,'memory',c.req.param('id'),userId(c));return c.json({items:await many(c.env,'SELECT * FROM memory_history WHERE memory_id=? AND user_id=? ORDER BY revision DESC',c.req.param('id'),userId(c))});});
memory.delete('/:id',async c=>{await owned(c.env,'memory',c.req.param('id'),userId(c));await run(c.env,'DELETE FROM memory WHERE id=? AND user_id=?',c.req.param('id'),userId(c));return c.json({ok:true});});
