// Talks to the Node backend. When the site is opened without it (e.g. as a plain file),
// `apiReady` resolves to false and every online feature stays hidden.

const apiReady = location.protocol.startsWith('http')
  ? fetch('/api/health').then(r => r.ok).catch(() => false)
  : Promise.resolve(false);

apiReady.then(online => {
  document.documentElement.classList.toggle('online', online);
  const status = document.getElementById('siteStatus');
  if (status) {
    status.classList.toggle('up', online);
    status.lastChild.textContent = online ? 'All systems online' : 'Offline mode — games still work';
  }
  document.querySelectorAll('[data-online]').forEach(el => { el.hidden = !online; });
  document.querySelectorAll('[data-offline]').forEach(el => { el.hidden = online; });
});

async function apiRequest(path, body) {
  const res = await fetch('/api' + path, body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  } : undefined);
  const data = await res.json().catch(() => null);
  // Anything but JSON (e.g. a host error or security page) means the request never reached the app.
  if (!data) throw Object.assign(new Error('Could not reach the server. Please try again.'), { status: res.status });
  if (!res.ok) throw Object.assign(new Error(data.error || 'Could not reach the server.'), { field: data.field, status: res.status });
  return data;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Account state ---------- */

let currentUser = null;
const authReady = apiReady.then(async online => {
  if (!online) return null;
  try { currentUser = (await apiRequest('/auth/me')).user; } catch {}
  renderAccountButton();
  renderPlayerTags();
  return currentUser;
});

function setUser(user) {
  currentUser = user;
  renderAccountButton();
  renderPlayerTags();
  document.dispatchEvent(new CustomEvent('tartr8:auth', { detail: { user } }));
}

async function signOut() {
  await apiRequest('/auth/logout', {}).catch(() => {});
  setUser(null);
}

/* ---------- Header account button + menu ---------- */

function renderAccountButton() {
  const btn = document.querySelector('.account-btn');
  if (!btn) return;
  btn.hidden = false;
  btn.innerHTML = currentUser
    ? `<span class="avatar" aria-hidden="true">${escapeHtml(currentUser.username[0].toUpperCase())}</span><span class="account-name">${escapeHtml(currentUser.username)}</span>`
    : 'Sign in';
  btn.setAttribute('aria-label', currentUser ? `Account: ${currentUser.username}` : 'Sign in');
  btn.classList.toggle('signed-in', !!currentUser);
}

document.addEventListener('click', async e => {
  const btn = e.target.closest('.account-btn');
  const menu = document.querySelector('.account-menu');
  if (btn) {
    if (!currentUser) return openAuth();
    if (menu) return menu.remove();
    const m = document.createElement('div');
    m.className = 'account-menu';
    m.innerHTML = `<div class="account-menu-head">Signed in as<strong>${escapeHtml(currentUser.username)}</strong></div>
      <div class="account-bests">Loading your scores…</div>
      <button class="account-signout">Sign out</button>`;
    btn.after(m);
    m.querySelector('.account-signout').onclick = () => { m.remove(); signOut(); };
    try {
      const [{ bests }, games] = await Promise.all([apiRequest('/auth/me'), apiRequest('/games')]);
      const rows = Object.entries(games).map(([id, g]) => {
        const b = bests[id];
        return `<li><span>${escapeHtml(g.name)}</span>${b ? `<strong>${b.score} ${g.unit}</strong><em>#${b.rank}</em>` : '<small>not played</small>'}</li>`;
      }).join('');
      m.querySelector('.account-bests').innerHTML = `<ul>${rows}</ul>`;
    } catch { m.querySelector('.account-bests').textContent = ''; }
    return;
  }
  if (menu && !e.target.closest('.account-menu')) menu.remove();
});

/* ---------- "Who's playing" badge on game screens ---------- */

function renderPlayerTags() {
  document.querySelectorAll('.player-tag').forEach(tag => {
    tag.hidden = false;
    tag.classList.toggle('guest', !currentUser);
    tag.innerHTML = currentUser
      ? `<span class="avatar" aria-hidden="true">${escapeHtml(currentUser.username[0].toUpperCase())}</span>
         <span class="player-label">PLAYER 1</span><strong>${escapeHtml(currentUser.username)}</strong>`
      : `<span class="avatar" aria-hidden="true">?</span>
         <span class="player-label">PLAYING AS</span><strong>Guest</strong>
         <button type="button" class="link-btn">Sign in</button>`;
    tag.querySelector('.link-btn')?.addEventListener('click', () => openAuth({ reason: 'Sign in so your scores count on the leaderboard.' }));
  });
}

/* ---------- Sign in / create account dialog ---------- */

function openAuth({ mode = 'signin', reason = '', onSuccess } = {}) {
  document.querySelector('.auth-modal')?.remove();
  const lastFocus = document.activeElement;
  const modal = document.createElement('div');
  modal.className = 'game-modal auth-modal open';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Account');
  modal.innerHTML = `<div class="game-modal-panel auth-panel">
      <button class="modal-close" aria-label="Close">×</button>
      <div class="eyebrow"><span></span> TARTR8 PLAYER</div>
      <div class="auth-tabs" role="tablist">
        <button role="tab" data-mode="signin">Sign in</button>
        <button role="tab" data-mode="register">Create account</button>
      </div>
      ${reason ? `<p class="auth-reason">${escapeHtml(reason)}</p>` : ''}
      <form class="auth-form" novalidate>
        <label>Username<input name="username" autocomplete="username" maxlength="20" required spellcheck="false" autocapitalize="off"></label>
        <p class="auth-hint" data-for="register">3–20 characters: letters, numbers or _. This is the name on the leaderboard and can't be shared.</p>
        <label>Email<input name="email" type="email" autocomplete="email" maxlength="120" required></label>
        <p class="auth-hint" data-for="register">One account per email. Use the same username and email to sign in later.</p>
        <div class="auth-error" aria-live="polite"></div>
        <button class="btn btn-primary auth-submit" type="submit"></button>
      </form>
    </div>`;
  document.body.appendChild(modal);
  document.body.classList.add('modal-open');

  const form = modal.querySelector('form'), errorEl = modal.querySelector('.auth-error'), submit = modal.querySelector('.auth-submit');
  function setMode(m) {
    mode = m;
    modal.querySelectorAll('.auth-tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === m)));
    modal.querySelectorAll('.auth-hint').forEach(h => { h.hidden = m !== 'register'; });
    submit.textContent = m === 'register' ? 'Create account' : 'Sign in';
    errorEl.textContent = '';
    form.querySelectorAll('input').forEach(i => i.classList.remove('invalid'));
  }
  function close() {
    modal.remove();
    if (!document.querySelector('.game-modal.open')) document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey, true);
    lastFocus?.focus?.();
  }
  function onKey(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }
  document.addEventListener('keydown', onKey, true);

  modal.querySelectorAll('.auth-tabs button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  modal.querySelector('.modal-close').onclick = close;
  modal.onclick = e => { if (e.target === modal) close(); };

  form.onsubmit = async e => {
    e.preventDefault();
    const body = { username: form.username.value.trim(), email: form.email.value.trim() };
    form.querySelectorAll('input').forEach(i => i.classList.remove('invalid'));
    if (!body.username || !body.email) { errorEl.textContent = 'Enter your username and email.'; return; }
    submit.disabled = true;
    errorEl.textContent = '';
    try {
      const { user } = await apiRequest(mode === 'register' ? '/auth/register' : '/auth/login', body);
      setUser(user);
      close();
      onSuccess?.(user);
    } catch (err) {
      errorEl.textContent = err.message;
      if (err.field) form[err.field]?.classList.add('invalid');
      if (err.field === 'email' && mode === 'register') {
        errorEl.innerHTML = `${escapeHtml(err.message)} <button type="button" class="link-btn">Sign in</button>`;
        errorEl.querySelector('.link-btn').onclick = () => setMode('signin');
      }
    }
    submit.disabled = false;
  };

  setMode(mode);
  form.username.focus();
}

/* ---------- Post-game: post to the leaderboard ---------- */

// Guests play as often as they like. Their best score per game is kept for this browser tab, and
// a button under the game lets them create an account to post it whenever they choose.
// Lower is better for these games — keep in step with server/games.js.
const LOWER_IS_BETTER = { reaction: true };
const GUEST_BEST_KEY = 'tartr8-guest-best';

function guestBests() {
  try { return JSON.parse(sessionStorage.getItem(GUEST_BEST_KEY)) || {}; } catch { return {}; }
}
function saveGuestBests(bests) {
  try { sessionStorage.setItem(GUEST_BEST_KEY, JSON.stringify(bests)); } catch { /* private mode: best lasts for this page only */ }
}
let guestBestCache = guestBests();
function recordGuestScore(game, score) {
  const best = guestBestCache[game];
  const better = best === undefined || (LOWER_IS_BETTER[game] ? score < best : score > best);
  if (better) { guestBestCache = { ...guestBestCache, [game]: score }; saveGuestBests(guestBestCache); }
  return guestBestCache[game];
}
function clearGuestScore(game) {
  const { [game]: _, ...rest } = guestBestCache;
  guestBestCache = rest;
  saveGuestBests(rest);
}
const formatScore = (game, score) => LOWER_IS_BETTER[game] ? `${score}ms` : String(score);

// Signed-in players' scores post automatically when a game ends.
async function offerScoreSubmit(slot, game, score) {
  if (!slot || !(score > 0) || !(await apiReady)) return;
  await authReady;

  // A dropped connection, a host error page or a busy server usually clears within seconds,
  // so retry those quietly. A 4xx answer (signed out, invalid score, too many requests) is final.
  async function send() {
    for (let attempt = 1; ; attempt++) {
      try {
        return await apiRequest('/scores', { game, score });
      } catch (err) {
        if ((err.status >= 400 && err.status < 500) || attempt === 3) {
          if (!err.status) err.message = 'Could not reach the server. Please try again.';
          throw err;
        }
        await new Promise(r => setTimeout(r, attempt * 1500));
      }
    }
  }

  async function post() {
    slot.innerHTML = `<div class="submit-score"><div class="submit-msg">Posting…</div></div>`;
    try {
      const { rank, best, newBest } = await send();
      clearGuestScore(game);
      const where = rank === 1 ? `You're the champion! 👑` : `You're #${rank} on the leaderboard.`;
      slot.innerHTML = `<div class="submit-score"><div class="submit-msg good">${newBest ? 'New best posted. ' : `Posted. Your best is still ${best}. `}${where}</div></div>`;
      document.dispatchEvent(new CustomEvent('tartr8:score', { detail: { game } }));
    } catch (err) {
      if (err.status === 401) { setUser(null); return offerGuestPost(); }
      slot.innerHTML = `<div class="submit-score"><div class="submit-msg bad">${escapeHtml(err.message)}</div><button class="submit-btn">Try again</button></div>`;
      slot.querySelector('.submit-btn').onclick = post;
    }
  }

  // No popup: the guest keeps playing, and the button is there when they want to post.
  function offerGuestPost() {
    const shown = formatScore(game, score);
    slot.innerHTML = `<div class="submit-score">
        <span>Your best this visit: <strong>${escapeHtml(shown)}</strong>. Sign up to put it on the leaderboard.</span>
        <button class="submit-btn">Post best score</button>
      </div>`;
    slot.querySelector('.submit-btn').onclick = () => openAuth({
      mode: 'register',
      reason: `Create an account (or sign in) to post your best score of ${shown}.`,
      onSuccess: post
    });
  }

  if (currentUser) return post();
  score = recordGuestScore(game, score); // post the guest's best, not just this round
  offerGuestPost();
}
