/**
 * Database connection and schema.
 *
 * The application uses SQLite (via better-sqlite3) stored in a single file,
 * by default `data/board-attendance.db`. Schema changes are applied through the
 * numbered MIGRATIONS list below; the current version is tracked with
 * SQLite's `user_version` pragma, so new migrations can simply be appended.
 */
const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'board-attendance.db');

const MIGRATIONS = [
  // 1 — initial schema
  `
  CREATE TABLE users (
    id            INTEGER PRIMARY KEY,
    username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    display_name  TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE sessions (
    token       TEXT    PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TEXT    NOT NULL
  );

  CREATE TABLE participants (
    id           INTEGER PRIMARY KEY,
    first_name   TEXT    NOT NULL,
    last_name    TEXT    NOT NULL,
    date_of_birth TEXT,
    email        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    phone        TEXT,
    position     TEXT    NOT NULL,
    date_joined  TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    photo        TEXT,                 -- optional data: URL (small, resized client-side)
    notes        TEXT,
    is_sample    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE meetings (
    id          INTEGER PRIMARY KEY,
    title       TEXT    NOT NULL,
    date        TEXT    NOT NULL,      -- YYYY-MM-DD
    start_time  TEXT    NOT NULL,      -- HH:MM (24h)
    end_time    TEXT    NOT NULL,
    location    TEXT    NOT NULL,
    description TEXT,
    status      TEXT    NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','completed','cancelled')),
    is_sample   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per invited participant per meeting. The composite primary key
  -- guarantees there can never be duplicate attendance records for the same
  -- participant and meeting. A NULL status means "not yet recorded".
  CREATE TABLE attendance (
    meeting_id     INTEGER NOT NULL REFERENCES meetings(id)     ON DELETE CASCADE,
    participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    status         TEXT CHECK (status IS NULL OR status IN ('present','absent','apology','late','left_early','online')),
    notes          TEXT,
    recorded_at    TEXT,
    PRIMARY KEY (meeting_id, participant_id)
  );

  CREATE INDEX idx_attendance_participant ON attendance(participant_id);
  CREATE INDEX idx_meetings_date ON meetings(date);

  CREATE TABLE app_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  `,
];

function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

function openDatabase(dbPath = process.env.DB_PATH || DEFAULT_DB_PATH) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

module.exports = { openDatabase, DEFAULT_DB_PATH };
