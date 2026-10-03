// Leaderboard section + contact form. Only active when the backend is running.

const lbPodium = document.getElementById('lbPodium');
const lbList = document.getElementById('lbList');
const lbMe = document.getElementById('lbMe');
const lbInfo = document.getElementById('lbInfo');
const lbTabs = [...document.querySelectorAll('.lb-tabs button')];
let lbGame = 'reaction';
try { if (lbTabs.some(t => t.dataset.game === localStorage.getItem('tartr8LbGame'))) lbGame = localStorage.getItem('tartr8LbGame'); } catch {}

const CROWN = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg>';
const PLACES = ['', '1st', '2nd', '3rd'];

// Reuse each game card's icon in its tab.
lbTabs.forEach(tab => {
  const icon = document.querySelector(`.game-card[data-game="${tab.dataset.game}"] .game-icon svg`);
  if (icon) tab.querySelector('.lb-tab-icon').appendChild(icon.cloneNode(true));
});

function relativeDay(sqlDate) {
  const days = Math.floor((Date.now() - new Date(sqlDate.replace(' ', 'T') + 'Z')) / 86400000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}
const initial = name => escapeHtml(name[0].toUpperCase());
const isMe = name => !!currentUser && name.toLowerCase() === currentUser.username.toLowerCase();

function playButton(game, label) {
  return game === 'catch'
    ? `<a class="btn btn-primary" href="game.html">${label} <span aria-hidden="true">→</span></a>`
    : `<button class="btn btn-primary" type="button" data-play="${game}">${label} <span aria-hidden="true">→</span></button>`;
}

function renderPodium(board) {
  const top = board.scores.slice(0, 3);
  return [1, 2, 3].map(place => {
    const s = top[place - 1];
    if (!s) return `<div class="pod p${place} empty"><div class="pod-avatar">?</div><div class="pod-place">${PLACES[place]}</div><div class="pod-name">Open spot</div><div class="pod-score">—</div></div>`;
    return `<div class="pod p${place}${isMe(s.username) ? ' me' : ''}">
        ${place === 1 ? `<div class="pod-crown">${CROWN}</div>` : ''}
        <div class="pod-avatar">${initial(s.username)}</div>
        <div class="pod-place">${PLACES[place]}</div>
        <div class="pod-name" title="${escapeHtml(s.username)}">${escapeHtml(s.username)}</div>
        <div class="pod-score">${s.score}<small>${board.unit}</small></div>
        <div class="pod-meta">${s.plays} play${s.plays === 1 ? '' : 's'} · ${relativeDay(s.achieved_at)}</div>
      </div>`;
  }).join('');
}

// What score beats a given score (ties go to whoever got there first).
const beatScore = (board, score) => board.lowerIsBetter ? score - 1 : score + 1;
const beatWord = board => board.lowerIsBetter ? 'or faster' : 'or more';

function renderMe(board) {
  if (!currentUser) {
    return `<div class="lb-card-label">Join the leaderboard</div>
      <p>Create a free account with just a username and email, then post your scores after each game.</p>
      <button class="btn btn-primary" type="button" data-signin>Sign in or join <span aria-hidden="true">→</span></button>`;
  }
  const head = `<div class="lb-me-head"><span class="avatar">${initial(currentUser.username)}</span><div><strong>${escapeHtml(currentUser.username)}</strong><span>Your standing in ${escapeHtml(board.name)}</span></div></div>`;
  if (!board.me) {
    return `${head}<p>You haven't posted a ${escapeHtml(board.name)} score yet.</p>${playButton(board.game, `Play ${board.name}`)}`;
  }
  const { rank, score } = board.me;
  let goal;
  if (rank === 1) {
    goal = `You're the champion 👑 — keep playing to defend the crown.`;
  } else {
    const above = board.scores.find(s => s.rank === rank - 1);
    const lastShown = board.scores[board.scores.length - 1];
    goal = above
      ? `Get <strong>${beatScore(board, above.score)} ${board.unit}</strong> ${beatWord(board)} to pass ${escapeHtml(above.username)} for #${rank - 1}.`
      : `Get <strong>${beatScore(board, lastShown.score)} ${board.unit}</strong> ${beatWord(board)} to break into the top ${board.scores.length}.`;
  }
  return `${head}
    <div class="lb-me-stats">
      <div><small>Rank</small><b>#${rank}<em> of ${board.players}</em></b></div>
      <div><small>Best</small><b>${score}<em> ${board.unit}</em></b></div>
    </div>
    <div class="lb-goal">${goal}</div>
    ${playButton(board.game, 'Play again')}`;
}

function renderInfo(board) {
  return `<div class="lb-card-label">About this board</div>
    <div class="lb-info-rows">
      <div class="lb-info-row"><span>Players ranked</span><b>${board.players}</b></div>
      <div class="lb-info-row"><span>Ranked by</span><b>${board.lowerIsBetter ? 'Fastest time' : 'Highest score'}</b></div>
      <div class="lb-info-row"><span>Ties</span><b>First to reach it wins</b></div>
    </div>
    ${currentUser && board.me ? '' : playButton(board.game, `Play ${board.name}`)}`;
}

async function loadLeaderboard(game = lbGame) {
  lbGame = game;
  try { localStorage.setItem('tartr8LbGame', game); } catch {}
  lbTabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.game === game)));
  lbPodium.style.opacity = lbList.style.opacity = '.4';
  try {
    const board = await apiRequest('/scores/' + game);
    if (lbGame !== game) return;
    lbPodium.style.opacity = lbList.style.opacity = '';

    if (!board.scores.length) {
      lbPodium.innerHTML = `<div class="lb-empty-state" style="grid-column: 1 / -1">
          <div class="pod-crown">${CROWN}</div>
          <h3>No champion yet</h3>
          <p>Nobody has posted a ${escapeHtml(board.name)} score. The crown is up for grabs.</p>
          ${playButton(game, `Play ${board.name}`)}
        </div>`;
      lbList.innerHTML = '';
    } else {
      lbPodium.innerHTML = renderPodium(board);
      const rest = board.scores.slice(3);
      lbList.innerHTML = rest.map(s => `<li class="${isMe(s.username) ? 'me' : ''}">
          <span class="lb-rank">${String(s.rank).padStart(2, '0')}</span>
          <span class="lb-avatar">${initial(s.username)}</span>
          <span class="lb-who"><span class="lb-name">${escapeHtml(s.username)}</span><span class="lb-when">${s.plays} play${s.plays === 1 ? '' : 's'} · best set ${relativeDay(s.achieved_at)}</span></span>
          <span class="lb-score">${s.score}<small>${board.unit}</small></span>
        </li>`).join('')
        + (board.me && board.me.rank > board.scores.length
          ? `<li class="lb-note">… you're #${board.me.rank} with ${board.me.score} ${board.unit}</li>` : '');
    }
    lbMe.innerHTML = renderMe(board);
    lbInfo.innerHTML = renderInfo(board);
  } catch (err) {
    lbPodium.style.opacity = lbList.style.opacity = '';
    lbPodium.innerHTML = `<div class="lb-empty-state" style="grid-column: 1 / -1"><h3>Couldn't load scores</h3><p>${escapeHtml(err.message)}</p><button class="btn btn-ghost" type="button" data-retry>Try again</button></div>`;
    lbList.innerHTML = '';
  }
}

document.getElementById('leaderboard').addEventListener('click', e => {
  const play = e.target.closest('[data-play]');
  if (play) return openGame(play.dataset.play);
  if (e.target.closest('[data-signin]')) return openAuth({ reason: 'Sign in or create an account to join the leaderboard.' });
  if (e.target.closest('[data-retry]')) return loadLeaderboard();
});

lbTabs.forEach(tab => tab.addEventListener('click', () => loadLeaderboard(tab.dataset.game)));
// Arrow keys move between tabs.
document.querySelector('.lb-tabs').addEventListener('keydown', e => {
  if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const i = lbTabs.findIndex(t => t.dataset.game === lbGame);
  const next = lbTabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + lbTabs.length) % lbTabs.length];
  next.focus();
  loadLeaderboard(next.dataset.game);
});
document.addEventListener('tartr8:score', e => loadLeaderboard(e.detail.game));
document.addEventListener('tartr8:auth', () => loadLeaderboard());

const contactForm = document.getElementById('contactForm');
const contactSent = document.getElementById('contactSent');
const charCount = document.getElementById('charCount');

contactForm.elements.message.addEventListener('input', () => { charCount.textContent = contactForm.elements.message.value.length; });
contactForm.addEventListener('input', e => e.target.classList.remove('invalid'));

contactForm.addEventListener('submit', async e => {
  e.preventDefault();
  const msg = contactForm.querySelector('.form-msg'), btn = contactForm.querySelector('button[type=submit]');
  const data = Object.fromEntries(new FormData(contactForm));

  // Quick checks before hitting the server, so the problem field can be highlighted.
  const problems = [
    [!data.name.trim(), 'name', 'Please enter your name.'],
    [!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()), 'email', 'Please enter a valid email address.'],
    [data.message.trim().length < 10, 'message', 'Message must be at least 10 characters.']
  ].filter(([bad]) => bad);
  if (problems.length) {
    problems.forEach(([, field]) => contactForm.elements[field].classList.add('invalid'));
    msg.className = 'form-msg bad';
    msg.textContent = problems[0][2];
    contactForm.elements[problems[0][1]].focus();
    return;
  }

  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = 'Sending…';
  try {
    await apiRequest('/contact', data);
    contactForm.reset();
    charCount.textContent = 0;
    msg.textContent = '';
    contactForm.hidden = true;
    contactSent.hidden = false;
    contactSent.querySelector('button').focus();
  } catch (err) {
    msg.className = 'form-msg bad';
    msg.textContent = err.message;
  }
  btn.disabled = false;
});

// Service buttons in the Tech section pre-fill the contact form.
document.querySelectorAll('a[data-topic]').forEach(link => link.addEventListener('click', () => {
  const radio = contactForm.querySelector(`input[name=topic][value="${link.dataset.topic}"]`);
  if (radio) radio.checked = true;
  const message = contactForm.elements.message;
  if (link.dataset.message && !message.value.trim()) {
    message.value = link.dataset.message;
    charCount.textContent = message.value.length;
  }
  if (!document.documentElement.classList.contains('online')) return; // offline: the email link is shown instead
  contactSent.hidden = true;
  contactForm.hidden = false;
  // Focus after the smooth scroll has had time to land.
  setTimeout(() => {
    const target = contactForm.elements.name.value ? message : contactForm.elements.name;
    target.focus({ preventScroll: true });
    if (target === message) message.setSelectionRange(message.value.length, message.value.length);
  }, 600);
}));

document.getElementById('sendAnother').addEventListener('click', () => {
  contactSent.hidden = true;
  contactForm.hidden = false;
  contactForm.elements.name.focus();
});

authReady.then(() => apiReady).then(online => { if (online) loadLeaderboard(); });
