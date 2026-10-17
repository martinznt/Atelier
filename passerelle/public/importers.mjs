const providers = new Set(['ChatGPT', 'Claude', 'Claude Code', 'Codex', 'Document', 'Atelier']);
const date = value => {
  if (!value) return null;
  const d = new Date(typeof value === 'number' ? value * 1000 : value);
  return Number.isNaN(d.valueOf()) ? null : d.toISOString();
};
function parts(value, stats) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) { if (value) stats.omitted++; return ''; }
  return value.map(part => {
    if (typeof part === 'string') return part;
    if (part && ['text', 'input_text', 'output_text'].includes(part.type) && typeof part.text === 'string') return part.text;
    stats.omitted++; return '';
  }).filter(Boolean).join('\n\n');
}
function normalize(conversation, index, stats) {
  if (!conversation || typeof conversation !== 'object') return null;
  let provider, messages = [], title, key;
  if (conversation.mapping && typeof conversation.mapping === 'object') {
    provider = 'ChatGPT'; key = String(conversation.id || conversation.conversation_id || index); title = conversation.title || 'Conversation ChatGPT';
    for (const [nodeId, node] of Object.entries(conversation.mapping)) {
      const m = node?.message; if (!m) continue;
      const content = parts(m.content?.parts ?? m.content?.text, stats);
      if (content) messages.push({ source_key: nodeId, parent_source_key: node.parent || null, role: m.author?.role || 'inconnu', content, original_date: date(m.create_time) });
      else stats.empty++;
    }
    // All textual branches are retained, not only the current leaf.
    messages.sort((a, b) => String(a.original_date || '').localeCompare(String(b.original_date || '')));
  } else if (Array.isArray(conversation.chat_messages)) {
    provider = 'Claude'; key = String(conversation.uuid || index); title = conversation.name || 'Conversation Claude';
    for (const [i, m] of conversation.chat_messages.entries()) {
      const content = m.content?.length ? parts(m.content, stats) : parts(m.text, stats);
      stats.omitted += (m.attachments?.length || 0) + (m.files?.length || 0);
      if (content) messages.push({ source_key: String(m.uuid || i), parent_source_key: m.parent_message_uuid || null, role: m.sender || 'inconnu', content, original_date: date(m.created_at) });
      else stats.empty++;
    }
  } else if (conversation.type === 'atelier-conversation' && Array.isArray(conversation.messages)) {
    provider = providers.has(conversation.provider) ? conversation.provider : 'Atelier'; key = String(conversation.id || index); title = conversation.title || 'Conversation importée';
    messages = conversation.messages.map((m, i) => ({ source_key: String(m.source_key || m.id || i), parent_source_key: m.parent_source_key || null, role: String(m.role || 'inconnu'), content: String(m.content || ''), original_date: date(m.original_date) })).filter(m => m.content);
  } else return null;
  return { source_key: `${provider}:${key}`.slice(0, 200), provider, title: String(title).slice(0, 200), messages };
}
export function parseImport(source, filename) {
  const stats = { omitted: 0, empty: 0, unrecognized: 0, split: 0 };
  let conversations = [];
  if (/\.(md|txt)$/i.test(filename)) {
    conversations = [{ provider: 'Document', source_key: `Document:${filename}`, title: filename.slice(0, 200), messages: [{ source_key: 'document', role: 'document', content: source, original_date: null, parent_source_key: null }] }];
  } else if (/\.jsonl$/i.test(filename)) {
    const rows = source.split(/\r?\n/).filter(l => l.trim()).map((line, i) => { try { return JSON.parse(line); } catch { throw new Error(`La ligne ${i + 1} n’est pas un JSON valide.`); } });
    if (rows.some(r => r.type === 'space')) {
      for (const row of rows.filter(r => r.type === 'conversations')) {
        const c = row.data;
        conversations.push({ source_key: c.source_key, title: c.title, provider: c.provider, messages: rows.filter(r => r.type === 'messages' && r.data.conversation_id === c.id).map(r => r.data) });
      }
      const space = rows.find(r => r.type === 'space')?.space;
      if (space?.context) conversations.push({ source_key: `Atelier:contexte:${space.id}:${space.revision}`, title: `Contexte · ${space.name}`, provider: 'Atelier', messages: [{ source_key: 'context', role: 'document', content: space.context }] });
      for (const r of rows.filter(r => r.type === 'handoffs')) conversations.push({ source_key: `Atelier:relais:${r.data.id}`, title: r.data.title, provider: 'Atelier', messages: [{ source_key: r.data.id, role: r.data.author, content: r.data.content, original_date: r.data.created_at }] });
    } else {
      const messages = []; let provider = 'Codex';
      for (const [i, row] of rows.entries()) {
        let content = '', role = '', id = String(row.uuid || i);
        if (['user', 'assistant'].includes(row.type) && row.message) { provider = 'Claude Code'; role = row.message.role || row.type; content = parts(row.message.content, stats); }
        else if (row.type === 'response_item' && row.payload?.type === 'message') { role = row.payload.role; content = parts(row.payload.content, stats); }
        else { stats.unrecognized++; continue; }
        if (content) messages.push({ source_key: id, role, content, original_date: date(row.timestamp), parent_source_key: row.parentUuid || null });
      }
      const sessionId = rows.find(r => r.type === 'session_meta')?.payload?.id || rows.find(r => r.sessionId)?.sessionId || filename;
      conversations.push({ source_key: `${provider}:${sessionId}`, provider, title: filename.slice(0, 200), messages });
    }
  } else {
    let value; try { value = JSON.parse(source); } catch { throw new Error('Ce fichier JSON est illisible. Extrayez conversations.json de votre export officiel.'); }
    const items = Array.isArray(value) ? value : Array.isArray(value.conversations) ? value.conversations : [value];
    for (const [i, item] of items.entries()) { const normalized = normalize(item, i, stats); if (normalized) conversations.push(normalized); else stats.unrecognized++; }
  }
  conversations = conversations.filter(c => c.messages.length);
  for (const c of conversations) {
    const output = [];
    for (const m of c.messages) {
      // Split without losing content; suffixes are stable across re-imports.
      const content = m.content || '';
      let pos = 0, part = 0;
      while (pos < content.length) {
        let end = Math.min(content.length, pos + 12000);
        const last = content.charCodeAt(end - 1), following = content.charCodeAt(end);
        if (end < content.length && last >= 0xd800 && last <= 0xdbff && following >= 0xdc00 && following <= 0xdfff) end--;
        part++;
        output.push({ source_key: `${m.source_key}${content.length > 12000 ? `:part:${part}` : ''}`.slice(0, 200), role: String(m.role || 'inconnu').slice(0, 80), content: content.slice(pos, end), original_date: m.original_date || null, parent_source_key: m.parent_source_key || null });
        if (pos) stats.split++;
        pos = end;
      }
    }
    c.messages = output;
    c.source_key = c.source_key.slice(0, 200);
    c.missing = `Import de texte. Pièces jointes, images, audio, résultats d’outils non textuels et données absentes de l’export non importés. ${stats.omitted} élément(s) non textuel(s), ${stats.unrecognized} entrée(s) non reconnue(s) dans le fichier. Les formats locaux Claude Code/Codex sont susceptibles d’évoluer.`;
  }
  if (!conversations.length) throw new Error('Aucune conversation textuelle reconnue. Utilisez un export ChatGPT/Claude, un journal local Claude Code/Codex, ou un document .txt/.md.');
  return { conversations, stats, messageCount: conversations.reduce((sum, c) => sum + c.messages.length, 0) };
}
export function* batches(conversation) {
  let messages = [], size = 0;
  for (const message of conversation.messages) {
    const length = new TextEncoder().encode(JSON.stringify(message)).length;
    if (messages.length && (messages.length === 30 || size + length > 170000)) { yield { ...conversation, messages }; messages = []; size = 0; }
    messages.push(message); size += length;
  }
  if (messages.length) yield { ...conversation, messages };
}
