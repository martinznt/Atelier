/** Atomic account mutations. D1 batch statements commit together or roll back. */
export interface SessionRecord { tokenHash:string; createdAt:string; expiresAt:string }

export async function createSession(db:D1Database,userId:string,passwordHash:string,session:SessionRecord):Promise<boolean> {
 const result=await db.prepare(`INSERT INTO sessions(token_hash,user_id,created_at,expires_at)
  SELECT ?,id,?,? FROM users WHERE id=? AND password_hash=? AND deleted_at IS NULL`)
  .bind(session.tokenHash,session.createdAt,session.expiresAt,userId,passwordHash).run();
 return result.meta.changes===1;
}

export async function recoverAccount(db:D1Database,userId:string,codeHash:string,passwordHash:string,session:SessionRecord):Promise<boolean> {
 // Keep the one-use code until the last statement. Its presence authorizes every
 // mutation in this transaction, including session creation; a failed insert
 // therefore leaves both the old password and the recovery code intact.
 const authorized=`EXISTS(SELECT 1 FROM recovery_codes WHERE user_id=? AND code_hash=?)`;
 const updated=`EXISTS(SELECT 1 FROM users WHERE id=? AND password_hash=? AND deleted_at IS NULL)`;
 const result=await db.batch([
  db.prepare(`UPDATE users SET password_hash=? WHERE id=? AND deleted_at IS NULL AND ${authorized}`)
   .bind(passwordHash,userId,userId,codeHash),
  db.prepare(`DELETE FROM sessions WHERE user_id=? AND ${authorized} AND ${updated}`)
   .bind(userId,userId,codeHash,userId,passwordHash),
  db.prepare(`INSERT INTO sessions(token_hash,user_id,created_at,expires_at)
   SELECT ?,id,?,? FROM users WHERE id=? AND password_hash=? AND deleted_at IS NULL AND ${authorized}`)
   .bind(session.tokenHash,session.createdAt,session.expiresAt,userId,passwordHash,userId,codeHash),
  db.prepare(`DELETE FROM recovery_codes WHERE user_id=? AND code_hash=? AND ${updated}`)
   .bind(userId,codeHash,userId,passwordHash),
 ]);
 return result[0].meta.changes===1 && result[3].meta.changes===1;
}

export async function changePassword(db:D1Database,userId:string,previousHash:string,passwordHash:string,session:SessionRecord):Promise<boolean> {
 // Compare the exact hash that was verified, so a concurrent recovery/password
 // change cannot be overwritten by a request using the previous password.
 const updated=`EXISTS(SELECT 1 FROM users WHERE id=? AND password_hash=? AND deleted_at IS NULL)`;
 const result=await db.batch([
  db.prepare('UPDATE users SET password_hash=? WHERE id=? AND password_hash=? AND deleted_at IS NULL')
   .bind(passwordHash,userId,previousHash),
  db.prepare(`DELETE FROM sessions WHERE user_id=? AND ${updated}`).bind(userId,userId,passwordHash),
  db.prepare(`INSERT INTO sessions(token_hash,user_id,created_at,expires_at)
   SELECT ?,id,?,? FROM users WHERE id=? AND password_hash=? AND deleted_at IS NULL`)
   .bind(session.tokenHash,session.createdAt,session.expiresAt,userId,passwordHash),
  db.prepare(`INSERT INTO events(user_id,kind,detail,created_at)
   SELECT id,'security',?,? FROM users WHERE id=? AND password_hash=? AND deleted_at IS NULL`)
   .bind('Mot de passe modifié, autres sessions révoquées.',session.createdAt,userId,passwordHash),
 ]);
 return result[0].meta.changes===1;
}

export async function revokeSession(db:D1Database,tokenHash:string|null,expectedAccount?:string):Promise<boolean> {
 if(!tokenHash)return true;
 // An offline logout belongs to its original account. A cookie changed in another
 // tab must not revoke that tab's session or cause its browser cookie to be cleared.
 const results=await db.batch<{user_id:string}>([
  db.prepare('SELECT user_id FROM sessions WHERE token_hash=?').bind(tokenHash),
  db.prepare('DELETE FROM sessions WHERE token_hash=? AND (? IS NULL OR user_id=?)')
   .bind(tokenHash,expectedAccount??null,expectedAccount??null),
 ]);
 const current=results[0].results[0];
 return !current||expectedAccount===undefined||current.user_id===expectedAccount;
}
