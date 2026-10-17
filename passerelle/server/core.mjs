export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function fail(status, message) { throw new HttpError(status, message); }
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const one = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).first();
export const all = async (env, sql, ...args) => (await env.DB.prepare(sql).bind(...args).all()).results;
export const run = (env, sql, ...args) => env.DB.prepare(sql).bind(...args).run();
export const statement = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}
export function text(value, name, max = 20000, optional = false) {
  if (optional && (value === undefined || value === null)) return '';
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) fail(400, `Vérifiez le champ « ${name} » (maximum ${max} caractères).`);
  return value;
}
export function integer(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > max) fail(400, 'Pagination ou numéro de version incorrect.');
  return parsed;
}
export async function readJSON(request, max = 240000) {
  if (!request.headers.get('Content-Type')?.includes('application/json')) fail(415, 'Un contenu JSON est attendu.');
  if (Number(request.headers.get('Content-Length') || 0) > max) fail(413, 'Ce transfert est trop volumineux. Réduisez le lot.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Le formulaire est vide.');
  const chunks = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); fail(413, 'Ce transfert est trop volumineux. Réduisez le lot.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Objet JSON attendu.');
    return data;
  } catch (error) { if (error instanceof HttpError) throw error; fail(400, 'Le contenu JSON est illisible.'); }
}
export async function sha(value) {
  const result = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(result), b => b.toString(16).padStart(2, '0')).join('');
}
export function identity(request) {
  // This header is authenticated and overwritten by Sites dispatch, never by this app.
  // The local development adapter sets a fixed local identity and strips incoming headers.
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id || id.length > 256) fail(401, 'Connectez-vous pour accéder à votre espace.');
  return id;
}
export async function spaceFor(env, owner, id, shared = false) {
  const result = await one(env, 'SELECT * FROM bridge_spaces WHERE id=? AND owner_id=?', id, owner);
  if (!result || (shared && !result.shared)) fail(404, 'Cet espace est introuvable ou son partage est désactivé.');
  return result;
}
export function secure(response) {
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return new Response(response.body, { status: response.status, headers });
}
