/**
 * Database access layer.
 *
 * The same application code runs against two SQLite engines:
 *  - Cloudflare D1 in production (Workers), via createD1Database(env.DB)
 *  - a local SQLite file in Node.js (development and tests), via createNodeDatabase(path)
 *    in node-database.js (kept separate so the Worker bundle never includes the native module)
 *
 * Both adapters expose the same small async API:
 *   db.all(sql, params)    → array of rows
 *   db.first(sql, params)  → first row or null
 *   db.value(sql, params)  → first column of the first row (or null)
 *   db.run(sql, params)    → { changes, lastId }
 *   db.batch([[sql, params], ...]) → runs all statements atomically (all or nothing)
 *
 * `params` is either an array (for `?` placeholders) or an object (for `@name`
 * placeholders). Named placeholders are converted to numbered ones (`?1`, `?2`)
 * because D1 only supports positional binding.
 */
const { MIGRATIONS } = require('./schema');

/** Convert `@name` placeholders to `?N` and return the matching value array. */
function bind(sql, params) {
  if (params == null) return [sql, []];
  if (Array.isArray(params)) return [sql, params];
  const names = [];
  const text = sql.replace(/@([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
    let i = names.indexOf(name);
    if (i === -1) {
      if (!(name in params)) throw new Error(`Missing SQL parameter @${name}`);
      names.push(name);
      i = names.length - 1;
    }
    return `?${i + 1}`;
  });
  return [text, names.map((n) => (params[n] === undefined ? null : params[n]))];
}

/**
 * Format a value as a SQL literal. Used only for bulk inserts of already
 * validated values (D1 limits the number of bound parameters per statement and
 * the number of statements per request, so large inserts are built as a
 * single multi-row statement). Strings are quoted with SQLite's '' escaping.
 */
function literal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Invalid number in SQL literal');
    return String(v);
  }
  if (typeof v === 'boolean') return v ? '1' : '0';
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Build `INSERT INTO t (cols) VALUES (...), (...)` statements in chunks. */
function multiInsert(table, columns, rows, { orIgnore = false, chunk = 200 } = {}) {
  const out = [];
  for (let i = 0; i < rows.length; i += chunk) {
    const values = rows.slice(i, i + chunk).map((r) => `(${columns.map((c) => literal(r[c])).join(', ')})`);
    out.push([`INSERT ${orIgnore ? 'OR IGNORE ' : ''}INTO ${table} (${columns.join(', ')}) VALUES ${values.join(',\n')}`]);
  }
  return out;
}

// ---- Cloudflare D1 ------------------------------------------------------------

function createD1Database(d1) {
  const prep = (sql, params) => {
    const [text, values] = bind(sql, params);
    return d1.prepare(text).bind(...values);
  };
  return {
    kind: 'd1',
    async all(sql, params) {
      return (await prep(sql, params).all()).results;
    },
    async first(sql, params) {
      return (await prep(sql, params).first()) ?? null;
    },
    async value(sql, params) {
      const row = await prep(sql, params).first();
      return row ? Object.values(row)[0] : null;
    },
    async run(sql, params) {
      const r = await prep(sql, params).run();
      return { changes: r.meta.changes, lastId: r.meta.last_row_id };
    },
    async batch(statements) {
      if (!statements.length) return [];
      const results = await d1.batch(statements.map(([sql, params]) => prep(sql, params)));
      return results.map((r) => ({ changes: r.meta?.changes ?? 0, lastId: r.meta?.last_row_id }));
    },
  };
}

// ---- Schema migrations ----------------------------------------------------------

/** Apply any schema migrations that have not yet been applied. */
async function migrate(db) {
  await db.run('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const current = (await db.value('SELECT MAX(version) FROM schema_migrations')) || 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    await db.batch([
      ...MIGRATIONS[v].map((sql) => [sql]),
      ["INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))", [v + 1]],
    ]);
  }
}

module.exports = { createD1Database, migrate, literal, multiInsert, bind };
