import type {createSessionScope} from './session.ts';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
type Cache = {
  readonly user: string | null;
  readonly epoch: number;
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<unknown>;
};
type Dependencies = {
  cache: Cache;
  scope: ReturnType<typeof createSessionScope>;
  online: () => boolean;
  fetcher?: typeof fetch;
  timeoutMs?: number;
  onExpired?: () => void;
};

export function createApiClient({cache, scope, online, fetcher = fetch, timeoutMs = 30000, onExpired}: Dependencies) {
  async function request<T>(path: string, init: RequestInit = {}, binary = false): Promise<T> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new ApiError('Adresse de requête invalide.', 400);
    const method = (init.method || 'GET').toUpperCase();
    const get = method === 'GET';
    const auth = path.startsWith('/auth/');
    const identityEndpoints = ['/auth/me', '/auth/login', '/auth/register', '/auth/recover', '/auth/legacy-login', '/auth/legacy-recover', '/auth/logout'];
    const privateRequest = !identityEndpoints.includes(path.split('?')[0]);
    const snapshot = scope.snapshot();
    if (privateRequest && !snapshot.owner) throw new ApiError('Connectez-vous pour continuer dans votre compte.', 401);
    const localEpoch = cache.epoch;
    const cacheable = get && !binary && !auth && !path.startsWith('/connections') && !path.startsWith('/account/readiness') && !path.startsWith('/bridge/oauth') && !path.startsWith('/bridge/access');
    const assertCurrent = () => {
      if (!scope.current(snapshot)) throw new ApiError('Le compte a changé. Cette réponse a été écartée.', 401);
    };
    const cached = async (): Promise<T | null> => {
      assertCurrent();
      if (!cacheable || !snapshot.owner || cache.user !== snapshot.owner || cache.epoch !== localEpoch) return null;
      const value = await cache.get<T>(`api:${path}`);
      assertCurrent();
      return cache.user === snapshot.owner && cache.epoch === localEpoch ? value : null;
    };
    if (!online() || (privateRequest && !snapshot.networkReady)) {
      const value = await cached();
      if (value !== null) return value;
      throw new ApiError(!online()
        ? 'Hors connexion : ce contenu n’est pas disponible localement. Les messages préparés restent des brouillons.'
        : 'Reconnectez-vous au même compte pour synchroniser. Votre copie locale reste disponible.', 0);
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    init.signal?.addEventListener('abort', abort, {once: true});
    if (init.signal?.aborted) abort();
    const timer = setTimeout(abort, binary || init.body instanceof FormData ? Math.max(timeoutMs, 120000) : timeoutMs);
    try {
      const headers = new Headers(init.headers);
      // This is only an expected identity. The server authorizes using its session,
      // then refuses a mismatch before an old tab can read or write another account.
      if (snapshot.owner && privateRequest) headers.set('X-Atelier-Account', snapshot.owner);
      if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      const response = await fetcher(`/api${path}`, {...init, method, headers, credentials: 'same-origin', signal: controller.signal});
      assertCurrent();
      if (!response.ok) {
        const body = await response.json().catch(() => null) as {error?: string} | null;
        assertCurrent();
        if (response.status === 401 && privateRequest) onExpired?.();
        throw new ApiError(body?.error || `L’opération a échoué (${response.status}).`, response.status);
      }
      const body = binary ? await response.blob() : await response.json();
      assertCurrent();
      if (cacheable && snapshot.owner && cache.user === snapshot.owner && cache.epoch === localEpoch) {
        await cache.put(`api:${path}`, body).catch(() => {});
        assertCurrent();
      }
      return body as T;
    } catch (error) {
      assertCurrent();
      if (error instanceof ApiError) throw error;
      if (init.signal?.aborted) throw new ApiError('Chargement annulé.', 0);
      const value = await cached();
      if (value !== null) return value;
      throw new ApiError(get
        ? 'Le serveur ne répond pas. Réessayez dans un instant.'
        : 'La réponse du serveur n’est pas arrivée. L’opération a peut-être été enregistrée. Votre saisie est conservée ; vérifiez son état avant de réessayer.', 0);
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener('abort', abort);
    }
  }
  return {
    api: <T = any>(path: string, init?: RequestInit) => request<T>(path, init),
    blob: (path: string, init?: RequestInit) => request<Blob>(path, init, true),
  };
}
