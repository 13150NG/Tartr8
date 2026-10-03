const { openDatabase } = require('./db');
const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 3000;

(async () => {
  const db = await openDatabase();
  const app = createApp(db);

  const server = app.listen(PORT, () => {
    console.log(`TARTR8 running at http://localhost:${PORT}`);
    console.log(`Database: ${db.kind === 'libsql' ? 'Turso (' + process.env.TURSO_DATABASE_URL + ')' : 'SQLite file'}`);
  });

  function shutdown() {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})();
