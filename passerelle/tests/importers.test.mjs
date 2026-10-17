import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImport, batches } from '../public/importers.mjs';

test('ChatGPT : conserve toutes les branches textuelles, les auteurs et les parents', () => {
  const data = [{ id: 'c1', title: 'Projet', mapping: {
    root: { message: null },
    u: { parent: 'root', message: { author: { role: 'user' }, content: { parts: ['Bonjour', { type: 'image_asset_pointer' }] }, create_time: 5 } },
    a: { parent: 'u', message: { author: { role: 'assistant' }, content: { parts: ['Première version'] }, create_time: 6 } },
    b: { parent: 'u', message: { author: { role: 'assistant' }, content: { parts: ['Autre branche'] }, create_time: 7 } },
  } }];
  const result = parseImport(JSON.stringify(data), 'conversations.json');
  assert.equal(result.messageCount, 3); assert.equal(result.stats.omitted, 1);
  assert.equal(result.conversations[0].messages[2].parent_source_key, 'u');
  assert.equal(result.conversations[0].messages[1].content, 'Première version');
});
test('Claude : extrait le texte et signale les pièces jointes', () => {
  const data = [{ uuid: 'claude1', name: 'Claude', chat_messages: [{ uuid: 'm1', sender: 'human', content: [{ type: 'text', text: 'Consigne' }], attachments: [{ file_name: 'secret.pdf' }] }] }];
  const result = parseImport(JSON.stringify(data), 'conversations.json');
  assert.equal(result.conversations[0].provider, 'Claude');
  assert.equal(result.stats.omitted, 1); assert.equal(result.messageCount, 1);
});
test('Journaux locaux : retient les messages, ne prétend pas importer les événements internes', () => {
  const data = [{ type: 'session_meta', payload: { id: 'session-1' } }, { type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Résultat' }] } }, { type: 'event_msg', payload: { type: 'token_count' } }].map(JSON.stringify).join('\n');
  const result = parseImport(data, 'rollout.jsonl');
  assert.equal(result.messageCount, 1); assert.equal(result.stats.unrecognized, 2);
  assert.equal(result.conversations[0].source_key, 'Codex:session-1');
});
test('Grands messages : découpés sans perte ; transferts bornés en octets UTF-8', () => {
  const source = '😀hé'.repeat(70000);
  const result = parseImport(source, 'rapport.txt');
  assert.equal(result.conversations[0].messages.map(m => m.content).join(''), source);
  for (const batch of batches(result.conversations[0])) assert.ok(new TextEncoder().encode(JSON.stringify(batch)).length < 240000);
});
test('Un format non pris en charge ou un JSON cassé est une erreur explicite', () => {
  assert.throws(() => parseImport('{bad', 'export.json'), /illisible/);
  assert.throws(() => parseImport('[{"other":1}]', 'export.json'), /Aucune conversation/);
  assert.throws(() => parseImport('{bad', 'export.jsonl'), /ligne 1/);
});
test('Découpage UTF-16 : les emoji à la frontière restent intacts après stockage UTF-8', () => {
  const source = 'x'.repeat(11999) + '😀' + 'été'.repeat(8000);
  const parsed = parseImport(source, 'unicode.txt');
  const stored = parsed.conversations[0].messages.map(m => new TextDecoder().decode(new TextEncoder().encode(m.content))).join('');
  assert.equal(stored, source);
  assert.throws(() => parseImport('[null]', 'bad.json'), /Aucune conversation/);
});
