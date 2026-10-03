const crypto = require('crypto');
const { sqlTime } = require('./db');

const COOKIE = 'tartr8_session';
const SESSION_DAYS = 30;
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const hash = token => crypto.createHash('sha256').update(token).digest('hex');

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function cookieHeader(req, value, maxAgeSeconds) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function createAuth(db) {
  // lower() on both sides: usernames and emails are case-insensitive on every database.
  const userByUsername = username => db.get('SELECT * FROM users WHERE lower(username) = lower(?)', [username]);
  const userByEmail = email => db.get('SELECT * FROM users WHERE lower(email) = lower(?)', [email]);

  async function startSession(req, res, user) {
    await db.run('DELETE FROM sessions WHERE expires_at <= ?', [sqlTime()]);
    const token = crypto.randomBytes(32).toString('base64url');
    await db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [hash(token), user.id, sqlTime(SESSION_DAYS)]);
    res.set('Set-Cookie', cookieHeader(req, token, SESSION_DAYS * 86400));
  }

  // Attaches req.user (or null) on every request.
  async function loadUser(req, res, next) {
    const token = readCookie(req, COOKIE);
    req.user = token
      ? await db.get(`SELECT u.id, u.username, u.email, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id
                      WHERE s.token_hash = ? AND s.expires_at > ?`, [hash(token), sqlTime()]) || null
      : null;
    next();
  }

  function requireUser(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Please sign in first.' });
    next();
  }

  function normalize(body) {
    return {
      username: typeof body?.username === 'string' ? body.username.trim() : '',
      email: typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    };
  }

  async function register(req, res) {
    const { username, email } = normalize(req.body);
    if (!USERNAME_RE.test(username)) {
      return res.status(400).json({ error: 'Username must be 3–20 characters: letters, numbers or _.' });
    }
    if (email.length > 120 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (await userByUsername(username)) return res.status(409).json({ error: 'That username is already taken.', field: 'username' });
    if (await userByEmail(email)) return res.status(409).json({ error: 'This email already has an account. Sign in instead.', field: 'email' });

    let lastInsertRowid;
    try {
      ({ lastInsertRowid } = await db.run('INSERT INTO users (username, email, created_at) VALUES (?, ?, ?)', [username, email, sqlTime()]));
    } catch (err) {
      // Two sign-ups racing for the same name: the UNIQUE constraint catches the loser.
      if (/UNIQUE|duplicate key/i.test(err.message)) return res.status(409).json({ error: 'That username or email was just taken.', field: 'username' });
      throw err;
    }
    const user = { id: lastInsertRowid, username, email };
    await startSession(req, res, user);
    res.status(201).json({ user: publicUser(user) });
  }

  async function login(req, res) {
    const { username, email } = normalize(req.body);
    const user = username && await userByUsername(username);
    // Same message whether the username or the email is wrong, so accounts can't be probed one field at a time.
    if (!user || user.email.toLowerCase() !== email) {
      return res.status(401).json({ error: 'Username and email don\'t match an account.' });
    }
    await startSession(req, res, user);
    res.json({ user: publicUser(user) });
  }

  async function logout(req, res) {
    const token = readCookie(req, COOKIE);
    if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', [hash(token)]);
    res.set('Set-Cookie', cookieHeader(req, '', 0));
    res.json({ ok: true });
  }

  return { loadUser, requireUser, register, login, logout };
}

const publicUser = u => ({ id: u.id, username: u.username });

module.exports = { createAuth, publicUser, EMAIL_RE };
