export type TaskDraft = {
  conversation_id: string;
  message: string;
  assistants: {connection_id: string; model: string}[];
  mode: string;
  rounds: number;
  max_tokens: number;
  memory_ids: string[];
  file_ids: string[];
  share_consent: boolean;
};
export type TaskRequest = TaskDraft & {idempotency_key: string};
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (owner: string, conversation: string) => `atelier:${owner}:submission:${conversation}`;
export function savedSubmission(store: Store, owner: string, conversation: string): TaskRequest | null {
  const raw = store.getItem(key(owner, conversation));
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data.conversation_id === conversation && typeof data.message === 'string' && typeof data.idempotency_key === 'string' && Array.isArray(data.assistants)) return data;
  } catch { /* Invalid local data never authorizes a request. */ }
  return null;
}
/** Persist the exact request before sending; a timeout or reload must retain its key. */
export function prepareSubmission(store: Store, owner: string, draft: TaskDraft): TaskRequest {
  const previous = savedSubmission(store, owner, draft.conversation_id);
  if (previous) {
    const {idempotency_key, ...payload} = previous;
    if (JSON.stringify(payload) === JSON.stringify(draft)) return previous;
  }
  const request = {...draft, idempotency_key: crypto.randomUUID()};
  store.setItem(key(owner, draft.conversation_id), JSON.stringify(request));
  return request;
}
export function acknowledgeSubmission(store: Store, owner: string, request: TaskRequest) {
  if (savedSubmission(store, owner, request.conversation_id)?.idempotency_key === request.idempotency_key) store.removeItem(key(owner, request.conversation_id));
}

export type SavedDraft = {text: string; revision: string};
const draftKey = (owner: string, conversation: string) => `atelier:${owner}:draft-state:${conversation}`;
export function readDraft(store: Store, owner: string, conversation: string): SavedDraft | null {
  const raw = store.getItem(draftKey(owner, conversation));
  if (raw) try {
    const data = JSON.parse(raw);
    if (typeof data.text === 'string' && typeof data.revision === 'string') return data;
  } catch { /* Fall back to the previous plain-text draft format. */ }
  const legacy = store.getItem(`atelier:${owner}:draft:${conversation}`);
  return legacy === null ? null : {text: legacy, revision: 'legacy'};
}
export function writeDraft(store: Store, owner: string, conversation: string, text: string): SavedDraft {
  const draft = {text, revision: crypto.randomUUID()};
  store.setItem(draftKey(owner, conversation), JSON.stringify(draft));
  return draft;
}
/** A late acknowledgement cannot clear a newer draft, even with identical text. */
export function clearSentDraft(store: Store, owner: string, conversation: string, sent: SavedDraft): boolean {
  const current = readDraft(store, owner, conversation);
  if (current?.revision !== sent.revision || current.text !== sent.text) return false;
  writeDraft(store, owner, conversation, '');
  return true;
}
