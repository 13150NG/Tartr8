// Prints contact-form messages, newest first: `npm run messages`
// Reads the local SQLite file, or Turso when TURSO_DATABASE_URL / TURSO_AUTH_TOKEN are set.
const { openDatabase } = require('./db');

(async () => {
  const db = await openDatabase();
  const rows = await db.all('SELECT * FROM messages ORDER BY id DESC');

  if (!rows.length) console.log('No messages yet.');
  for (const m of rows) {
    console.log(`#${m.id}  ${m.created_at}  ${m.name} <${m.email}>`);
    console.log(`    Subject: ${m.subject || m.topic}`);
    console.log(m.message.replace(/^/gm, '    '));
    console.log();
  }
  await db.close();
})();
