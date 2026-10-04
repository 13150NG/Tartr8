// Lists player accounts, newest first, with how many scores each has posted: `npm run accounts`
// Reads the local SQLite file, or the live database when run via `npm run accounts:live`.
const { openDatabase } = require('./db');

(async () => {
  const db = await openDatabase();
  const users = await db.all(`
    SELECT u.id, u.username, u.email, u.created_at, COUNT(s.id) AS plays
    FROM users u LEFT JOIN scores s ON s.user_id = u.id
    GROUP BY u.id, u.username, u.email, u.created_at
    ORDER BY u.id DESC`);

  if (!users.length) console.log('No accounts yet.');
  else {
    console.log(`${users.length} account${users.length === 1 ? '' : 's'}:\n`);
    console.table(users.map(u => ({ id: u.id, username: u.username, email: u.email, joined: u.created_at + ' UTC', 'scores posted': Number(u.plays) })));
  }
  await db.close();
})();
