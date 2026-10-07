// Daily backup of the SQLite database, meant for a cron job (see DEPLOY-CPANEL.md).
//   DB_FILE=~/tartr8-data/tartr8.db node scripts/backup-db.js
// Settings (environment variables):
//   DB_FILE      the live database                    (required)
//   BACKUP_DIR   where backups go                     (default: ~/tartr8-backups)
//   BACKUP_KEEP  how many daily backups to keep       (default: 14)
//
// A plain `cp` can copy a half-written database: in WAL mode recent changes live in the -wal file.
// `VACUUM INTO` asks SQLite for a consistent snapshot instead, safe while the site keeps running.
// The live file is opened read-only, so the backup can never change it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const DB_FILE = process.env.DB_FILE;
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(os.homedir(), 'tartr8-backups');
const KEEP = Math.max(Number(process.env.BACKUP_KEEP) || 14, 1);
const log = msg => console.log(`[tartr8-backup ${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ${msg}`);

function open(file, readonly) {
  try {
    const Database = require('better-sqlite3');
    const db = new Database(file, { readonly, fileMustExist: true });
    return { run: (sql, ...p) => db.prepare(sql).run(...p), get: sql => db.prepare(sql).get(), close: () => db.close() };
  } catch {
    // Same fallback as the server: Node's built-in SQLite when the add-on can't load.
    process.removeAllListeners('warning'); // hide node:sqlite's "experimental" notice in the cron log
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(file, { readOnly: readonly });
    return { run: (sql, ...p) => db.prepare(sql).run(...p), get: sql => db.prepare(sql).get(), close: () => db.close() };
  }
}

try {
  if (!DB_FILE) throw new Error('Set DB_FILE to the live database, e.g. DB_FILE=~/tartr8-data/tartr8.db');
  if (!fs.existsSync(DB_FILE)) throw new Error(`Database not found: ${DB_FILE}`);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const day = new Date().toISOString().slice(0, 10);
  const snapshot = path.join(BACKUP_DIR, `tartr8-${day}.db`);
  const target = snapshot + '.gz';
  fs.rmSync(snapshot, { force: true }); // VACUUM INTO refuses to overwrite

  // 1. Consistent snapshot of the live database.
  const live = open(DB_FILE, true);
  live.run('PRAGMA busy_timeout = 10000');
  live.run('VACUUM INTO ?', snapshot);
  live.close();

  // 2. Check the copy before trusting it.
  const copy = open(snapshot, true);
  const integrity = copy.get('PRAGMA integrity_check');
  const counts = ['users', 'scores', 'messages'].map(t => `${copy.get(`SELECT COUNT(*) AS n FROM ${t}`).n} ${t}`).join(', ');
  copy.close();
  if (Object.values(integrity)[0] !== 'ok') throw new Error(`Backup failed its integrity check: ${JSON.stringify(integrity)}`);

  // 3. Compress, then remove the uncompressed snapshot.
  fs.writeFileSync(target, zlib.gzipSync(fs.readFileSync(snapshot)));
  fs.rmSync(snapshot);
  log(`Saved ${target} (${(fs.statSync(target).size / 1024).toFixed(1)} KB: ${counts})`);

  // 4. Keep only the newest KEEP backups.
  const old = fs.readdirSync(BACKUP_DIR).filter(f => /^tartr8-\d{4}-\d{2}-\d{2}\.db\.gz$/.test(f)).sort().reverse().slice(KEEP);
  for (const f of old) fs.rmSync(path.join(BACKUP_DIR, f));
  if (old.length) log(`Removed ${old.length} old backup(s): ${old.join(', ')}`);
} catch (err) {
  log(`ERROR: ${err.message}`);
  process.exit(1); // non-zero, so cron can email the failure
}
