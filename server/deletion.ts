import {many,one,run} from './core.ts';import type {Env} from './types.ts';
// Tombstones prevent new sessions and storage reservations. Delay deletion to
// allow in-flight uploads/calls to settle; each cron invocation can resume it.
export async function purgeDeletedAccounts(env:Env){
 const cutoff=new Date(Date.now()-5*60000).toISOString();const users=await many(env,'SELECT id FROM users WHERE deleted_at IS NOT NULL AND deleted_at<? LIMIT 10',cutoff);
 for(const user of users){
 if(await one(env,"SELECT id FROM tasks WHERE user_id=? AND status='running' LIMIT 1",user.id))continue;
 const objects=await env.FILES.list({prefix:`${user.id}/`,limit:500});
 if(objects.objects.length)await env.FILES.delete(objects.objects.map(o=>o.key));
 if(!objects.truncated)await run(env,'DELETE FROM users WHERE id=? AND deleted_at IS NOT NULL',user.id);
 }
}
