// Vercel serverless entry: every /api/* request is handled by the Express app.
// The database connection (Turso on Vercel) is opened once per warm instance and reused.
const { openDatabase } = require('../server/db');
const { createApp } = require('../server/app');

let appPromise;
const getApp = () => (appPromise ??= openDatabase().then(db => createApp(db)).catch(err => {
  appPromise = undefined; // retry on the next request instead of caching the failure
  throw err;
}));

module.exports = async (req, res) => {
  try {
    (await getApp())(req, res);
  } catch (err) {
    console.error(err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Database unavailable. Connect a database (Neon Postgres: DATABASE_URL).' }));
  }
};
