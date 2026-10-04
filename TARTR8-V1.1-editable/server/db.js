const fs = require('fs');
const path = require('path');

// One small async interface over three drivers, picked from environment variables:
//   - Postgres  (DATABASE_URL or POSTGRES_URL set)  — e.g. Neon on Vercel
//   - Turso     (TURSO_DATABASE_URL set)            — hosted SQLite-compatible
//   - SQLite file (default)                         — local development and cPanel
// Queries are written in SQL that runs unchanged on all three (`?` placeholders, timestamps passed in
// from JavaScript rather than database date functions), so the rest of the server doesn't care which is used.
//   db.all(sql, params) -> rows     db.get(sql, params) -> row | undefined
//   db.run(sql, params) -> { lastInsertRowid, changes }     db.exec(sql)     db.close()

// Timestamps are stored as UTC text 'YYYY-MM-DD HH:MM:SS', which sorts and compares correctly as text.
function sqlTime(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 19).replace('T', ' ');
}

// BigInt counts (Postgres COUNT, libSQL) become ordinary numbers.
const plainRow = row => {
  if (!row) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'bigint' ? Number(v) : v;
  return out;
};

function sqliteDriver(file) {
  const Database = require('better-sqlite3');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return {
    kind: 'sqlite',
    async all(sql, params = []) { return db.prepare(sql).all(params); },
    async get(sql, params = []) { return db.prepare(sql).get(params); },
    async run(sql, params = []) {
      const r = db.prepare(sql).run(params);
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.changes };
    },
    async exec(sql) { db.exec(sql); },
    async close() { db.close(); }
  };
}

function libsqlDriver(url, authToken) {
  const { createClient } = require('@libsql/client');
  const client = createClient({ url, authToken });
  return {
    kind: 'libsql',
    async all(sql, params = []) { return (await client.execute({ sql, args: params })).rows.map(plainRow); },
    async get(sql, params = []) { return plainRow((await client.execute({ sql, args: params })).rows[0]); },
    async run(sql, params = []) {
      const r = await client.execute({ sql, args: params });
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: r.rowsAffected };
    },
    async exec(sql) { await client.executeMultiple(sql); },
    async close() { client.close(); }
  };
}

// `query(text, params)` must return { rows, rowCount }. Works for node-postgres and for PGlite (tests).
function postgresDriver(query, close) {
  let n;
  const numbered = sql => { n = 0; return sql.replace(/\?/g, () => `$${++n}`); };
  return {
    kind: 'postgres',
    async all(sql, params = []) { return (await query(numbered(sql), params)).rows.map(plainRow); },
    async get(sql, params = []) { return plainRow((await query(numbered(sql), params)).rows[0]); },
    async run(sql, params = []) {
      // Postgres has no "last insert id"; ask for the inserted row back instead.
      const isInsert = /^\s*insert/i.test(sql);
      const r = await query(numbered(isInsert ? `${sql} RETURNING *` : sql), params);
      return { lastInsertRowid: isInsert ? Number(r.rows[0]?.id) : undefined, changes: r.rowCount ?? r.affectedRows };
    },
    async exec(sql) {
      for (const statement of sql.split(';').map(s => s.trim()).filter(Boolean)) await query(statement, []);
    },
    close
  };
}

function nodePostgres(connectionString) {
  const { Pool, types } = require('pg');
  types.setTypeParser(20, v => Number(v)); // COUNT(*) etc. come back as numbers, not strings
  // A small pool per server instance; on Vercel use the provider's pooled connection string.
  // Neon URLs say sslmode=require; ask for full certificate verification explicitly (pg's current behaviour,
  // and it stays secure when pg changes what "require" means).
  connectionString = connectionString.replace(/sslmode=(require|prefer|verify-ca)\b/, 'sslmode=verify-full');
  const pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10000 });
  return postgresDriver((text, params) => pool.query(text, params), () => pool.end());
}

async function pglite() {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  return postgresDriver(async (text, params) => {
    const r = await db.query(text, params);
    return { rows: r.rows, rowCount: r.affectedRows };
  }, () => db.close());
}

const SQLITE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game TEXT NOT NULL,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

const POSTGRES_SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS users_username_ci ON users (lower(username));
  CREATE UNIQUE INDEX IF NOT EXISTS users_email_ci ON users (lower(email));
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS scores (
    id SERIAL PRIMARY KEY,
    game TEXT NOT NULL,
    name TEXT NOT NULL,
    score INTEGER NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT 'other',
    subject TEXT,
    created_at TEXT NOT NULL
  );
  ALTER TABLE messages ADD COLUMN IF NOT EXISTS subject TEXT;
  CREATE INDEX IF NOT EXISTS idx_scores_game_user ON scores (game, user_id, score);
`;

async function migrate(db) {
  if (db.kind === 'postgres') return db.exec(POSTGRES_SCHEMA);

  await db.exec(SQLITE_SCHEMA);
  // Older SQLite databases: scores used to be anonymous (kept but not ranked) and messages had no topic.
  const scoreColumns = (await db.all('PRAGMA table_info(scores)')).map(c => c.name);
  if (!scoreColumns.includes('user_id')) {
    await db.exec('ALTER TABLE scores ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
  }
  const messageColumns = (await db.all('PRAGMA table_info(messages)')).map(c => c.name);
  if (!messageColumns.includes('topic')) await db.exec("ALTER TABLE messages ADD COLUMN topic TEXT NOT NULL DEFAULT 'general'");
  if (!messageColumns.includes('subject')) await db.exec('ALTER TABLE messages ADD COLUMN subject TEXT');
  await db.exec(`
    DROP INDEX IF EXISTS idx_scores_game_score;
    CREATE INDEX IF NOT EXISTS idx_scores_game_user ON scores (game, user_id, score);
  `);
}

// options (all optional, mainly for tests): { file }, { tursoUrl, tursoToken }, { postgresUrl }, { pglite: true }
async function openDatabase(options = {}) {
  const explicit = Object.keys(options).length > 0;
  const env = explicit ? {} : process.env;
  const postgresUrl = options.postgresUrl ?? env.DATABASE_URL ?? env.POSTGRES_URL;
  const tursoUrl = options.tursoUrl ?? env.TURSO_DATABASE_URL;

  let db;
  if (options.pglite) db = await pglite();
  else if (postgresUrl) db = nodePostgres(postgresUrl);
  else if (tursoUrl) db = libsqlDriver(tursoUrl, options.tursoToken ?? env.TURSO_AUTH_TOKEN);
  else db = sqliteDriver(options.file ?? env.DB_FILE ?? path.join(__dirname, 'data', 'tartr8.db'));

  await migrate(db);
  return db;
}

module.exports = { openDatabase, sqlTime };
