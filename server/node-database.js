/**
 * Local SQLite adapter for Node.js (development, tests and self-hosting),
 * using better-sqlite3. Implements the same API as the D1 adapter in database.js.
 */
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');
const { bind } = require('./database');

function createNodeDatabase(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const raw = new Database(dbPath);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  // bind() produces D1-style numbered placeholders (?1, ?2 …); better-sqlite3
  // handles those differently, so expand them to plain `?` in order of use.
  const prep = (sql, params) => {
    const [text, values] = bind(sql, params);
    if (!/\?\d/.test(text)) return [raw.prepare(text), values];
    const ordered = [];
    const plain = text.replace(/\?(\d+)/g, (_, n) => {
      ordered.push(values[Number(n) - 1]);
      return '?';
    });
    return [raw.prepare(plain), ordered];
  };
  const run = (sql, params) => {
    const [stmt, values] = prep(sql, params);
    const r = stmt.run(...values);
    return { changes: r.changes, lastId: Number(r.lastInsertRowid) };
  };
  return {
    kind: 'node',
    raw,
    async all(sql, params) {
      const [stmt, values] = prep(sql, params);
      return stmt.all(...values);
    },
    async first(sql, params) {
      const [stmt, values] = prep(sql, params);
      return stmt.get(...values) ?? null;
    },
    async value(sql, params) {
      const [stmt, values] = prep(sql, params);
      const row = stmt.get(...values);
      return row ? Object.values(row)[0] : null;
    },
    async run(sql, params) {
      return run(sql, params);
    },
    async batch(statements) {
      return raw.transaction(() => statements.map(([sql, params]) => run(sql, params)))();
    },
    close() {
      raw.close();
    },
  };
}

module.exports = { createNodeDatabase };
