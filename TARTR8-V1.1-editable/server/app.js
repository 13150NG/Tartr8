const path = require('path');
const express = require('express');
const GAMES = require('./games');
const { createAuth, publicUser, EMAIL_RE } = require('./auth');
const { sqlTime } = require('./db');
const { TOPICS, subjectFor } = require('./topics');

const ROOT = path.join(__dirname, '..');

// Small in-memory limiter: at most `max` requests per `windowMs` per key (the visitor's IP by default).
function rateLimit({ windowMs, max, enabled = true, key = req => req.ip }) {
  if (!enabled) return (req, res, next) => next();
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now(), id = key(req);
    const recent = (hits.get(id) || []).filter(t => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    recent.push(now);
    hits.set(id, recent);
    next();
  };
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength) : '';
}

function createApp(db, { rateLimits = true } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // behind Vercel / cPanel proxies: use the real visitor IP for rate limits
  app.use(express.json({ limit: '10kb' }));
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const auth = createAuth(db);
  app.use(auth.loadUser);

  // Per game: each user's best score, best first; a user's best; how many users beat a score.
  const q = {};
  for (const [id, game] of Object.entries(GAMES)) {
    const best = game.lowerIsBetter ? 'MIN' : 'MAX';
    const order = game.lowerIsBetter ? 'ASC' : 'DESC';
    const beats = game.lowerIsBetter ? '<' : '>';
    q[id] = {
      // Ties go to whoever reached the score first.
      board: limit => db.all(`
        WITH best AS (
          SELECT user_id, ${best}(score) AS score, COUNT(*) AS plays
          FROM scores WHERE game = ? AND user_id IS NOT NULL GROUP BY user_id
        )
        SELECT u.username, best.score, best.plays,
               (SELECT MIN(created_at) FROM scores x WHERE x.game = ? AND x.user_id = best.user_id AND x.score = best.score) AS achieved_at
        FROM best JOIN users u ON u.id = best.user_id
        ORDER BY best.score ${order}, achieved_at ASC
        LIMIT ?`, [id, id, limit]),
      userBest: async userId => (await db.get(`SELECT ${best}(score) AS score FROM scores WHERE game = ? AND user_id = ?`, [id, userId])).score,
      rankOf: async score => (await db.get(`
        SELECT COUNT(*) AS n FROM (SELECT ${best}(score) AS b FROM scores WHERE game = ? AND user_id IS NOT NULL GROUP BY user_id) per_user
        WHERE b ${beats} ?`, [id, score])).n + 1,
      players: async () => (await db.get('SELECT COUNT(DISTINCT user_id) AS n FROM scores WHERE game = ? AND user_id IS NOT NULL', [id])).n
    };
  }

  const api = express.Router();

  api.get('/health', (req, res) => res.json({ ok: true }));

  api.get('/games', (req, res) => res.json(GAMES));

  const authLimit = rateLimit({ windowMs: 10 * 60_000, max: 15, enabled: rateLimits });
  api.post('/auth/register', authLimit, auth.register);
  api.post('/auth/login', authLimit, auth.login);
  api.post('/auth/logout', auth.logout);

  // Current user plus their best score and rank in every game.
  api.get('/auth/me', async (req, res) => {
    if (!req.user) return res.json({ user: null });
    const bests = {};
    for (const id of Object.keys(GAMES)) {
      const score = await q[id].userBest(req.user.id);
      if (score !== null) bests[id] = { score, rank: await q[id].rankOf(score) };
    }
    res.json({ user: publicUser(req.user), bests });
  });

  api.get('/scores/:game', async (req, res) => {
    const id = req.params.game, game = GAMES[id];
    if (!game) return res.status(404).json({ error: 'Unknown game.' });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const scores = (await q[id].board(limit)).map((row, i) => ({ rank: i + 1, ...row }));
    let me = null;
    if (req.user) {
      const score = await q[id].userBest(req.user.id);
      if (score !== null) me = { username: req.user.username, score, rank: await q[id].rankOf(score) };
    }
    res.json({ game: id, name: game.name, unit: game.unit, lowerIsBetter: game.lowerIsBetter, players: await q[id].players(), scores, me });
  });

  // Scores post automatically after every game, and a Reaction round takes only a few seconds.
  // Counted per player, not per IP: behind the host's proxy many players can share one address.
  api.post('/scores', auth.requireUser, rateLimit({ windowMs: 60_000, max: 60, enabled: rateLimits, key: req => req.user.id }), async (req, res) => {
    const { game: id, score } = req.body || {};
    const game = GAMES[id];
    if (!game) return res.status(400).json({ error: 'Unknown game.' });
    if (!Number.isInteger(score) || score < game.min || score > game.max) {
      return res.status(400).json({ error: 'That score is not valid.' });
    }

    const previous = await q[id].userBest(req.user.id);
    await db.run('INSERT INTO scores (game, name, score, user_id, created_at) VALUES (?, ?, ?, ?, ?)', [id, req.user.username, score, req.user.id, sqlTime()]);
    const best = await q[id].userBest(req.user.id);
    const rank = await q[id].rankOf(best);
    res.status(201).json({ ok: true, rank, best, newBest: previous === null || best !== previous });
  });

  api.post('/contact', rateLimit({ windowMs: 10 * 60_000, max: 5, enabled: rateLimits }), async (req, res) => {
    const name = cleanText(req.body?.name, 80);
    const email = cleanText(req.body?.email, 120);
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : '';
    // Hidden "website" field: real people leave it empty, spam bots fill it in.
    if (req.body?.website) return res.status(201).json({ ok: true });
    if (!name) return res.status(400).json({ error: 'Please enter your name.' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
    if (message.length < 10) return res.status(400).json({ error: 'Message must be at least 10 characters.' });

    const topic = req.body?.topic in TOPICS ? req.body.topic : 'other';
    const subject = subjectFor(topic);
    await db.run('INSERT INTO messages (name, email, subject, message, topic, created_at) VALUES (?, ?, ?, ?, ?, ?)', [name, email, subject, message, topic, sqlTime()]);
    res.status(201).json({ ok: true, subject });
  });

  api.use((req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use('/api', api);

  // Serve only the public site files — never server code, the database or package files.
  for (const dir of ['css', 'js', 'assets']) app.use('/' + dir, express.static(path.join(ROOT, dir), { maxAge: dir === 'assets' ? '7d' : 0 }));
  app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
  app.get(['/store', '/store/'], (req, res) => res.sendFile(path.join(ROOT, 'store.html')));
  for (const file of ['game.html', 'store.html', 'robots.txt', 'sitemap.xml', 'site.webmanifest']) {
    app.get('/' + file, (req, res) => res.sendFile(path.join(ROOT, file)));
  }
  // Unknown pages get a real 404 (not the homepage), so search engines don't index duplicates.
  app.use((req, res) => res.status(404).sendFile(path.join(ROOT, '404.html')));

  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  });

  return app;
}

module.exports = { createApp };
