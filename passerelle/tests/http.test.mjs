import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { handle } from '../server/app.mjs';
import { openDatabase } from '../scripts/sqlite.mjs';

let env;
before(async () => {
  env = { DB: openDatabase(), ASSETS: { fetch: () => new Response('shell') } };
  env.DB.exec(await readFile(new URL('../migrations/0001_bridge.sql', import.meta.url), 'utf8'));
});
after(() => env.DB.close());
async function req(path, { user = 'A', method = 'GET', body, origin = 'https://atelier.test', raw = false } = {}) {
  const response = await handle(new Request(`https://atelier.test${path}`, { method, headers: { ...(user ? { 'oai-authenticated-user-id': user } : {}), Origin: origin, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  return { status: response.status, headers: response.headers, body: raw ? await response.text() : await response.json() };
}
async function space(user = 'A') { return (await req('/api/spaces', { user, method: 'POST', body: { name: `Espace ${user}` } })).body; }
async function rpc(name, args, user = 'A') { return req('/mcp', { user, method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } } }); }
const fixture = { source_key: 'Claude:1', provider: 'Claude', title: 'Historique privé', messages: [{ source_key: 'm1', role: 'user', content: 'Le mot recherché est azalée.', original_date: '2026-10-14T12:00:00.000Z' }] };

test('Authentification obligatoire et mutations refusées depuis une autre origine', async () => {
  assert.equal((await req('/api/spaces', { user: null })).status, 401);
  assert.equal((await req('/api/spaces', { method: 'POST', origin: 'https://evil.test', body: { name: 'no' } })).status, 403);
  const response = await req('/api/spaces');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('A ne peut pas accéder aux espaces, exports, imports ou relais de B', async () => {
  const b = await space('B');
  for (const path of ['', '/handoffs', '/conversations', '/context-history', '/export']) assert.equal((await req(`/api/spaces/${b.id}${path}`)).status, 404);
  assert.equal((await req(`/api/spaces/${b.id}`, { method: 'PATCH', body: { revision: 1, shared: true } })).status, 404);
  assert.equal((await req(`/api/spaces/${b.id}/import`, { method: 'POST', body: fixture })).status, 404);
  assert.equal((await req(`/api/spaces/${b.id}`, { method: 'DELETE', body: { confirm_name: b.name } })).status, 404);
});
test('Contexte : conflit de version sans perte, historique immuable', async () => {
  const s = await space();
  const first = await req(`/api/spaces/${s.id}`, { method: 'PATCH', body: { revision: 1, context: 'Décision récente' } });
  assert.equal(first.status, 200); assert.equal(first.body.revision, 2);
  assert.equal((await req(`/api/spaces/${s.id}`, { method: 'PATCH', body: { revision: 1, context: 'Périmée' } })).status, 409);
  const history = await req(`/api/spaces/${s.id}/context-history`);
  assert.equal(history.body.items.length, 2); assert.equal(history.body.items[0].content, 'Décision récente');
  await assert.rejects(env.DB.prepare('UPDATE bridge_context_versions SET content=? WHERE space_id=?').bind('overwrite', s.id).run(), /immutable/);
});
test('Relais : idempotence après reconnexion et conflit si le contenu change', async () => {
  const s = await space(), payload = { title: 'Suite', content: 'Faire vérifier les tests', recipient: 'Codex', operation_id: 'stable-id' };
  const first = await req(`/api/spaces/${s.id}/handoffs`, { method: 'POST', body: payload });
  const repeat = await req(`/api/spaces/${s.id}/handoffs`, { method: 'POST', body: payload });
  assert.equal(first.body.id, repeat.body.id);
  assert.equal((await req(`/api/spaces/${s.id}/handoffs`, { method: 'POST', body: { ...payload, content: 'Different' } })).status, 409);
  assert.equal((await req(`/api/spaces/${s.id}/handoffs`)).body.items.length, 1);
});
test('Imports : persistants, sans doublon, conflits refusés et permissions sur les messages', async () => {
  const s = await space();
  const first = await req(`/api/spaces/${s.id}/import`, { method: 'POST', body: fixture });
  assert.equal(first.status, 201); assert.equal(first.body.imported, 1);
  const twice = await req(`/api/spaces/${s.id}/import`, { method: 'POST', body: fixture });
  assert.equal(twice.body.duplicates, 1);
  assert.equal((await req(`/api/conversations/${first.body.id}`, { user: 'B' })).status, 404);
  const modified = { ...fixture, messages: [{ ...fixture.messages[0], content: 'Modifié' }] };
  assert.equal((await req(`/api/spaces/${s.id}/import`, { method: 'POST', body: modified })).status, 409);
  const exported = await req(`/api/spaces/${s.id}/export`, { raw: true });
  const lines = exported.body.trim().split('\n').map(JSON.parse);
  assert.equal(lines.filter(l => l.type === 'messages')[0].data.content, fixture.messages[0].content);
  assert.ok(!exported.body.includes('owner_id'));
});
test('MCP : découverte sans données privées et outils protégés', async () => {
  const init = await req('/mcp', { user: null, method: 'POST', body: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } } });
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.equal((await rpc('list_spaces', {}, null)).status, 401);
  const listed = await req('/mcp', { user: null, method: 'POST', body: { jsonrpc: '2.0', id: 2, method: 'tools/list' } });
  assert.equal(listed.body.result.tools.length, 8);
  assert.equal(listed.body.result.tools.find(t => t.name === 'write_handoff').annotations.readOnlyHint, false);
});
test('MCP : partage explicite, recherche filtrée, retrait immédiatement effectif', async () => {
  const s = await space();
  const imported = await req(`/api/spaces/${s.id}/import`, { method: 'POST', body: fixture });
  const before = await rpc('read_context', { space_id: s.id });
  assert.equal(before.body.result.isError, true);
  await req(`/api/spaces/${s.id}`, { method: 'PATCH', body: { revision: 1, shared: true } });
  const found = await rpc('search', { query: 'azalée' });
  assert.ok(found.body.result.structuredContent.results.length > 0);
  const passage = found.body.result.structuredContent.results.find(r => r.url.includes(imported.body.id));
  assert.ok(passage);
  assert.equal((await rpc('fetch', { id: passage.id }, 'B')).body.result.isError, true);
  assert.equal((await rpc('read_conversation', { conversation_id: imported.body.id }, 'B')).body.result.isError, true);
  await req(`/api/spaces/${s.id}`, { method: 'PATCH', body: { revision: 2, shared: false } });
  assert.equal((await rpc('fetch', { id: passage.id })).body.result.isError, true);
});
test('Stockage saturé : refus atomique, pas de suppression des anciens messages', async () => {
  const s = await space('Quota');
  await env.DB.prepare('INSERT INTO bridge_import_usage(owner_id,bytes) VALUES(?,?)').bind('Quota', 52428800).run();
  const result = await req(`/api/spaces/${s.id}/import`, { user: 'Quota', method: 'POST', body: fixture });
  assert.equal(result.status, 507);
  assert.equal((await req(`/api/spaces/${s.id}/conversations`, { user: 'Quota' })).body.items.length, 0);
});
test('Suppression explicite : cascade, disparition des résultats et quota libéré', async () => {
  const s = await space('Delete');
  const imported = await req(`/api/spaces/${s.id}/import`, { user: 'Delete', method: 'POST', body: fixture });
  assert.equal((await req(`/api/spaces/${s.id}`, { user: 'Delete', method: 'DELETE', body: { confirm_name: 'bad' } })).status, 400);
  assert.equal((await req(`/api/spaces/${s.id}`, { user: 'Delete', method: 'DELETE', body: { confirm_name: s.name } })).status, 200);
  assert.equal((await req(`/api/conversations/${imported.body.id}`, { user: 'Delete' })).status, 404);
  assert.equal((await req('/api/me', { user: 'Delete' })).body.import_bytes, 0);
});
test('Historique long : pagination sans perte, recherche dans les messages non chargés', async () => {
  const s = await space('Long');
  const messages = Array.from({ length: 65 }, (_, i) => ({ source_key: `long-${i}`, role: i % 2 ? 'assistant' : 'user', content: `Message ${i} ${i === 64 ? 'uniquefin' : 'contenu'}` }));
  const first = await req(`/api/spaces/${s.id}/import`, { user: 'Long', method: 'POST', body: { ...fixture, messages: messages.slice(0, 40) } });
  await req(`/api/spaces/${s.id}/import`, { user: 'Long', method: 'POST', body: { ...fixture, messages: messages.slice(40) } });
  const seen = []; let cursor = 0;
  do {
    const page = await req(`/api/conversations/${first.body.id}?after=${cursor}`, { user: 'Long' });
    assert.ok(page.body.items.length <= 30); seen.push(...page.body.items); cursor = page.body.next;
  } while (cursor !== null);
  assert.equal(seen.length, 65); assert.equal(new Set(seen.map(m => m.id)).size, 65);
  const found = await req(`/api/search?space=${s.id}&q=uniquefin`, { user: 'Long' });
  assert.equal(found.body.messages.length, 1);
  const literal = await req('/api/search?q=%25', { user: 'Long' });
  assert.equal(literal.body.messages.length, 0);
});
test('MCP en lecture seule : aucun outil de dépôt disponible ou exécutable', async () => {
  env.MCP_WRITE = false;
  try {
    const tools = await req('/mcp', { method: 'POST', body: { jsonrpc: '2.0', id: 2, method: 'tools/list' } });
    assert.equal(tools.body.result.tools.some(t => t.name === 'write_handoff'), false);
    const denied = await rpc('write_handoff', { space_id: 'inconnu' });
    assert.equal(denied.body.result.isError, true); assert.match(denied.body.result.content[0].text, /lecture seule/);
  } finally { delete env.MCP_WRITE; }
});
test('Deux créations simultanées ne peuvent pas dépasser la limite des espaces', async () => {
  for (let i = 0; i < 49; i++) await space('Concurrent');
  const results = await Promise.all([0, 1].map(i => req('/api/spaces', { user: 'Concurrent', method: 'POST', body: { name: `Dernier ${i}` } })));
  assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  const saved = await env.DB.prepare('SELECT count(*) AS n FROM bridge_spaces WHERE owner_id=?').bind('Concurrent').first();
  const snapshots = await env.DB.prepare('SELECT count(*) AS n FROM bridge_context_versions v JOIN bridge_spaces s ON s.id=v.space_id WHERE s.owner_id=?').bind('Concurrent').first();
  assert.equal(saved.n, 50); assert.equal(snapshots.n, 50);
});
test('Imports : lots malformés refusés et répétitions dans un même lot dédupliquées', async () => {
  const s = await space('Batch');
  for (const malformed of [null, [], 'message']) {
    const rejected = await req(`/api/spaces/${s.id}/import`, { user: 'Batch', method: 'POST', body: { ...fixture, messages: [malformed] } });
    assert.equal(rejected.status, 400);
  }
  const repeated = await req(`/api/spaces/${s.id}/import`, { user: 'Batch', method: 'POST', body: { ...fixture, messages: [fixture.messages[0], fixture.messages[0]] } });
  assert.equal(repeated.status, 201); assert.equal(repeated.body.imported, 1); assert.equal(repeated.body.duplicates, 1);
  const conflict = await req(`/api/spaces/${s.id}/import`, { user: 'Batch', method: 'POST', body: { ...fixture, source_key: 'conflict-batch', messages: [fixture.messages[0], { ...fixture.messages[0], content: 'Une autre version' }] } });
  assert.equal(conflict.status, 409);
  assert.equal((await req(`/api/spaces/${s.id}/conversations`, { user: 'Batch' })).body.items.length, 1);
});
test('Retirer le partage pendant un relais empêche son écriture par MCP', async () => {
  const s = await space('ShareRace');
  await req(`/api/spaces/${s.id}`, { user: 'ShareRace', method: 'PATCH', body: { revision: 1, shared: true } });
  const db = env.DB; let withdrawn = false;
  const wrap = (statement, sql) => new Proxy(statement, { get(target, key) {
    if (key === 'bind') return (...values) => wrap(target.bind(...values), sql);
    if (key === 'first' && sql.includes('FROM bridge_handoffs')) return async () => {
      if (!withdrawn) { withdrawn = true; await db.prepare('UPDATE bridge_spaces SET shared=0 WHERE id=?').bind(s.id).run(); }
      return target.first();
    };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  env.DB = { ...db, prepare: sql => wrap(db.prepare(sql), sql) };
  let response;
  try { response = await rpc('write_handoff', { space_id: s.id, title: 'Résultat', content: 'Une écriture devenue interdite', recipient: 'Codex', operation_id: 'share-race' }, 'ShareRace'); }
  finally { env.DB = db; }
  assert.equal(withdrawn, true); assert.equal(response.body.result.isError, true);
  assert.equal((await db.prepare('SELECT count(*) AS n FROM bridge_handoffs WHERE space_id=?').bind(s.id).first()).n, 0);
});
