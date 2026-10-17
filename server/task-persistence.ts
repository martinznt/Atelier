import type {Env} from './types.ts';

export interface PendingChatTask {
 id:string;
 userId:string;
 projectId:string;
 conversationId:string;
 idempotencyKey:string;
 requestHash:string;
 payload:string;
 context:string;
 messageId:string;
 message:string;
 reservation:number;
 createdAt:string;
}

export type PersistChatResult =
 | {kind:'created';id:string;status:'queued'}
 | {kind:'duplicate';id:string;status:string}
 | {kind:'conflict'|'budget'|'unavailable'};

/** D1 executes batch statements in one transaction. Nothing is queued before commit. */
export async function persistChatTask(env:Pick<Env,'DB'>, task:PendingChatTask):Promise<PersistChatResult> {
 const {DB}=env;
 const monthStart=task.createdAt.slice(0,7)+'-01T00:00:00.000Z';
 const result=await DB.batch([
  DB.prepare(`INSERT INTO tasks(id,user_id,project_id,conversation_id,idempotency_key,request_hash,payload,context,created_at,updated_at)
   SELECT ?,u.id,p.id,c.id,?,?,?,?,?,?
   FROM users u JOIN conversations c ON c.user_id=u.id JOIN projects p ON p.id=c.project_id AND p.user_id=u.id
   WHERE u.id=? AND u.deleted_at IS NULL AND c.id=? AND p.id=?
   AND u.monthly_tokens >= ? + COALESCE((SELECT SUM(CASE WHEN status IN ('queued','running')
    THEN json_extract(payload,'$.reservation') ELSE COALESCE(input_tokens,0)+COALESCE(output_tokens,0) END)
    FROM tasks WHERE user_id=u.id AND created_at>=?),0)
   ON CONFLICT(user_id,idempotency_key) DO NOTHING`).bind(
   task.id,task.idempotencyKey,task.requestHash,task.payload,task.context,task.createdAt,task.createdAt,
   task.userId,task.conversationId,task.projectId,task.reservation,monthStart),
  // A losing concurrent request has a different, fresh task.id: it cannot add another message.
  DB.prepare(`INSERT INTO messages(id,user_id,conversation_id,role,content,task_id,created_at)
   SELECT ?,user_id,conversation_id,'user',?,id,created_at FROM tasks WHERE id=? AND user_id=?`).bind(
   task.messageId,task.message,task.id,task.userId),
  DB.prepare(`UPDATE conversations SET updated_at=? WHERE id=? AND user_id=?
   AND EXISTS(SELECT 1 FROM tasks WHERE id=? AND user_id=?)`).bind(
   task.createdAt,task.conversationId,task.userId,task.id,task.userId),
  DB.prepare(`INSERT INTO events(user_id,project_id,task_id,kind,detail,created_at)
   SELECT user_id,project_id,id,'task',?,created_at FROM tasks WHERE id=? AND user_id=?`).bind(
   'Tâche enregistrée. Elle continuera côté serveur.',task.id,task.userId),
 ]);
 if(result[0].meta.changes) return {kind:'created',id:task.id,status:'queued'};

 // The first read in the HTTP handler is only a fast path. This read resolves races,
 // including retries after the original task has already reserved the remaining budget.
 const previous=await DB.prepare('SELECT id,status,request_hash FROM tasks WHERE user_id=? AND idempotency_key=?')
  .bind(task.userId,task.idempotencyKey).first<{id:string;status:string;request_hash:string}>();
 if(previous) return previous.request_hash===task.requestHash
  ? {kind:'duplicate',id:previous.id,status:previous.status}
  : {kind:'conflict'};
 const available=await DB.prepare(`SELECT c.id FROM conversations c JOIN projects p ON p.id=c.project_id
  JOIN users u ON u.id=c.user_id WHERE c.id=? AND p.id=? AND c.user_id=? AND p.user_id=u.id AND u.deleted_at IS NULL`)
  .bind(task.conversationId,task.projectId,task.userId).first();
 return {kind:available?'budget':'unavailable'};
}
