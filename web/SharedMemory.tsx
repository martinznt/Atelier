import { useEffect, useRef, useState } from 'react';
import { Upload, Download, ArrowRightLeft, Search, PlugZap, FileText, ShieldCheck, RefreshCw, Pencil, Copy } from 'lucide-react';
import { api, post, patch, remove, date, bytes, download } from './api';
import { Button, Empty, ErrorBox, Field, Loading, Modal } from './ui';
import { batches } from '../passerelle/public/importers.mjs';

const assistants = ['Claude', 'Claude Code', 'ChatGPT', 'Codex'];
export function SharedMemory({ project }: { project: any }) {
  const [space, setSpace] = useState<any>(null), [loading, setLoading] = useState(true), [error, setError] = useState<unknown>(null);
  const [conversations, setConversations] = useState<any[]>([]), [next, setNext] = useState<number | null>(null), [relays, setRelays] = useState<any[]>([]), [relayNext, setRelayNext] = useState<number | null>(null);
  const [dialog, setDialog] = useState(''), [opened, setOpened] = useState<any>(null), [messages, setMessages] = useState<any[]>([]), [messageNext, setMessageNext] = useState<number | null>(null), [query, setQuery] = useState(''), [results, setResults] = useState<any>(null);
  async function load() {
    try {
      const response = await api(`/bridge/project/${project.id}`); setSpace(response.space);
      if (response.space) {
        const [convos, handoffs] = await Promise.all([api(`/bridge/spaces/${response.space.id}/conversations`), api(`/bridge/spaces/${response.space.id}/handoffs`)]);
        setConversations(convos.items); setNext(convos.next); setRelays(handoffs.items); setRelayNext(handoffs.next);
      }
    } catch (e) { setError(e); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [project.id]);
  async function openConversation(id: string, after?: number) {
    try { const d = await api(`/bridge/conversations/${id}${after ? `?after=${after}` : ''}`); setOpened(d.conversation); setMessages(old => after ? [...old, ...d.items].slice(-90) : d.items); setMessageNext(d.next); setDialog('conversation'); }
    catch (e) { setError(e); }
  }
  if (loading) return <Loading />;
  if (!space) return <section className="panel"><ErrorBox error={error} /><Empty title="Une mémoire commune aux assistants" action="Préparer la mémoire du projet" onAction={() => post(`/bridge/project/${project.id}`, {}).then(load).catch(setError)}>Importez vos conversations et rendez les sources de ce projet accessibles à Claude, Claude Code, ChatGPT et Codex après leur connexion. Les historiques privés ne sont pas récupérés automatiquement.</Empty></section>;
  return <div className="bridge-view">
    <div className="welcome-strip"><span className="welcome-symbol"><ArrowRightLeft /></span><div><strong>Un projet, un contexte commun.</strong><p>Les assistants autorisés retrouvent les conversations importées et laissent leurs résultats au même endroit.</p></div></div>
    <div className="project-actions"><Button onClick={() => setDialog('import')}><Upload size={16} />Importer des conversations</Button><Button kind="secondary" onClick={() => setDialog('relay')}><ArrowRightLeft size={16} />Préparer un relais</Button><Button kind="secondary" onClick={() => setDialog('connections')}><PlugZap size={16} />Relier les assistants</Button><Button kind="text" onClick={() => download(`/bridge/spaces/${space.id}/export`, 'atelier-memoire.jsonl').catch(setError)}><Download size={16} />Exporter cette mémoire</Button></div>
    <ErrorBox error={error} />
    <section className="panel">
      <div className="panel-heading"><div><h2>Le contexte à transmettre</h2><p>Des objectifs, décisions et prochaines étapes que vous pouvez corriger.</p></div><Button kind="secondary" onClick={() => setDialog('context')}><Pencil size={16} />Modifier</Button></div>
      <p className="prewrap">{space.context || 'Ajoutez ici le contexte de reprise commun à vos assistants. Les consignes principales restent dans le projet.'}</p>
      <label className="check"><input type="checkbox" checked={!!space.shared} onChange={e => patch(`/bridge/spaces/${space.id}`, { revision: space.revision, shared: e.target.checked }).then(setSpace).catch(setError)} />Autoriser mes assistants connectés à consulter les imports, le contexte et les relais de ce projet.</label>
      <p className="muted"><ShieldCheck size={14} /> {space.shared ? 'Partage activé. Les fournisseurs autorisés peuvent recevoir ces contenus lorsqu’ils consultent la passerelle.' : 'Partage désactivé : cette mémoire est visible dans votre compte Atelier uniquement.'} Le retrait du partage bloque les prochaines lectures, sans effacer les copies déjà reçues par les fournisseurs.</p>
    </section>
    <section className="panel">
      <div className="panel-heading"><div><h2>Retrouver dans les conversations</h2><p>Recherche dans tous les textes importés de ce projet, sans ouvrir tout l’historique.</p></div></div>
      <form className="bridge-search" onSubmit={e => { e.preventDefault(); api(`/bridge/search?space=${space.id}&q=${encodeURIComponent(query)}`).then(setResults).catch(setError); }}><input aria-label="Rechercher dans les imports" placeholder="Une décision, une consigne, un passage…" minLength={1} maxLength={120} required value={query} onChange={e => setQuery(e.target.value)} /><Button type="submit" kind="secondary"><Search size={16} />Rechercher</Button></form>
      {results && <div className="search-results"><p>{results.notice}</p>{!results.messages.length && !results.handoffs.length && <p>Aucun résultat. Essayez un autre terme.</p>}{results.messages.map((m: any) => <button key={m.id} onClick={() => openConversation(m.conversation_id)}><strong>{m.title} · {m.provider}</strong><p>{m.excerpt}</p></button>)}{results.handoffs.map((h: any) => <article key={h.id}><strong>{h.title}</strong><p>{h.excerpt}</p></article>)}</div>}
      {!conversations.length ? <Empty title="Vos anciens échanges ont leur place ici">Importez un export officiel ChatGPT ou Claude, un journal local Claude Code/Codex, ou un compte rendu. Le bilan indiquera les éléments absents.</Empty> : <div className="bridge-conversations">{conversations.map(c => <button key={c.id} onClick={() => openConversation(c.id)}><FileText size={20} /><span><strong>{c.title}</strong><small>{c.provider} · {c.message_count} messages ou fragments · importé le {date(c.imported_at)}</small></span></button>)}</div>}
      {next !== null && <Button kind="text" onClick={() => api(`/bridge/spaces/${space.id}/conversations?offset=${next}`).then(d => { setConversations(old => [...old, ...d.items]); setNext(d.next); }).catch(setError)}>Conversations suivantes</Button>}
    </section>
    <section className="panel"><div className="panel-heading"><div><h2>Le passage de relais</h2><p>Les messages sont conservés ici. Un relais ne démarre pas un autre assistant automatiquement.</p></div></div>{!relays.length ? <p className="muted">Un assistant connecté peut déposer son résultat avec l’outil « write_handoff ». Le suivant pourra le relire.</p> : relays.map(h => <article className="bridge-handoff" key={h.id}><span className="pill">Pour {h.recipient}</span><h3>{h.title}</h3><p className="prewrap">{h.content}</p><small>{h.author} · {date(h.created_at)}</small></article>)}{relayNext !== null && <Button kind="text" onClick={() => api(`/bridge/spaces/${space.id}/handoffs?before=${relayNext}`).then(d => { setRelays(old => [...old, ...d.items]); setRelayNext(d.next); }).catch(setError)}>Relais précédents</Button>}</section>
    {dialog === 'import' && <ImportDialog project={project.id} space={space.id} onClose={() => setDialog('')} onDone={load} />}
    {dialog === 'connections' && <ConnectionsDialog onClose={() => setDialog('')} />}
    {dialog === 'context' && <ContextDialog space={space} onClose={() => setDialog('')} onSaved={s => { setSpace(s); setDialog(''); }} />}
    {dialog === 'relay' && <RelayDialog space={space} onClose={() => setDialog('')} onSaved={() => { setDialog(''); void load(); }} />}
    {dialog === 'conversation' && opened && <Modal title={opened.title} onClose={() => setDialog('')}><p className="notice">{opened.provider} · {opened.missing}</p><div className="bridge-messages">{messages.map(m => <article key={m.id}><strong>{m.role}</strong><small>{m.original_date ? date(m.original_date) : 'Date absente de l’export'}</small><p className="prewrap">{m.content}</p>{m.parent_source_key && <details><summary>Provenance et branche</summary><code>Message parent dans l’export : {m.parent_source_key}</code></details>}</article>)}</div>{messageNext !== null && <Button kind="secondary" onClick={() => openConversation(opened.id, messageNext)}>Lire la suite</Button>}<p className="muted">Affichage progressif, limité à 90 messages dans cette fenêtre. Les textes restent enregistrés et recherchables.</p></Modal>}
  </div>;
}

function ImportDialog({ project, space, onClose, onDone }: { project: string; space: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [file, setFile] = useState<File | null>(null), [parsed, setParsed] = useState<any>(null), [busy, setBusy] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState<unknown>(null), [consent, setConsent] = useState(false), [done, setDone] = useState(false);
  const worker = useRef<Worker | null>(null), stopped = useRef(false), retained = useRef(false);
  useEffect(() => () => { stopped.current = true; worker.current?.terminate(); }, []);
  async function choose(f: File) {
    setError(null); setParsed(null); setDone(false); setConsent(false); retained.current = false; setFile(f);
    if (f.size > 20 * 1048576) { setError(new Error('Ce fichier dépasse 20 Mo. Découpez l’export en conversations ou importez des documents plus petits. Aucun contenu n’a été envoyé.')); return; }
    if (/\.zip$/i.test(f.name)) { setError(new Error('Extrayez le fichier conversations.json de l’archive ZIP, puis sélectionnez-le ici. Les images et autres pièces jointes peuvent être conservées séparément dans Fichiers.')); return; }
    setBusy(true); setProgress('Lecture locale du fichier…');
    try {
      const source = await f.text(); worker.current?.terminate();
      const w = new Worker(new URL('./import.worker.mjs', import.meta.url), { type: 'module' }); worker.current = w;
      w.onmessage = e => { setBusy(false); setProgress(''); w.terminate(); if (e.data.error) setError(new Error(e.data.error)); else setParsed(e.data.result); };
      w.onerror = () => { setError(new Error('Ce navigateur n’a pas pu analyser l’export. Essayez un fichier plus petit.')); setBusy(false); w.terminate(); };
      w.postMessage({ source, filename: f.name });
    } catch (e) { setError(e); setBusy(false); }
  }
  async function start() {
    if (!parsed || !file || !consent) return;
    setBusy(true); setError(null); stopped.current = false; let imported = 0, duplicates = 0;
    try {
      if (!retained.current) {
        setProgress('Conservation du fichier source dans la bibliothèque privée…');
        const form = new FormData(); form.set('project_id', project); form.set('file', file); form.set('collection', 'Exports de conversations');
        await api('/files', { method: 'POST', body: form }); retained.current = true;
      }
      for (const conversation of parsed.conversations) {
        for (const batch of batches(conversation)) {
          if (stopped.current) throw new Error('Import arrêté. Les lots déjà enregistrés sont conservés ; reprenez avec le même fichier pour éviter les doublons.');
          const result = await post(`/bridge/spaces/${space}/import`, batch); imported += result.imported; duplicates += result.duplicates;
          setProgress(`${imported + duplicates} / ${parsed.messageCount} fragments traités · ${duplicates} déjà présents`);
        }
      }
      setProgress(`Import terminé : ${imported} fragments ajoutés, ${duplicates} déjà présents. Le fichier source est conservé dans Fichiers.`); setDone(true); await onDone();
    } catch (e) { setError(e); } finally { setBusy(false); }
  }
  return <Modal title="Importer vos conversations" onClose={() => { if (!busy) onClose(); }}>
    <p>Un export officiel ChatGPT ou Claude, un journal local Claude Code/Codex, ou un document .txt/.md. Sélectionnez un fichier de 20 Mo maximum.</p>
    <Field label="Fichier à analyser"><input type="file" accept=".json,.jsonl,.txt,.md,.zip" disabled={busy} onChange={e => { if (e.target.files?.[0]) void choose(e.target.files[0]); }} /></Field>
    {parsed && <><div className="notice">{parsed.conversations.length} conversations · {parsed.messageCount} fragments textuels · {bytes(file?.size || 0)}<br />{parsed.stats.omitted} éléments non textuels ignorés · {parsed.stats.unrecognized} entrées non reconnues · {parsed.stats.split} découpages de grands messages.</div><p>Les pièces jointes, images, sons et contenus absents de l’export ne sont pas ajoutés à la recherche. Les branches textuelles ChatGPT présentes dans l’export sont conservées. Les journaux locaux dépendent de leur version.</p><label className="check"><input type="checkbox" checked={consent} disabled={busy || done} onChange={e => setConsent(e.target.checked)} />J’autorise la conservation de cet export et de ses textes dans ce projet. S’il est partagé, mes assistants connectés pourront les consulter.</label></>}
    <ErrorBox error={error} />{progress && <p role="status">{progress}</p>}<div className="form-actions">{busy ? <Button kind="secondary" onClick={() => { stopped.current = true; }}>Arrêter après le lot en cours</Button> : <Button kind="secondary" onClick={onClose}>Fermer</Button>}<Button disabled={!parsed || !consent || busy || done} onClick={start}>{done ? 'Import enregistré' : 'Importer dans ce projet'}</Button></div>
    <details><summary>Où trouver les exports ?</summary><p><a href="https://help.openai.com/en/articles/7260999-how-do-i-export-my-chatgpt-history-and-data" target="_blank" rel="noreferrer">Exporter les données ChatGPT</a> · <a href="https://support.claude.com/en/articles/9450526-how-can-i-export-my-claude-data" target="_blank" rel="noreferrer">Exporter les données Claude</a>. Choisissez le fichier conversations.json dans l’archive reçue. Pour les agents de code, choisissez volontairement un journal local ; aucun disque ou compte distant n’est parcouru automatiquement.</p></details>
  </Modal>;
}

function ContextDialog({ space, onClose, onSaved }: { space: any; onClose: () => void; onSaved: (space: any) => void }) {
  const key = `atelier:bridge:${space.id}:context`, [content, setContent] = useState(sessionStorage.getItem(key) ?? space.context), [error, setError] = useState<unknown>(null), [history, setHistory] = useState<any[]>([]);
  return <Modal title="Le contexte de reprise" onClose={onClose}><form onSubmit={e => { e.preventDefault(); patch(`/bridge/spaces/${space.id}`, { revision: space.revision, context: content }).then(s => { sessionStorage.removeItem(key); onSaved(s); }).catch(setError); }}><Field label="Objectif, décisions et prochaine étape"><textarea autoFocus rows={10} maxLength={24000} value={content} onChange={e => { setContent(e.target.value); sessionStorage.setItem(key, e.target.value); }} /></Field><ErrorBox error={error} /><Button type="submit">Enregistrer la version suivante</Button></form><details onToggle={e => { if (e.currentTarget.open) api(`/bridge/spaces/${space.id}/context-history`).then(d => setHistory(d.items)).catch(setError); }}><summary>Historique des vingt dernières versions</summary>{history.map(h => <article key={h.revision}><h3>Version {h.revision} · {date(h.created_at)}</h3><p className="prewrap">{h.content || 'Contexte vide'}</p></article>)}</details><p className="muted">Le brouillon est conservé dans cet onglet. Une modification faite ailleurs produit un conflit explicite.</p></Modal>;
}
function RelayDialog({ space, onClose, onSaved }: { space: any; onClose: () => void; onSaved: () => void }) {
  const key = `atelier:bridge:${space.id}:relay`;
  const [draft, setDraft] = useState<any>(() => { try { return JSON.parse(sessionStorage.getItem(key) || 'null') || { title: '', content: '', recipient: 'Tous', operation_id: crypto.randomUUID() }; } catch { return { title: '', content: '', recipient: 'Tous', operation_id: crypto.randomUUID() }; } });
  const [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  function update(field: string, value: string) { setDraft((old: any) => { const next = { ...old, [field]: value, operation_id: crypto.randomUUID() }; sessionStorage.setItem(key, JSON.stringify(next)); return next; }); }
  return <Modal title="Préparer le passage de relais" onClose={onClose}><form onSubmit={e => { e.preventDefault(); setBusy(true); sessionStorage.setItem(key, JSON.stringify(draft)); post(`/bridge/spaces/${space.id}/handoffs`, draft).then(() => { sessionStorage.removeItem(key); onSaved(); }).catch(setError).finally(() => setBusy(false)); }}><Field label="Pour quel assistant ?"><select value={draft.recipient} onChange={e => update('recipient', e.target.value)} disabled={busy}>{['Tous', ...assistants].map(a => <option key={a}>{a}</option>)}</select></Field><Field label="Titre"><input autoFocus maxLength={160} required value={draft.title} disabled={busy} onChange={e => update('title', e.target.value)} /></Field><Field label="Résultats, décisions, sources et travail restant"><textarea rows={7} required maxLength={20000} disabled={busy} value={draft.content} onChange={e => update('content', e.target.value)} /></Field><p className="muted">Ce message sera enregistré dans la mémoire du projet. Ouvrez ensuite l’assistant connecté et demandez-lui de reprendre le relais. Aucun appel IA payant n’est lancé ici.</p><ErrorBox error={error} /><Button type="submit" disabled={busy || !navigator.onLine}>{busy ? 'Enregistrement…' : 'Enregistrer le relais'}</Button></form></Modal>;
}

function ConnectionsDialog({ onClose }: { onClose: () => void }) {
  const [data, setData] = useState<any>(null), [error, setError] = useState<unknown>(null), [copied, setCopied] = useState(false);
  const load = () => api('/bridge/access').then(setData).catch(setError); useEffect(() => { void load(); }, []);
  return <Modal title="Relier vos assistants à Atelier" onClose={onClose}><p>Chaque assistant se connecte séparément à votre compte Atelier. Il peut lire les projets partagés et déposer des relais selon les droits que vous autorisez.</p><ErrorBox error={error} />{!data ? <Loading /> : <><Field label="Adresse du serveur MCP"><input readOnly value={data.mcp_url} onFocus={e => e.target.select()} /></Field><Button kind="secondary" onClick={() => navigator.clipboard.writeText(data.mcp_url).then(() => setCopied(true)).catch(() => setError(new Error('Sélectionnez et copiez l’adresse dans le champ ci-dessus.')))}><Copy size={15} />{copied ? 'Adresse copiée' : 'Copier l’adresse'}</Button>
    <div className="bridge-setup"><article><h3>Claude</h3><p>Dans les connecteurs de Claude, ajoutez une connexion personnalisée avec cette adresse, puis autorisez votre compte Atelier.</p><a href="https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp" target="_blank" rel="noreferrer">Aide officielle et conditions d’accès</a></article><article><h3>ChatGPT</h3><p>Ajoutez ce serveur dans les apps ou connecteurs MCP personnalisés si votre compte propose cette fonction. Les options et droits dépendent de l’offre et des réglages du compte.</p><a href="https://help.openai.com/en/articles/12584461-developer-mode-and-full-mcp-connectors-in-chatgpt" target="_blank" rel="noreferrer">Vérifier la disponibilité officielle</a></article><article><h3>Claude Code</h3><pre>{`claude mcp add --transport http atelier ${data.mcp_url}`}</pre><p>Ouvrez ensuite <code>/mcp</code> et authentifiez la connexion.</p></article><article><h3>Codex</h3><pre>{`codex mcp add atelier --url ${data.mcp_url}\ncodex mcp login atelier`}</pre><p>Le client doit prendre en charge le transport HTTP et OAuth.</p></article></div>
    <p className="notice">Le serveur doit être déployé en HTTPS. L’adresse locale de développement ne permet pas aux services distants de s’y connecter. Ces réglages ne donnent pas accès aux anciennes conversations privées : importez les exports à partager.</p>
    <h3>Autorisations de votre compte</h3>{!data.items.length && <p className="muted">Aucune autorisation accordée pour le moment. Un lien d’aide n’est pas une connexion.</p>}{data.items.map((g: any) => <article className="bridge-access" key={g.id}><div><strong>{g.assistant}</strong><small>{g.client_name} · {g.revoked_at ? 'Accès retiré' : Date.parse(g.expires_at) < Date.now() ? 'Accès expiré' : g.last_used_at ? `Dernier accès technique : ${date(g.last_used_at)}` : 'Autorisé, pas encore utilisé'}</small><small>{g.scope.includes('bridge:write') ? 'Lecture et dépôt de relais' : 'Lecture seule'} · expire le {date(g.expires_at)}</small></div>{!g.revoked_at && <Button kind="text danger" onClick={() => remove(`/bridge/access/${g.id}`).then(load).catch(setError)}>Retirer l’accès</Button>}</article>)}<Button kind="text" onClick={load}><RefreshCw size={14} />Actualiser les accès</Button></>}
  </Modal>;
}

export function BridgeConsent() {
  const [preview, setPreview] = useState<any>(null), [assistant, setAssistant] = useState(''), [write, setWrite] = useState(false), [consent, setConsent] = useState(false), [error, setError] = useState<unknown>(null), [busy, setBusy] = useState(false);
  const params = Object.fromEntries(new URLSearchParams(location.search));
  useEffect(() => { api(`/bridge/oauth/preview?${new URLSearchParams(params)}`).then(setPreview).catch(setError); }, []);
  async function complete(deny = false) { setBusy(true); try { const result = await post('/bridge/oauth/authorize', { ...params, assistant, allow_write: write, consent, deny }); location.assign(result.redirect); } catch (e) { setError(e); setBusy(false); } }
  return <Modal title="Autoriser un assistant" onClose={() => { if (!busy && preview) void complete(true); }}><ErrorBox error={error} />{!preview ? <><Loading /><Button kind="secondary" onClick={() => location.assign('/')}>Revenir à Atelier</Button></> : <><p><strong>{preview.client_name}</strong> demande à consulter la mémoire que vous partagez dans Atelier.</p><p className="notice">Retour vers : <strong>{preview.redirect_origin}</strong><br />{preview.notice}</p><Field label="L’assistant que vous connectez"><select value={assistant} onChange={e => setAssistant(e.target.value)}><option value="">Choisir l’assistant</option>{[...assistants, 'Autre client MCP'].map(a => <option key={a}>{a}</option>)}</select></Field>{preview.scope.includes('bridge:write') && <label className="check"><input type="checkbox" checked={write} onChange={e => setWrite(e.target.checked)} />Autoriser aussi le dépôt de relais dans mes projets partagés.</label>}<label className="check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />J’autorise cet assistant à recevoir le contenu des espaces dont j’active le partage. Je peux retirer cet accès à tout moment.</label><p>Cette autorisation expire dans 30 jours. Aucun mot de passe, jeton fournisseur ou projet non partagé n’est transmis.</p><div className="form-actions"><Button kind="secondary" disabled={busy} onClick={() => complete(true)}>Refuser</Button><Button disabled={!consent || !assistant || busy} onClick={() => complete(false)}>Autoriser la connexion</Button></div></>}</Modal>;
}
