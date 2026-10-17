import { DatabaseSync } from 'node:sqlite';

/** Local development and integration-test adapter. Production uses Cloudflare D1. */
export function openDatabase(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys=ON;');
  const wrap = (sql, args = []) => ({
    bind(...values) { return wrap(sql, values); },
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args), success: true }; },
    async run() { const result = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } }; },
    execute() {
      const statement = db.prepare(sql);
      if (statement.columns().length) return { results: statement.all(...args), success: true };
      const result = statement.run(...args);
      return { success: true, meta: { changes: Number(result.changes) } };
    },
  });
  return {
    prepare: sql => wrap(sql),
    async batch(statements) {
      db.exec('BEGIN');
      try { const results = statements.map(statement => statement.execute()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    exec: sql => db.exec(sql),
    close: () => db.close(),
  };
}
