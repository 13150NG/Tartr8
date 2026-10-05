// Imports players, scores and messages exported from another TARTR8 database (JSON on stdin).
// Usage: node server/import-players.js < export.json
// Safe to re-run: a player whose username or email already exists is skipped along with their scores.
const { openDatabase } = require('./db');

(async () => {
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  const data = JSON.parse(input);
  const db = await openDatabase();

  const idMap = new Map();
  let added = 0, skipped = 0, scores = 0, messages = 0;
  for (const u of data.users || []) {
    const existing = await db.get('SELECT id FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)', [u.username, u.email]);
    if (existing) { skipped++; console.log(`skip  ${u.username} (already exists)`); continue; }
    const { lastInsertRowid } = await db.run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)', [u.username, u.email, u.created_at]);
    idMap.set(u.id, lastInsertRowid);
    added++;
    console.log(`added ${u.username}`);
  }
  for (const s of data.scores || []) {
    const userId = idMap.get(s.user_id);
    if (!userId) continue; // player was skipped
    const user = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
    await db.run('INSERT INTO scores (game, name, score, user_id, created_at) VALUES (?, ?, ?, ?, ?)', [s.game, user.username, s.score, userId, s.created_at]);
    scores++;
  }
  for (const m of data.messages || []) {
    const dup = await db.get('SELECT id FROM messages WHERE email = ? AND created_at = ? AND message = ?', [m.email, m.created_at, m.message]);
    if (dup) continue;
    await db.run('INSERT INTO messages (name, email, subject, message, topic, created_at) VALUES (?, ?, ?, ?, ?, ?)', [m.name, m.email, m.subject, m.message, m.topic, m.created_at]);
    messages++;
  }
  console.log(`Done: ${added} players added, ${skipped} skipped, ${scores} scores, ${messages} messages.`);
  await db.close();
})().catch(err => { console.error(err.message); process.exit(1); });
