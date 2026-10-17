import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, Env } from '../types.ts';
import { one, run, many, owned, userId, jsonBody, fail, now } from '../core.ts';
import { createSpace } from '../../passerelle/server/data.mjs';
import { handle } from '../../passerelle/server/app.mjs';
import { authorize, previewAuthorization, metadata, oauthRequest, bearerIdentity } from '../../passerelle/server/oauth.mjs';
import { mcp } from '../../passerelle/server/mcp.mjs';
import { HttpError, json as bridgeJSON } from '../../passerelle/server/core.mjs';

export const bridge = new Hono<AppEnv>();
bridge.get('/project/:id', async c => {
  await owned(c.env, 'projects', c.req.param('id'), userId(c));
  return c.json({ space: await one(c.env, 'SELECT s.* FROM bridge_project_spaces p JOIN bridge_spaces s ON s.id=p.space_id WHERE p.project_id=? AND p.user_id=?', c.req.param('id'), userId(c)) });
});
bridge.post('/project/:id', async c => {
  const project = await owned(c.env, 'projects', c.req.param('id'), userId(c));
  const existing = await one(c.env, 'SELECT s.* FROM bridge_project_spaces p JOIN bridge_spaces s ON s.id=p.space_id WHERE p.project_id=? AND p.user_id=?', project.id, userId(c));
  if (existing) return c.json(existing);
  const space = await createSpace(c.env, userId(c), { name: project.name });
  await run(c.env, 'INSERT INTO bridge_project_spaces(project_id,space_id,user_id) VALUES(?,?,?) ON CONFLICT(project_id) DO NOTHING', project.id, space.id, userId(c));
  const link = (await one(c.env, 'SELECT space_id FROM bridge_project_spaces WHERE project_id=? AND user_id=?', project.id, userId(c)))!;
  if (link.space_id !== space.id) await run(c.env, 'DELETE FROM bridge_spaces WHERE id=? AND owner_id=?', space.id, userId(c));
  return c.json(await one(c.env, 'SELECT * FROM bridge_spaces WHERE id=? AND owner_id=?', link.space_id, userId(c)));
});
bridge.get('/oauth/preview', async c => c.json(await previewAuthorization(c.env, Object.fromEntries(new URL(c.req.url).searchParams))));
bridge.post('/oauth/authorize', async c => c.json(await authorize(c.env, userId(c), await jsonBody(c))));
bridge.get('/access', async c => c.json({ items: await many(c.env, 'SELECT g.id,g.assistant,g.scope,g.created_at,g.expires_at,g.last_used_at,g.revoked_at,c.name AS client_name FROM bridge_oauth_grants g JOIN bridge_oauth_clients c ON c.id=g.client_id WHERE g.user_id=? ORDER BY g.created_at DESC LIMIT 100', userId(c)), mcp_url: `${c.env.APP_ORIGIN}/mcp`, site_linked: !!await one(c.env, 'SELECT 1 AS linked FROM bridge_site_links WHERE user_id=?', userId(c)) }));
bridge.delete('/access/:id', async c => {
  await run(c.env, 'UPDATE bridge_oauth_grants SET revoked_at=? WHERE id=? AND user_id=?', now(), c.req.param('id'), userId(c));
  return c.json({ ok: true });
});
bridge.post('/site-link', async c => {
  if (c.env.SITES_AUTHENTICATION !== 'true') fail(409, 'La connexion gérée par Sites n’est pas activée sur cet hébergement. Utilisez l’adresse MCP et sa connexion OAuth.');
  const siteUser = c.req.header('oai-authenticated-user-id');
  if (!siteUser) fail(401, 'Connectez-vous à cet hébergement avant de lier votre compte.');
  const body = await jsonBody(c);
  if (body.consent !== true) fail(400, 'Confirmez le lien avec ce compte Atelier.');
  const existing = await one(c.env, 'SELECT user_id FROM bridge_site_links WHERE site_user_id=? OR user_id=?', siteUser, userId(c));
  if (existing && existing.user_id !== userId(c)) fail(409, 'Cette identité est déjà liée à un autre compte Atelier.');
  await run(c.env, 'INSERT INTO bridge_site_links(site_user_id,user_id,created_at) VALUES(?,?,?) ON CONFLICT(site_user_id) DO NOTHING', siteUser, userId(c), now());
  return c.json({ ok: true });
});
bridge.delete('/site-link', async c => { await run(c.env, 'DELETE FROM bridge_site_links WHERE user_id=?', userId(c)); return c.json({ ok: true }); });
bridge.all('*', async c => {
  const url = new URL(c.req.url);
  url.pathname = url.pathname.replace(/^\/api\/bridge/, '/api');
  const headers = new Headers(c.req.raw.headers);
  // Overwrite any browser-provided value with the server-session owner.
  headers.set('oai-authenticated-user-id', userId(c));
  const request = new Request(url, { method: c.req.method, headers, body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : await c.req.raw.arrayBuffer() });
  return handle(request, c.env);
});
bridge.onError((error, c) => error instanceof HttpError || error instanceof HTTPException ? bridgeJSON({ error: error.message }, error.status) : c.json({ error: 'La mémoire partagée est momentanément indisponible. Votre saisie reste conservée.' }, 500));

export const bridgePublic = new Hono<AppEnv>();
bridgePublic.onError((error, c) => error instanceof HttpError || error instanceof HTTPException ? bridgeJSON({ error: error.message }, error.status) : c.json({ error: 'Connexion à la passerelle indisponible. Réessayez plus tard.' }, 500));
bridgePublic.get('/.well-known/oauth-authorization-server', c => c.json(metadata(c.env)));
bridgePublic.get('/.well-known/oauth-protected-resource/mcp', c => c.json(metadata(c.env, true)));
bridgePublic.get('/.well-known/oauth-protected-resource', c => c.json(metadata(c.env, true)));
bridgePublic.post('/oauth/bridge/*', c => oauthRequest(c.req.raw, c.env));
bridgePublic.all('/mcp', async c => {
  let caller = await bearerIdentity(c.req.raw, c.env);
  if (!caller && c.env.SITES_AUTHENTICATION === 'true') {
    const siteUser = c.req.header('oai-authenticated-user-id');
    if (siteUser) {
      const linked = await one(c.env, 'SELECT l.user_id FROM bridge_site_links l JOIN users u ON u.id=l.user_id WHERE l.site_user_id=? AND u.deleted_at IS NULL', siteUser);
      if (linked) caller = { user_id: linked.user_id, write: true, assistant: 'Assistant via Sites' };
    }
  }
  if (!caller) return c.json({ error: 'Connectez et autorisez votre compte Atelier pour utiliser la mémoire partagée.' }, 401, { 'WWW-Authenticate': `Bearer resource_metadata="${c.env.APP_ORIGIN}/.well-known/oauth-protected-resource/mcp", scope="bridge:read"` });
  return mcp(c.req.raw, { ...c.env, MCP_WRITE: caller.write, MCP_ASSISTANT: caller.assistant }, caller.user_id, c.env.APP_ORIGIN);
});
