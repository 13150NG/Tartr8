const modal = document.getElementById('gameModal');
const area = document.getElementById('gameArea');
const games = { reaction, memory, number: numberGame };
let stopGame = null, lastFocus = null;

function openGame(game) {
  if (!games[game]) return;
  lastFocus = document.activeElement;
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  stopGame = games[game]();
}

function closeGame() {
  if (!modal.classList.contains('open')) return;
  if (stopGame) stopGame();
  stopGame = null;
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  area.innerHTML = '';
  showBestScores();
  if (lastFocus) lastFocus.focus();
}

document.querySelector('.modal-close').onclick = closeGame;
modal.onclick = e => { if (e.target === modal) closeGame(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGame(); });

// The whole card is clickable; the Catch card links to its own page.
document.querySelectorAll('.game-card').forEach(card => {
  card.onclick = e => {
    if (card.dataset.game === 'catch') {
      if (!e.target.closest('a')) location.href = 'game.html';
      return;
    }
    openGame(card.dataset.game);
  };
});

// Footer game links open the game directly.
document.querySelectorAll('[data-open-game]').forEach(link => {
  link.onclick = e => { e.preventDefault(); openGame(link.dataset.openGame); };
});

function showBestScores() {
  document.querySelectorAll('.game-best').forEach(el => {
    const value = store.get(el.dataset.best);
    el.textContent = value && value !== '0'
      ? `Your best: ${el.dataset.prefix || ''}${value}${el.dataset.unit || ''}`
      : '';
  });
}
showBestScores();

// Pause decorative animations in sections that aren't on screen.
const offscreenObserver = new IntersectionObserver(entries => {
  entries.forEach(e => e.target.classList.toggle('offscreen', !e.isIntersecting));
}, { rootMargin: '150px 0px' });
document.querySelectorAll('main > section, .site-footer').forEach(el => offscreenObserver.observe(el));
