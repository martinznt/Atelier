import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { openDatabase } from '../scripts/sqlite.mjs';
import { oauthRequest, previewAuthorization, authorize, bearerIdentity, metadata } from '../server/oauth.mjs';

let env;
before(async () => {
  env = { DB: openDatabase(), APP_ORIGIN: 'https://atelier.test' };
  for (const migration of ['0001_initial.sql', '0002_shared_memory.sql', '0003_bridge_integration.sql']) env.DB.exec(await readFile(new URL(`../../migrations/${migration}`, import.meta.url), 'utf8'));
  for (const id of ['A', 'B']) await env.DB.prepare('INSERT INTO users(id,username,password_hash,created_at) VALUES(?,?,?,?)').bind(id, id, 'fixture-not-a-login-hash', new Date().toISOString()).run();
});
after(() => env.DB.close());
beforeEach(() => env.DB.exec('DELETE FROM bridge_auth_limits'));
async function request(path, body, json = false, headers = {}) {
  const result = await oauthRequest(new Request(`https://atelier.test/oauth/bridge/${path}`, { method: 'POST', headers: { 'Content-Type': json ? 'application/json' : 'application/x-www-form-urlencoded', ...headers }, body: json ? JSON.stringify(body) : new URLSearchParams(body) }), env);
  return { status: result.status, body: await result.json() };
}
async function registration() {
  const created = await request('register', { client_name: 'Client de test local', redirect_uris: ['https://client.test/callback'], token_endpoint_auth_method: 'none' }, true);
  assert.equal(created.status, 201); return created.body;
}
async function flow({ write = true, owner = 'A' } = {}) {
  const client = await registration(), verifier = 'a'.repeat(64);
  const challenge = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))).toString('base64url');
  const params = { client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', resource: 'https://atelier.test/mcp', state: 'stable-client-state', scope: 'bridge:read bridge:write offline_access' };
  const consent = await authorize(env, owner, { ...params, consent: true, assistant: 'Claude Code', allow_write: write });
  const uri = new URL(consent.redirect);
  assert.equal(uri.searchParams.get('state'), params.state);
  assert.equal(uri.searchParams.get('iss'), env.APP_ORIGIN);
  const exchange = { grant_type: 'authorization_code', code: uri.searchParams.get('code'), code_verifier: verifier, client_id: client.client_id, redirect_uri: params.redirect_uri, resource: params.resource };
  return { client, params, exchange };
}
test('OAuth : discovery, refus de callback dangereux et de PKCE simple', async () => {
  assert.deepEqual(metadata(env).code_challenge_methods_supported, ['S256']);
  assert.equal(metadata(env, true).resource, 'https://atelier.test/mcp');
  const bad = await request('register', { redirect_uris: ['javascript:alert(1)'] }, true);
  assert.equal(bad.status, 400);
  const client = await registration();
  await assert.rejects(previewAuthorization(env, { client_id: client.client_id, redirect_uri: 'https://evil.test/steal' }), /retour/);
  await assert.rejects(previewAuthorization(env, { client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: 'code', code_challenge_method: 'plain', code_challenge: 'x'.repeat(43) }), /PKCE/);
});
test('Code : lié au client, au retour, à la ressource et à PKCE ; utilisé une seule fois', async () => {
  const { exchange } = await flow();
  assert.equal((await request('token', { ...exchange, code_verifier: 'b'.repeat(64) })).body.error, 'invalid_grant');
  assert.equal((await request('token', { ...exchange, resource: 'https://evil.test/mcp' })).body.error, 'invalid_target');
  assert.equal((await request('token', { ...exchange, redirect_uri: 'https://evil.test/callback' })).body.error, 'invalid_grant');
  const other = await registration();
  assert.equal((await request('token', { ...exchange, client_id: other.client_id })).body.error, 'invalid_grant');
  const issued = await request('token', exchange);
  assert.equal(issued.status, 200); assert.ok(issued.body.access_token); assert.ok(issued.body.refresh_token);
  assert.equal((await request('token', exchange)).body.error, 'invalid_grant');
  const identity = await bearerIdentity(new Request('https://atelier.test/mcp', { headers: { Authorization: `Bearer ${issued.body.access_token}` } }), env);
  assert.equal(identity.user_id, 'A'); assert.equal(identity.write, true);
});
test('Consentement : refuser ne délivre aucun code ; lecture seule conservée', async () => {
  const { params, exchange } = await flow({ write: false });
  const denied = await authorize(env, 'A', { ...params, deny: true });
  assert.equal(new URL(denied.redirect).searchParams.get('error'), 'access_denied');
  assert.equal(new URL(denied.redirect).searchParams.has('code'), false);
  const issued = await request('token', exchange);
  assert.equal(issued.body.scope.includes('bridge:write'), false);
  const identity = await bearerIdentity(new Request('https://atelier.test/mcp', { headers: { Authorization: `Bearer ${issued.body.access_token}` } }), env);
  assert.equal(identity.write, false);
});
test('Renouvellement : rotation, détection du rejeu et révocation de toute la connexion', async () => {
  const { exchange, client } = await flow();
  const first = await request('token', exchange);
  const params = { grant_type: 'refresh_token', client_id: client.client_id, resource: exchange.resource, refresh_token: first.body.refresh_token };
  const second = await request('token', params);
  assert.equal(second.status, 200); assert.notEqual(first.body.refresh_token, second.body.refresh_token);
  const replay = await request('token', params);
  assert.equal(replay.body.error, 'invalid_grant');
  assert.equal(await bearerIdentity(new Request('https://atelier.test/mcp', { headers: { Authorization: `Bearer ${second.body.access_token}` } }), env), null);
});
test('Expiration, révocation explicite et suppression de compte rendent les accès inutilisables', async () => {
  const { exchange, client } = await flow({ owner: 'B' });
  const issued = await request('token', exchange);
  const authRequest = new Request('https://atelier.test/mcp', { headers: { Authorization: `Bearer ${issued.body.access_token}` } });
  await env.DB.prepare('UPDATE bridge_oauth_tokens SET expires_at=? WHERE grant_id IN (SELECT id FROM bridge_oauth_grants WHERE client_id=?)').bind('2000-01-01T00:00:00.000Z', client.client_id).run();
  assert.equal(await bearerIdentity(authRequest, env), null);
  const next = await flow({ owner: 'B' }), active = await request('token', next.exchange);
  assert.equal((await request('revoke', { client_id: next.client.client_id, token: active.body.access_token })).status, 200);
  assert.equal(await bearerIdentity(new Request('https://atelier.test/mcp', { headers: { Authorization: `Bearer ${active.body.access_token}` } }), env), null);
  const last = await flow({ owner: 'B' }), lastToken = await request('token', last.exchange);
  await env.DB.prepare('UPDATE users SET deleted_at=? WHERE id=?').bind(new Date().toISOString(), 'B').run();
  assert.equal(await bearerIdentity(new Request('https://atelier.test/mcp', { headers: { Authorization: `Bearer ${lastToken.body.access_token}` } }), env), null);
});
test('OAuth : métadonnées malformées, paramètres répétés et authentifications ambiguës refusés', async () => {
  for (const metadata of [{ grant_types: 'authorization_code' }, { response_types: { code: true } }, { grant_types: [] }, { response_types: [] }, { grant_types: ['refresh_token'] }]) {
    const rejected = await request('register', { redirect_uris: ['https://client.test/callback'], ...metadata }, true);
    assert.equal(rejected.status, 400); assert.equal(rejected.body.error, 'invalid_client_metadata');
  }
  const { exchange } = await flow();
  const duplicate = new URLSearchParams(exchange); duplicate.append('code', exchange.code);
  const rejected = await request('token', duplicate);
  assert.equal(rejected.status, 400); assert.equal(rejected.body.error, 'invalid_request');
  assert.equal((await request('token', exchange)).status, 200);
  const confidential = (await request('register', { redirect_uris: ['https://client.test/callback'], token_endpoint_auth_method: 'client_secret_basic' }, true)).body;
  const mixed = await request('token', { ...exchange, client_id: confidential.client_id, client_secret: confidential.client_secret }, false, { Authorization: `Basic ${btoa(`${confidential.client_id}:${confidential.client_secret}`)}` });
  assert.equal(mixed.status, 400); assert.equal(mixed.body.error, 'invalid_request');
});
test('Renouvellements simultanés : un seul échange réussit et le rejeu révoque la famille', async () => {
  const { exchange, client } = await flow();
  const issued = await request('token', exchange);
  const params = { grant_type: 'refresh_token', client_id: client.client_id, resource: exchange.resource, refresh_token: issued.body.refresh_token };
  // Both requests really read the unused SQLite token before either can consume it.
  // Only their scheduling is controlled; every SQL statement uses the real adapter.
  const db = env.DB; let reads = 0, release;
  const bothRead = new Promise(resolve => { release = resolve; });
  const wrap = (statement, sql) => new Proxy(statement, { get(target, key) {
    if (key === 'bind') return (...values) => wrap(target.bind(...values), sql);
    if (key === 'first' && sql.startsWith('SELECT t.*,g.client_id')) return async () => {
      const row = await target.first(); reads++; if (reads === 2) release(); await bothRead; return row;
    };
    const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
  } });
  env.DB = { ...db, prepare: sql => wrap(db.prepare(sql), sql) };
  let results;
  try { results = await Promise.all([request('token', params), request('token', params)]); }
  finally { env.DB = db; }
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
  const accepted = results.find(r => r.status === 200).body;
  assert.equal(await bearerIdentity(new Request('https://atelier.test/mcp', { headers: { Authorization: `Bearer ${accepted.access_token}` } }), env), null);
  assert.equal((await request('token', { ...params, refresh_token: accepted.refresh_token })).body.error, 'invalid_grant');
});
