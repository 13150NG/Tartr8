const modal = document.getElementById('gameModal');
const area = document.getElementById('gameArea');
if (document.querySelector('.modal-close')) document.querySelector('.modal-close').onclick = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); };
if (modal) modal.onclick = e => { if (e.target === modal) { modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); } };
function openGame(game){ modal.classList.add('open'); modal.setAttribute('aria-hidden','false'); ({reaction:reaction,memory:memory,number:numberGame})[game](); }
document.querySelectorAll('.game-launch').forEach(b => b.onclick = () => openGame(b.dataset.game));
