import { all, one, run, json, readJSON, identity, text, integer, fail, secure, spaceFor, HttpError } from './core.mjs';
import { createSpace, updateSpace, putHandoff, importConversation, search } from './data.mjs';
import { mcp } from './mcp.mjs';

export async function handle(request, env) {
  try { return secure(await route(request, env)); }
  catch (error) { return secure(json({ error: error instanceof HttpError ? error.message : 'L’opération n’a pas abouti. Votre saisie et les données déjà enregistrées restent conservées.' }, error instanceof HttpError ? error.status : 500)); }
}
async function route(request, env) {
  const url = new URL(request.url), path = url.pathname, method = request.method;
  if (path === '/api/health') return json({ status: 'ok', version: '0.2.0' });
  if (path === '/mcp') return mcp(request, env, request.headers.get('oai-authenticated-user-id'), url.origin);
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  const owner = identity(request);
  if (!['GET', 'HEAD'].includes(method) && request.headers.get('Origin') !== url.origin) fail(403, 'L’action doit être lancée depuis le site Atelier.');
  if (path === '/api/me' && method === 'GET') {
    const usage = await one(env, 'SELECT bytes FROM bridge_import_usage WHERE owner_id=?', owner);
    const calls = await all(env, 'SELECT tool,created_at FROM bridge_access_log WHERE owner_id=? ORDER BY seq DESC LIMIT 8', owner);
    return json({ id: owner, import_bytes: usage?.bytes || 0, import_limit: 52428800, calls, mcp_url: env.ATELIER_MCP_URL || null, platform: env.LOCAL_PREVIEW ? 'local' : 'sites' });
  }
  if (path === '/api/spaces' && method === 'GET') return json({ items: await all(env, 'SELECT id,name,context,revision,shared,created_at,updated_at FROM bridge_spaces WHERE owner_id=? ORDER BY updated_at DESC LIMIT 50', owner) });
  if (path === '/api/spaces' && method === 'POST') return json(await createSpace(env, owner, await readJSON(request)), 201);
  if (path === '/api/search' && method === 'GET') return json(await search(env, owner, url.searchParams.get('q'), false, url.searchParams.get('space')));
  const match = path.match(/^\/api\/spaces\/([^/]+)(?:\/(context-history|handoffs|conversations|import|export))?$/);
  if (match) {
    const id = decodeURIComponent(match[1]), action = match[2];
    const space = await spaceFor(env, owner, id);
    if (!action && method === 'GET') return json(space);
    if (!action && method === 'PATCH') return json(await updateSpace(env, owner, id, await readJSON(request)));
    if (!action && method === 'DELETE') {
      const body = await readJSON(request);
      if (body.confirm_name !== space.name) fail(400, 'Saisissez le nom exact de l’espace pour le supprimer.');
      await run(env, 'DELETE FROM bridge_spaces WHERE id=? AND owner_id=?', id, owner);
      return json({ deleted: true, notice: 'L’espace, ses imports, son contexte et ses relais ont été supprimés de cette base. Les copies déjà envoyées aux assistants et les sauvegardes ont leur propre cycle de conservation.' });
    }
    if (action === 'context-history' && method === 'GET') return json({ items: await all(env, 'SELECT revision,content,created_at FROM bridge_context_versions WHERE space_id=? AND revision<? ORDER BY revision DESC LIMIT 20', id, integer(url.searchParams.get('before'), Number.MAX_SAFE_INTEGER)) });
    if (action === 'handoffs' && method === 'POST') return json(await putHandoff(env, owner, id, await readJSON(request)), 201);
    if (action === 'handoffs' && method === 'GET') {
      const rows = await all(env, 'SELECT id,seq,title,content,author,recipient,created_at FROM bridge_handoffs WHERE space_id=? AND seq<? ORDER BY seq DESC LIMIT 31', id, integer(url.searchParams.get('before'), Number.MAX_SAFE_INTEGER));
      return json({ items: rows.slice(0, 30), next: rows.length > 30 ? rows[29].seq : null });
    }
    if (action === 'conversations' && method === 'GET') {
      const offset = integer(url.searchParams.get('offset'), 0, 1000000);
      const rows = await all(env, 'SELECT c.id,c.title,c.provider,c.imported_at,c.missing,(SELECT count(*) FROM bridge_messages m WHERE m.conversation_id=c.id) AS message_count FROM bridge_conversations c WHERE c.space_id=? ORDER BY c.imported_at DESC,c.id LIMIT 31 OFFSET ?', id, offset);
      return json({ items: rows.slice(0, 30), next: rows.length > 30 ? offset + 30 : null });
    }
    if (action === 'import' && method === 'POST') return json(await importConversation(env, owner, id, await readJSON(request)), 201);
    if (action === 'export' && method === 'GET') {
      // Paginated export stream, so the Worker does not retain the whole library in memory.
      const encoder = new TextEncoder();
      async function* records() {
            let count = 0;
            const limits = {};
            for (const table of ['context_versions', 'conversations', 'handoffs']) limits[table] = (await one(env, `SELECT coalesce(max(rowid),0) AS cutoff FROM bridge_${table} WHERE space_id=?`, id)).cutoff;
            limits.messages = (await one(env, 'SELECT coalesce(max(m.seq),0) AS cutoff FROM bridge_messages m JOIN bridge_conversations c ON c.id=m.conversation_id WHERE c.space_id=?', id)).cutoff;
            yield { type: 'space', space: { ...space, owner_id: undefined }, export_cutoffs: limits, exported_at: new Date().toISOString() };
            for (const table of ['context_versions', 'conversations', 'handoffs']) {
              let offset = 0;
              for (;;) {
                const rows = await all(env, `SELECT * FROM bridge_${table} WHERE space_id=? AND rowid<=? ORDER BY rowid LIMIT 30 OFFSET ?`, id, limits[table], offset);
                for (const row of rows) { count++; yield { type: table, data: row }; }
                if (rows.length < 30) break; offset += 30;
              }
            }
            let cursor = 0;
            for (;;) {
              const rows = await all(env, 'SELECT m.* FROM bridge_messages m JOIN bridge_conversations c ON c.id=m.conversation_id WHERE c.space_id=? AND m.seq>? AND m.seq<=? ORDER BY m.seq LIMIT 30', id, cursor, limits.messages);
              for (const row of rows) { count++; yield { type: 'messages', data: { ...row, owner_id: undefined } }; }
              if (rows.length < 30) break; cursor = rows.at(-1).seq;
            }
            yield { type: 'complete', records: count, notice: 'Export progressif borné aux références relevées au départ. Évitez les suppressions pendant cet export ; il ne remplace pas une sauvegarde transactionnelle.' };
      }
      const iterator = records();
      const stream = new ReadableStream({
        async pull(controller) {
          try { const next = await iterator.next(); if (next.done) controller.close(); else controller.enqueue(encoder.encode(JSON.stringify(next.value) + '\n')); }
          catch { controller.error(new Error('Export interrompu. Réessayez le téléchargement.')); }
        },
        async cancel() { await iterator.return(); },
      });
      return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Content-Disposition': 'attachment; filename="atelier-export.jsonl"', 'Cache-Control': 'no-store' } });
    }
  }
  const conversation = path.match(/^\/api\/conversations\/([^/]+)$/);
  if (conversation && method === 'GET') {
    const found = await one(env, 'SELECT c.* FROM bridge_conversations c JOIN bridge_spaces s ON s.id=c.space_id WHERE c.id=? AND s.owner_id=?', decodeURIComponent(conversation[1]), owner);
    if (!found) fail(404, 'Cette conversation est introuvable.');
    const rows = await all(env, 'SELECT seq,id,role,content,original_date,parent_source_key FROM bridge_messages WHERE conversation_id=? AND seq>? ORDER BY seq LIMIT 31', found.id, integer(url.searchParams.get('after'), 0));
    return json({ conversation: found, items: rows.slice(0, 30), next: rows.length > 30 ? rows[29].seq : null });
  }
  fail(404, 'Cette page ou cette opération est introuvable.');
}
