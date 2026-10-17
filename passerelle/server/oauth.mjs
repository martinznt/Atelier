import { one, run, statement, sha, uid, now, text, readJSON, json, HttpError } from './core.mjs';

const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
const resource = env => `${env.APP_ORIGIN.replace(/\/$/, '')}/mcp`;
const scopes = value => {
  const parts = String(value || 'bridge:read bridge:write offline_access').split(/\s+/).filter(Boolean);
  if (parts.some(v => !['bridge:read', 'bridge:write', 'offline_access'].includes(v))) error('invalid_scope', 'Ce droit n’est pas pris en charge.');
  if (!parts.includes('bridge:read')) error('invalid_scope', 'Le droit de lecture est nécessaire.');
  return [...new Set(parts)].join(' ');
};
class OAuthError extends HttpError { constructor(code, message, status = 400) { super(status, message); this.code = code; } }
function error(code, message, status) { throw new OAuthError(code, message, status); }
function redirect(value) {
  let parsed; try { parsed = new URL(value); } catch { error('invalid_redirect_uri', 'Adresse de retour invalide.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (parsed.username || parsed.password || parsed.hash || !(parsed.protocol === 'https:' || (loopback && parsed.protocol === 'http:' && parsed.port))) error('invalid_redirect_uri', 'Le retour doit utiliser HTTPS ou un port local de connexion.');
  return parsed.href;
}
async function limit(env, request, kind, max = 60) {
  const key = await sha(`${kind}:${request.headers.get('CF-Connecting-IP') || 'local'}`);
  const current = Math.floor(Date.now() / 1000);
  const row = await one(env, 'INSERT INTO bridge_auth_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END,expires_at=CASE WHEN expires_at<? THEN ? ELSE expires_at END RETURNING count', key, current + 900, current, current, current + 900);
  if (row.count > max) error('temporarily_unavailable', 'Trop de tentatives. Réessayez dans quelques minutes.', 429);
}
function checkResource(env, value) { if (value !== resource(env)) error('invalid_target', 'La ressource demandée ne correspond pas à cette passerelle.'); }
async function authenticateClient(env, request, params) {
  const header = request.headers.get('Authorization');
  let id = params.client_id, secret = params.client_secret, method = secret ? 'client_secret_post' : 'none';
  if (header) {
    if (params.client_secret !== undefined) error('invalid_request', 'Utilisez une seule méthode d’authentification du client.');
    if (!header.startsWith('Basic ')) error('invalid_client', 'Authentification du client incorrecte.', 401);
    try { const basic = atob(header.slice(6)); const sep = basic.indexOf(':'); if (sep < 0) throw Error(); id = decodeURIComponent(basic.slice(0, sep)); secret = decodeURIComponent(basic.slice(sep + 1)); method = 'client_secret_basic'; }
    catch { error('invalid_client', 'Authentification du client incorrecte.', 401); }
  }
  const client = typeof id === 'string' && await one(env, 'SELECT * FROM bridge_oauth_clients WHERE id=?', id);
  if (!client || client.auth_method !== method) error('invalid_client', 'Ce client n’est pas reconnu.', 401);
  if (method !== 'none' && (typeof secret !== 'string' || secret.length > 300 || await sha(secret) !== client.secret_hash)) error('invalid_client', 'Ce client n’est pas reconnu.', 401);
  return client;
}
export async function previewAuthorization(env, params) {
  const client = await one(env, 'SELECT * FROM bridge_oauth_clients WHERE id=?', text(params.client_id, 'client', 200));
  if (!client) error('invalid_client', 'La connexion doit être recommencée depuis l’assistant.');
  const uri = redirect(text(params.redirect_uri, 'retour', 2048));
  if (!JSON.parse(client.redirects).includes(uri)) error('invalid_redirect_uri', 'Cette adresse de retour n’est pas enregistrée pour ce client.');
  if (params.response_type !== 'code' || params.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(params.code_challenge || '')) error('invalid_request', 'Cette connexion nécessite PKCE S256 et une réponse de type code.');
  checkResource(env, params.resource);
  text(params.state, 'état de connexion', 2000, true);
  return { client_id: client.id, client_name: client.name, redirect_uri: uri, redirect_origin: new URL(uri).origin, scope: scopes(params.scope), resource: resource(env), code_challenge: params.code_challenge, state: params.state || '', notice: 'Le nom du logiciel est déclaré par celui-ci. Vérifiez son adresse de retour. Il accédera aux espaces dont vous activez le partage, sans accès aux mots de passe ni aux connexions API.' };
}
export async function authorize(env, owner, body) {
  const validated = await previewAuthorization(env, body);
  const target = new URL(validated.redirect_uri);
  if (validated.state) target.searchParams.set('state', validated.state);
  target.searchParams.set('iss', env.APP_ORIGIN);
  if (body.deny === true) { target.searchParams.set('error', 'access_denied'); return { redirect: target.href }; }
  if (body.consent !== true) error('access_denied', 'Confirmez explicitement le partage avec cet assistant.');
  const assistant = text(body.assistant, 'assistant', 40);
  if (!['Claude', 'Claude Code', 'ChatGPT', 'Codex', 'Autre client MCP'].includes(assistant)) error('invalid_request', 'Choisissez l’assistant que vous connectez.');
  const granted = validated.scope.split(' ').filter(s => s !== 'bridge:write' || body.allow_write === true).join(' ');
  const grantId = uid(), code = token(), stamp = now();
  await env.DB.batch([
    statement(env, 'INSERT INTO bridge_oauth_grants(id,user_id,client_id,assistant,scope,resource,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)', grantId, owner, validated.client_id, assistant, granted, resource(env), stamp, new Date(Date.now() + 30 * 86400000).toISOString()),
    statement(env, 'INSERT INTO bridge_oauth_codes(hash,grant_id,redirect_uri,challenge,expires_at) VALUES(?,?,?,?,?)', await sha(code), grantId, validated.redirect_uri, validated.code_challenge, new Date(Date.now() + 300000).toISOString()),
  ]);
  target.searchParams.set('code', code);
  return { redirect: target.href };
}
async function issue(env, grant) {
  const access = token(), refresh = grant.scope.split(' ').includes('offline_access') ? token() : null;
  const expires = new Date(Math.min(Date.now() + 3600000, Date.parse(grant.expires_at))).toISOString();
  const statements = [statement(env, 'INSERT INTO bridge_oauth_tokens(hash,grant_id,kind,expires_at) VALUES(?,?,?,?)', await sha(access), grant.id, 'access', expires)];
  if (refresh) statements.push(statement(env, 'INSERT INTO bridge_oauth_tokens(hash,grant_id,kind,expires_at) VALUES(?,?,?,?)', await sha(refresh), grant.id, 'refresh', grant.expires_at));
  await env.DB.batch(statements);
  return { access_token: access, token_type: 'Bearer', expires_in: Math.max(0, Math.floor((Date.parse(expires) - Date.now()) / 1000)), scope: grant.scope, ...(refresh ? { refresh_token: refresh } : {}) };
}
export async function bearerIdentity(request, env) {
  const raw = request.headers.get('Authorization') || '';
  if (!/^Bearer [a-f0-9]{64}$/.test(raw)) return null;
  const grant = await one(env, 'SELECT g.* FROM bridge_oauth_tokens t JOIN bridge_oauth_grants g ON g.id=t.grant_id JOIN users u ON u.id=g.user_id WHERE t.hash=? AND t.kind=? AND t.expires_at>? AND g.expires_at>? AND g.revoked_at IS NULL AND u.deleted_at IS NULL', await sha(raw.slice(7)), 'access', now(), now());
  if (!grant || grant.resource !== resource(env)) return null;
  await run(env, 'UPDATE bridge_oauth_grants SET last_used_at=? WHERE id=?', now(), grant.id);
  return { user_id: grant.user_id, write: grant.scope.split(' ').includes('bridge:write'), assistant: grant.assistant };
}
export function metadata(env, protectedResource = false) {
  return protectedResource ? { resource: resource(env), authorization_servers: [env.APP_ORIGIN], scopes_supported: ['bridge:read', 'bridge:write', 'offline_access'], bearer_methods_supported: ['header'], resource_name: 'Atelier · Mémoire partagée' } : {
    issuer: env.APP_ORIGIN,
    authorization_endpoint: `${env.APP_ORIGIN}/oauth/bridge/authorize`,
    token_endpoint: `${env.APP_ORIGIN}/oauth/bridge/token`,
    registration_endpoint: `${env.APP_ORIGIN}/oauth/bridge/register`,
    revocation_endpoint: `${env.APP_ORIGIN}/oauth/bridge/revoke`,
    response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    revocation_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
    scopes_supported: ['bridge:read', 'bridge:write', 'offline_access'], code_challenge_methods_supported: ['S256'], authorization_response_iss_parameter_supported: true,
  };
}
export async function oauthRequest(request, env) {
  try { return await oauthRoute(request, env); }
  catch (e) { if (e instanceof OAuthError) return json({ error: e.code, error_description: e.message }, e.status); if (e instanceof HttpError) return json({ error: 'invalid_request', error_description: e.message }, e.status); throw e; }
}
async function oauthRoute(request, env) {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const path = new URL(request.url).pathname;
  if (path === '/oauth/bridge/register') {
    await limit(env, request, 'register', 20);
    const body = await readJSON(request, 16000);
    const name = text(body.client_name || 'Client MCP', 'nom du logiciel', 120);
    if (!Array.isArray(body.redirect_uris) || !body.redirect_uris.length || body.redirect_uris.length > 5) error('invalid_client_metadata', 'Fournissez entre une et cinq adresses de retour.');
    const uris = body.redirect_uris.map(v => redirect(text(v, 'adresse', 2048)));
    const method = body.token_endpoint_auth_method || 'client_secret_basic';
    if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) error('invalid_client_metadata', 'Méthode d’authentification non prise en charge.');
    if (body.grant_types !== undefined && (!Array.isArray(body.grant_types) || !body.grant_types.includes('authorization_code') || body.grant_types.some(t => !['authorization_code', 'refresh_token'].includes(t)))) error('invalid_client_metadata', 'Les types de flux doivent être une liste contenant authorization_code et, éventuellement, refresh_token.');
    if (body.response_types !== undefined && (!Array.isArray(body.response_types) || !body.response_types.length || body.response_types.some(t => t !== 'code'))) error('invalid_client_metadata', 'Le type de réponse doit être une liste contenant uniquement code.');
    const id = uid(), secret = method === 'none' ? null : token();
    await run(env, 'INSERT INTO bridge_oauth_clients(id,name,redirects,auth_method,secret_hash,created_at) VALUES(?,?,?,?,?,?)', id, name, JSON.stringify(uris), method, secret ? await sha(secret) : null, now());
    return json({ client_id: id, client_name: name, redirect_uris: uris, token_endpoint_auth_method: method, grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}) }, 201);
  }
  await limit(env, request, 'token');
  // OAuth clients send form data; a bounded read also protects requests without Content-Length.
  const form = new URLSearchParams(await boundedForm(request));
  const params = Object.create(null);
  for (const [key, value] of form) {
    if (Object.hasOwn(params, key)) error('invalid_request', 'Un paramètre OAuth ne peut pas être répété.');
    params[key] = value;
  }
  const client = await authenticateClient(env, request, params);
  if (path === '/oauth/bridge/revoke') {
    if (typeof params.token === 'string' && params.token.length <= 300) await run(env, 'UPDATE bridge_oauth_grants SET revoked_at=? WHERE client_id=? AND id IN (SELECT grant_id FROM bridge_oauth_tokens WHERE hash=?)', now(), client.id, await sha(params.token));
    return json({});
  }
  if (path !== '/oauth/bridge/token') error('invalid_request', 'Route OAuth inconnue.', 404);
  checkResource(env, params.resource);
  if (params.grant_type === 'authorization_code') {
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(params.code_verifier || '')) error('invalid_grant', 'La preuve de connexion est incorrecte.');
    if (!/^[a-f0-9]{64}$/.test(params.code || '')) error('invalid_grant', 'Code incorrect ou expiré.');
    const hash = await sha(params.code);
    const code = await one(env, 'SELECT * FROM bridge_oauth_codes WHERE hash=? AND used_at IS NULL AND expires_at>?', hash, now());
    const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(params.code_verifier))))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    if (!code || code.redirect_uri !== params.redirect_uri || code.challenge !== challenge) error('invalid_grant', 'La preuve, l’adresse de retour ou le code ne correspond pas.');
    const grant = await one(env, 'SELECT g.* FROM bridge_oauth_grants g JOIN users u ON u.id=g.user_id WHERE g.id=? AND g.client_id=? AND g.revoked_at IS NULL AND g.expires_at>? AND u.deleted_at IS NULL', code.grant_id, client.id, now());
    if (!grant || grant.resource !== resource(env)) error('invalid_grant', 'L’autorisation a expiré ou a été retirée.');
    const consumed = await run(env, 'UPDATE bridge_oauth_codes SET used_at=? WHERE hash=? AND used_at IS NULL', now(), hash);
    if (!consumed.meta.changes) error('invalid_grant', 'Ce code a déjà été utilisé.');
    return json(await issue(env, grant));
  }
  if (params.grant_type === 'refresh_token') {
    if (!/^[a-f0-9]{64}$/.test(params.refresh_token || '')) error('invalid_grant', 'Renouvellement incorrect.');
    const hash = await sha(params.refresh_token);
    const stored = await one(env, 'SELECT t.*,g.client_id FROM bridge_oauth_tokens t JOIN bridge_oauth_grants g ON g.id=t.grant_id WHERE t.hash=? AND t.kind=?', hash, 'refresh');
    if (!stored || stored.client_id !== client.id) error('invalid_grant', 'Renouvellement incorrect.');
    if (stored.used_at) { await run(env, 'UPDATE bridge_oauth_grants SET revoked_at=? WHERE id=?', now(), stored.grant_id); error('invalid_grant', 'Ce jeton a déjà été renouvelé. Reconnectez l’assistant.'); }
    const grant = await one(env, 'SELECT g.* FROM bridge_oauth_grants g JOIN users u ON u.id=g.user_id WHERE g.id=? AND g.revoked_at IS NULL AND g.expires_at>? AND u.deleted_at IS NULL', stored.grant_id, now());
    if (!grant || stored.expires_at <= now() || grant.resource !== resource(env)) error('invalid_grant', 'L’autorisation a expiré ou a été retirée.');
    if (params.scope && scopes(params.scope) !== grant.scope) error('invalid_scope', 'Reconnectez-vous pour modifier les droits.');
    const consumed = await run(env, 'UPDATE bridge_oauth_tokens SET used_at=? WHERE hash=? AND used_at IS NULL', now(), hash);
    if (!consumed.meta.changes) {
      // A concurrent use is a replay too: never leave the winning token family usable.
      await run(env, 'UPDATE bridge_oauth_grants SET revoked_at=? WHERE id=?', now(), stored.grant_id);
      error('invalid_grant', 'Ce jeton a déjà été renouvelé. Reconnectez l’assistant.');
    }
    return json(await issue(env, grant));
  }
  error('unsupported_grant_type', 'Ce mode de connexion n’est pas pris en charge.');
}
async function boundedForm(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/x-www-form-urlencoded')) error('invalid_request', 'Un formulaire OAuth est attendu.', 415);
  const reader = request.body?.getReader(); if (!reader) error('invalid_request', 'Formulaire vide.');
  const chunks = []; let size = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 16000) { await reader.cancel(); error('invalid_request', 'Formulaire trop grand.', 413); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  return new TextDecoder().decode(bytes);
}
