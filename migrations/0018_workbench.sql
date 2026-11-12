-- Atelier comme poste de pilotage (additif, un seul fichier). Aucune donnée existante n'est modifiée ni supprimée.
-- Discussions organisées, liens de provenance, boîte « À faire par Martin », « Questions d'Atelier », référentiel mémoire
-- en lecture seule (Memoire-Projets), bibliothèque de prompts, inventaire d'exports, documents de référence, audits de référence.

-- 1. Discussions organisées (colonnes additives ; les conversations existantes deviennent « active », sans catégorie).
ALTER TABLE conversations ADD COLUMN category TEXT;
ALTER TABLE conversations ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','to_resume','waiting','archived'));
ALTER TABLE conversations ADD COLUMN objective TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN summary TEXT NOT NULL DEFAULT '';
ALTER TABLE conversations ADD COLUMN summary_updated_at TEXT;

CREATE TABLE conversation_links (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 from_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 to_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
 UNIQUE(from_id,to_id), CHECK(from_id<>to_id)
);
CREATE INDEX conversation_links_owner ON conversation_links(user_id,project_id);

-- Lien de provenance : d'une source exacte (message, document, fichier) vers un objet métier, avec extrait figé.
CREATE TABLE object_links (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('message','conversation','memory_doc','file','url')),
 source_id TEXT NOT NULL,
 source_label TEXT NOT NULL DEFAULT '',
 excerpt TEXT NOT NULL DEFAULT '', excerpt_hash TEXT,
 target_kind TEXT NOT NULL CHECK(target_kind IN ('decision','plan_task','question','action','prompt','conversation','handoff','document')),
 target_id TEXT NOT NULL,
 relation TEXT NOT NULL DEFAULT 'source' CHECK(relation IN ('source','citation','reuse')),
 created_at TEXT NOT NULL
);
CREATE INDEX object_links_target ON object_links(user_id,project_id,target_kind,target_id);
CREATE INDEX object_links_source ON object_links(user_id,source_kind,source_id);

-- 2. Plan : contexte de développement et validation réelle par Martin (distincte de « terminé » et de la preuve).
ALTER TABLE plan_tasks ADD COLUMN context TEXT NOT NULL DEFAULT '';
ALTER TABLE plan_tasks ADD COLUMN files_hint TEXT NOT NULL DEFAULT '';
ALTER TABLE plan_tasks ADD COLUMN tests TEXT NOT NULL DEFAULT '';
ALTER TABLE plan_tasks ADD COLUMN risks TEXT NOT NULL DEFAULT '';
ALTER TABLE plan_tasks ADD COLUMN validated_at TEXT;
ALTER TABLE handoff_packages ADD COLUMN prompt_id TEXT;

-- 3. « À faire par Martin » : actions réellement humaines.
CREATE TABLE martin_actions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 why TEXT NOT NULL DEFAULT '', expected TEXT NOT NULL DEFAULT '', consequence TEXT NOT NULL DEFAULT '',
 kind TEXT NOT NULL DEFAULT 'other' CHECK(kind IN ('provide','test','answer','choose','validate','confirm','authorize','other')),
 blocking INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','done','dismissed')),
 response TEXT NOT NULL DEFAULT '', proof TEXT NOT NULL DEFAULT '',
 task_id TEXT REFERENCES plan_tasks(id) ON DELETE SET NULL,
 source_ref TEXT NOT NULL DEFAULT '', due_date TEXT,
 created_by TEXT NOT NULL DEFAULT 'user' CHECK(created_by IN ('user','atelier')),
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, done_at TEXT
);
CREATE INDEX martin_actions_owner ON martin_actions(user_id,status,blocking DESC,updated_at DESC);

-- 4. « Questions d'Atelier » : dédupliquées par clé normalisée ; la réponse est conservée avec sa date.
CREATE TABLE atelier_questions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
 scope_key TEXT NOT NULL,
 theme TEXT NOT NULL DEFAULT '',
 question TEXT NOT NULL, dedupe_key TEXT NOT NULL,
 reason TEXT NOT NULL DEFAULT '', if_unanswered TEXT NOT NULL DEFAULT '', sources_consulted TEXT NOT NULL DEFAULT '',
 options TEXT NOT NULL DEFAULT '[]',
 multi INTEGER NOT NULL DEFAULT 0, allow_free_text INTEGER NOT NULL DEFAULT 1, allow_unknown INTEGER NOT NULL DEFAULT 1,
 priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','answered','withdrawn')),
 answer TEXT, answered_at TEXT,
 decision_id TEXT REFERENCES project_decisions(id) ON DELETE SET NULL,
 blocked_task_ids TEXT NOT NULL DEFAULT '[]',
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(user_id,scope_key,dedupe_key)
);
CREATE INDEX atelier_questions_owner ON atelier_questions(user_id,status,priority,updated_at DESC);

-- 5. Référentiel mémoire Git en lecture seule, distinct des dépôts de code (table `repositories`).
CREATE TABLE memory_repos (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
 full_name TEXT NOT NULL, branch TEXT NOT NULL,
 commit_sha TEXT, tree_sha TEXT, commit_date TEXT,
 synced_at TEXT, last_attempt_at TEXT,
 status TEXT NOT NULL DEFAULT 'never' CHECK(status IN ('never','ok','partial','error')),
 last_error TEXT, file_count INTEGER NOT NULL DEFAULT 0, truncated INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 UNIQUE(user_id,full_name)
);
CREATE TABLE memory_docs (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 repo_id TEXT NOT NULL REFERENCES memory_repos(id) ON DELETE CASCADE,
 path TEXT NOT NULL, blob_sha TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0,
 doc_type TEXT NOT NULL DEFAULT 'autre', project_key TEXT NOT NULL DEFAULT 'general',
 title TEXT NOT NULL, doc_date TEXT, doc_ref TEXT,
 indexed_commit TEXT NOT NULL, present INTEGER NOT NULL DEFAULT 1,
 content TEXT, content_blob_sha TEXT, content_cached_at TEXT,
 UNIQUE(repo_id,path)
);
CREATE INDEX memory_docs_search ON memory_docs(user_id,repo_id,present,project_key,doc_type);

-- 6. Bibliothèque de prompts versionnés. Une version transmise est verrouillée ; toute correction crée une version.
CREATE TABLE prompts (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
 code TEXT NOT NULL, title TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '',
 kind TEXT NOT NULL DEFAULT 'development' CHECK(kind IN ('framing','analysis','development','other')),
 recipient TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL DEFAULT '', product TEXT NOT NULL DEFAULT '',
 model TEXT NOT NULL DEFAULT '', effort TEXT NOT NULL DEFAULT '',
 objective TEXT NOT NULL DEFAULT '', justification TEXT NOT NULL DEFAULT '',
 prerequisites TEXT NOT NULL DEFAULT '', dependencies TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'to_prepare' CHECK(status IN ('to_prepare','to_give','given','awaiting','response_received','processed','obsolete')),
 planned_send TEXT, current_version INTEGER NOT NULL DEFAULT 1,
 task_id TEXT REFERENCES plan_tasks(id) ON DELETE SET NULL,
 conversation_id TEXT, memory_doc_id TEXT, source_note TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(user_id,code)
);
CREATE INDEX prompts_owner ON prompts(user_id,status,updated_at DESC);
CREATE TABLE prompt_versions (
 id TEXT PRIMARY KEY,
 prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 version INTEGER NOT NULL,
 body TEXT NOT NULL, commands TEXT NOT NULL DEFAULT '[]', content_hash TEXT NOT NULL,
 locked INTEGER NOT NULL DEFAULT 0,
 sent_at TEXT, sent_recipient TEXT, sent_note TEXT,
 created_at TEXT NOT NULL,
 UNIQUE(prompt_id,version)
);
CREATE TABLE prompt_responses (
 id TEXT PRIMARY KEY,
 prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 version INTEGER NOT NULL,
 response TEXT NOT NULL DEFAULT '', url TEXT, analysis TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT '',
 received_at TEXT NOT NULL, created_at TEXT NOT NULL
);

-- 7. Inventaire d'un export personnel (ChatGPT, Claude). L'archive originale reste hors d'Atelier : seuls l'empreinte,
--    le manifeste et les rapports sont conservés ; les messages passent par l'import de mémoire existant.
CREATE TABLE export_batches (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 provider TEXT NOT NULL, filename TEXT NOT NULL, size INTEGER NOT NULL, sha256 TEXT NOT NULL,
 received_at TEXT NOT NULL, conversation_count INTEGER NOT NULL DEFAULT 0,
 declared_total INTEGER NOT NULL DEFAULT 0,
 stats TEXT NOT NULL DEFAULT '{}', notes TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'inventory' CHECK(status IN ('inventory','inventoried','analysing','consolidated')),
 created_at TEXT NOT NULL,
 UNIQUE(user_id,sha256)
);
CREATE TABLE export_conversations (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
 source_id TEXT NOT NULL, title TEXT NOT NULL,
 created_time TEXT, updated_time TEXT,
 message_count INTEGER NOT NULL DEFAULT 0, node_count INTEGER NOT NULL DEFAULT 0, branch_count INTEGER NOT NULL DEFAULT 0,
 attachment_refs INTEGER NOT NULL DEFAULT 0, non_text_parts INTEGER NOT NULL DEFAULT 0,
 parse_status TEXT NOT NULL DEFAULT 'complete' CHECK(parse_status IN ('complete','partial','error','ignored')),
 parse_note TEXT NOT NULL DEFAULT '',
 project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, project_confirmed INTEGER NOT NULL DEFAULT 0,
 lot TEXT NOT NULL DEFAULT '',
 import_status TEXT NOT NULL DEFAULT 'not_imported' CHECK(import_status IN ('not_imported','imported','partial')),
 imported_messages INTEGER NOT NULL DEFAULT 0,
 UNIQUE(batch_id,source_id)
);
CREATE INDEX export_conversations_batch ON export_conversations(user_id,batch_id,lot);
CREATE TABLE export_analyses (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 batch_id TEXT NOT NULL REFERENCES export_batches(id) ON DELETE CASCADE,
 lot TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'independent' CHECK(kind IN ('independent','cross','third')),
 assistant TEXT NOT NULL, prompt_ref TEXT NOT NULL DEFAULT '',
 report TEXT NOT NULL, created_at TEXT NOT NULL
);

-- 8. Documents de référence par projet : références vers la bibliothèque, le référentiel mémoire ou une adresse.
CREATE TABLE project_documents (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 doc_type TEXT NOT NULL DEFAULT 'reference' CHECK(doc_type IN ('vision','cahier','exigences','architecture','decisions','problemes','questions','reference','audit','rapport','consigne','test','autre')),
 source_kind TEXT NOT NULL CHECK(source_kind IN ('file','memory_doc','url')),
 file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
 memory_doc_id TEXT REFERENCES memory_docs(id) ON DELETE CASCADE,
 url TEXT,
 version_label TEXT NOT NULL DEFAULT '',
 reliability TEXT NOT NULL DEFAULT 'unverified' CHECK(reliability IN ('user_confirmed','verified','reported','deduced','ai_proposed','to_confirm','superseded','unverified')),
 origin TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
 task_id TEXT REFERENCES plan_tasks(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX project_documents_owner ON project_documents(user_id,project_id,doc_type);

-- 9. Audit de référence : dépôt entier sur un commit figé, statut de lecture par fichier, constats sourcés.
CREATE TABLE ref_audits (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
 full_name TEXT NOT NULL, branch TEXT NOT NULL, commit_sha TEXT NOT NULL, tree_sha TEXT NOT NULL,
 truncated INTEGER NOT NULL DEFAULT 0, file_count INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'manifest' CHECK(status IN ('manifest','in_progress','closed')),
 notes TEXT NOT NULL DEFAULT '', ci_state TEXT, ci_checked_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 UNIQUE(user_id,repository_id,commit_sha)
);
CREATE TABLE ref_audit_files (
 audit_id TEXT NOT NULL REFERENCES ref_audits(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 path TEXT NOT NULL, blob_sha TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0,
 kind TEXT NOT NULL DEFAULT 'other' CHECK(kind IN ('code','test','doc','config','migration','asset','other')),
 read_status TEXT NOT NULL DEFAULT 'not_started' CHECK(read_status IN ('full','segments','metadata','tool','excluded','failed','not_started')),
 note TEXT NOT NULL DEFAULT '', lines INTEGER, flags TEXT NOT NULL DEFAULT '', reused_from TEXT, analysed_at TEXT,
 PRIMARY KEY(audit_id,path)
);
CREATE TABLE ref_audit_findings (
 id TEXT PRIMARY KEY,
 audit_id TEXT NOT NULL REFERENCES ref_audits(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 title TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
 severity TEXT NOT NULL DEFAULT 'P2' CHECK(severity IN ('P0','P1','P2','P3','info')),
 confidence TEXT NOT NULL DEFAULT 'medium' CHECK(confidence IN ('high','medium','low')),
 path TEXT NOT NULL DEFAULT '', reproduction TEXT NOT NULL DEFAULT '',
 origin TEXT NOT NULL DEFAULT 'user' CHECK(origin IN ('user','tool','ai')),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','confirmed','fixed','rejected')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
