/**
 * Database schema, as an ordered list of migrations. Each migration is a list
 * of SQL statements that are applied together (atomically). To change the
 * schema, append a new migration — never edit one that has been deployed.
 * Applied versions are recorded in the `schema_migrations` table.
 */
const MIGRATIONS = [
  // 1 — initial schema
  [
    `CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY,
      username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      display_name  TEXT    NOT NULL,
      password_hash TEXT    NOT NULL,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT    PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  TEXT    NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS participants (
      id            INTEGER PRIMARY KEY,
      first_name    TEXT    NOT NULL,
      last_name     TEXT    NOT NULL,
      date_of_birth TEXT,
      email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      phone         TEXT,
      position      TEXT    NOT NULL,
      date_joined   TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      photo         TEXT,
      notes         TEXT,
      is_sample     INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS meetings (
      id          INTEGER PRIMARY KEY,
      title       TEXT    NOT NULL,
      date        TEXT    NOT NULL,
      start_time  TEXT    NOT NULL,
      end_time    TEXT    NOT NULL,
      location    TEXT    NOT NULL,
      description TEXT,
      status      TEXT    NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','completed','cancelled')),
      is_sample   INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )`,
    // One row per invited participant per meeting. The composite primary key
    // guarantees there can never be duplicate attendance records for the same
    // participant and meeting. A NULL status means "not yet recorded".
    `CREATE TABLE IF NOT EXISTS attendance (
      meeting_id     INTEGER NOT NULL REFERENCES meetings(id)     ON DELETE CASCADE,
      participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      status         TEXT CHECK (status IS NULL OR status IN ('present','absent','apology','late','left_early','online')),
      notes          TEXT,
      recorded_at    TEXT,
      PRIMARY KEY (meeting_id, participant_id)
    )`,
    'CREATE INDEX IF NOT EXISTS idx_attendance_participant ON attendance(participant_id)',
    'CREATE INDEX IF NOT EXISTS idx_meetings_date ON meetings(date)',
    'CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)',
  ],
  // 2 — organisation settings (name, terminology, form suggestions); values are JSON
  [
    'CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)',
  ],
  // 3 — custom fields: user-defined extra details for people. Definitions live in
  // custom_fields; each person's values are a JSON object keyed by field id.
  [
    `CREATE TABLE IF NOT EXISTS custom_fields (
      id          INTEGER PRIMARY KEY,
      label       TEXT    NOT NULL,
      type        TEXT    NOT NULL DEFAULT 'text' CHECK (type IN ('text','long_text','number','date','yes_no')),
      sort_order  INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    )`,
    "ALTER TABLE participants ADD COLUMN custom_values TEXT NOT NULL DEFAULT '{}'",
  ],
];

module.exports = { MIGRATIONS };
