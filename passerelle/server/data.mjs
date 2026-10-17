import { all, one, run, statement, uid, now, text, integer, sha, fail, spaceFor } from './core.mjs';

export async function createSpace(env, owner, body) {
  const item = { id: uid(), name: text(body.name, 'nom', 100).trim(), context: '', revision: 1, shared: 0, created_at: now() };
  // The limit and insert share one statement, so concurrent requests cannot exceed it.
  const results = await env.DB.batch([
    statement(env, 'INSERT INTO bridge_spaces(id,owner_id,name,created_at,updated_at) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM bridge_spaces WHERE owner_id=?)<50', item.id, owner, item.name, item.created_at, item.created_at, owner),
    statement(env, 'INSERT INTO bridge_context_versions(space_id,revision,content,created_at) SELECT id,1,context,created_at FROM bridge_spaces WHERE id=? AND owner_id=?', item.id, owner),
  ]);
  if (!results[0].meta.changes) fail(409, 'La limite de 50 espaces est atteinte. Exportez puis supprimez un espace inutilisé.');
  return { ...item, updated_at: item.created_at };
}
export async function updateSpace(env, owner, id, body) {
  const current = await spaceFor(env, owner, id);
  const revision = integer(body.revision, 0);
  if (!revision) fail(400, 'La version à modifier est nécessaire.');
  const name = body.name === undefined ? current.name : text(body.name, 'nom', 100).trim();
  const content = body.context === undefined ? current.context : text(body.context, 'contexte', 24000, true);
  if (body.shared !== undefined && typeof body.shared !== 'boolean') fail(400, 'Choisissez si cet espace est partagé.');
  const shared = body.shared === undefined ? current.shared : Number(body.shared);
  const stamp = now();
  // Trigger creates a snapshot only after a successful CAS, in the same transaction.
  const updated = await one(env, 'UPDATE bridge_spaces SET name=?,context=?,shared=?,revision=revision+1,updated_at=? WHERE id=? AND owner_id=? AND revision=? RETURNING *', name, content, shared, stamp, id, owner, revision);
  if (!updated) fail(409, 'Cet espace a changé sur un autre appareil. Votre saisie est conservée : rechargez la version récente avant de réessayer.');
  return updated;
}
export async function putHandoff(env, owner, id, body, author = 'Vous', shared = false) {
  await spaceFor(env, owner, id, shared);
  const title = text(body.title, 'titre', 160).trim();
  const content = text(body.content, 'message', 20000);
  const recipient = text(body.recipient || 'Tous', 'destinataire', 40);
  if (!['Tous', 'Claude', 'Claude Code', 'ChatGPT', 'Codex'].includes(recipient)) fail(400, 'Choisissez un assistant dans la liste.');
  const operation = text(body.operation_id, 'identifiant de l’opération', 100);
  const hash = await sha(JSON.stringify({ title, content, recipient, author }));
  const readSaved = () => one(env, 'SELECT h.* FROM bridge_handoffs h JOIN bridge_spaces s ON s.id=h.space_id WHERE h.space_id=? AND h.operation_id=? AND s.owner_id=? AND (?=0 OR s.shared=1)', id, operation, owner, Number(shared));
  const idempotent = await readSaved();
  if (idempotent) { if (idempotent.content_hash !== hash) fail(409, 'Cet identifiant a déjà été utilisé pour un autre relais.'); return idempotent; }
  const item = { id: uid(), space_id: id, title, content, recipient, author, created_at: now() };
  // Recheck permission in the write itself: sharing may have been withdrawn since the read.
  // INSERT ... SELECT also enforces the size limit atomically; the unique key handles reconnects.
  await run(env, 'INSERT INTO bridge_handoffs(id,space_id,title,content,author,recipient,operation_id,content_hash,created_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM bridge_spaces WHERE id=? AND owner_id=? AND (?=0 OR shared=1)) AND (SELECT count(*) FROM bridge_handoffs WHERE space_id=?)<2000 ON CONFLICT(space_id,operation_id) DO NOTHING', item.id, id, title, content, author, recipient, operation, hash, item.created_at, id, owner, Number(shared), id);
  const saved = await readSaved();
  if (!saved) {
    await spaceFor(env, owner, id, shared);
    fail(507, 'La limite de 2 000 relais pour cet espace est atteinte. Exportez vos données avant de libérer de la place.');
  }
  if (saved.content_hash !== hash) fail(409, 'Un autre relais utilise déjà cet identifiant.');
  return saved;
}
export async function importConversation(env, owner, id, body) {
  await spaceFor(env, owner, id);
  const source = text(body.source_key, 'référence de l’import', 200);
  const title = text(body.title, 'titre', 200);
  const provider = text(body.provider, 'origine', 40);
  const missing = text(body.missing, 'limites de l’import', 2000, true);
  if (!Array.isArray(body.messages) || body.messages.length > 40 || !body.messages.length) fail(400, 'Un lot doit contenir entre 1 et 40 messages.');
  const parsed = [], seen = new Map();
  let duplicates = 0;
  for (const message of body.messages) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) fail(400, 'Chaque message importé doit être un objet JSON.');
    const content = text(message.content, 'message', 60000);
    const role = text(message.role, 'auteur', 80);
    const sourceKey = text(message.source_key, 'référence du message', 200);
    const date = text(message.original_date, 'date', 100, true);
    const parent = text(message.parent_source_key, 'message précédent', 200, true);
    const hash = await sha(JSON.stringify({ content, role, date, parent }));
    if (seen.has(sourceKey)) {
      if (seen.get(sourceKey) !== hash) fail(409, 'Ce lot contient plusieurs versions différentes du même message. Aucun message du lot n’a été importé.');
      duplicates++; continue;
    }
    seen.set(sourceKey, hash);
    parsed.push({ content, role, sourceKey, date, parent, hash });
  }
  const existing = await one(env, 'SELECT id FROM bridge_conversations WHERE space_id=? AND source_key=?', id, source);
  const conversationId = existing?.id || uid();
  const commands = [];
  if (!existing) commands.push(statement(env, 'INSERT INTO bridge_conversations(id,space_id,source_key,provider,title,imported_at,missing) VALUES(?,?,?,?,?,?,?)', conversationId, id, source, provider, title, now(), missing));
  let alreadyImported = 0;
  for (const message of parsed) {
    const old = existing && await one(env, 'SELECT content_hash FROM bridge_messages WHERE conversation_id=? AND source_key=?', conversationId, message.sourceKey);
    if (old) {
      if (old.content_hash !== message.hash) fail(409, 'Une version différente de ce message est déjà importée. Importez cet export dans un nouvel espace pour conserver les deux versions.');
      duplicates++; alreadyImported++; continue;
    }
    commands.push(statement(env, 'INSERT INTO bridge_messages(id,owner_id,conversation_id,source_key,role,content,original_date,parent_source_key,content_hash) VALUES(?,?,?,?,?,?,?,?,?)', uid(), owner, conversationId, message.sourceKey, message.role, message.content, message.date || null, message.parent || null, message.hash));
  }
  // The whole batch is atomic. A trigger also protects the per-owner quota under concurrency.
  try { if (commands.length) await env.DB.batch(commands); }
  catch (error) {
    if (String(error).includes('storage_limit')) fail(507, 'Le stockage texte de ce compte est plein (50 Mo). Aucun ancien contenu n’a été effacé.');
    if (String(error).includes('UNIQUE')) fail(409, 'Un import simultané a modifié cet historique. Réessayez le lot : les doublons seront reconnus.');
    throw error;
  }
  return { id: conversationId, imported: parsed.length - alreadyImported, duplicates };
}
export async function search(env, owner, query, shared = false, space = null) {
  const q = text(query, 'recherche', 120).replace(/[!%_]/g, '!$&');
  const args = [owner, `%${q}%`];
  const extra = `${shared ? ' AND s.shared=1' : ''}${space ? ' AND s.id=?' : ''}`;
  if (space) args.push(space);
  const messages = await all(env, `SELECT m.id,m.role,substr(m.content,1,600) AS excerpt,c.id AS conversation_id,c.title,c.provider,s.id AS space_id,s.name AS space_name FROM bridge_messages m JOIN bridge_conversations c ON c.id=m.conversation_id JOIN bridge_spaces s ON s.id=c.space_id WHERE s.owner_id=? AND m.content LIKE ? ESCAPE '!' ${extra} ORDER BY m.seq DESC LIMIT 30`, ...args);
  const handoffs = await all(env, `SELECT h.id,h.title,substr(h.content,1,600) AS excerpt,h.author,s.id AS space_id,s.name AS space_name FROM bridge_handoffs h JOIN bridge_spaces s ON s.id=h.space_id WHERE s.owner_id=? AND (h.content || h.title) LIKE ? ESCAPE '!' ${extra} ORDER BY h.seq DESC LIMIT 20`, ...args);
  return { messages, handoffs, notice: 'Résultats limités à 50 éléments. Affinez la recherche pour retrouver d’autres passages.' };
}
