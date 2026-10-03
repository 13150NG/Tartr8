// Hero section: mouse tilt, stat count-up, live champion chip.

(function hero() {
  const hero = document.querySelector('.hero');
  const visual = hero?.querySelector('.hero-visual');
  if (!visual) return;

  const motionOK = matchMedia('(prefers-reduced-motion: no-preference)').matches;

  // Tilt the visual toward the mouse.
  if (motionOK && matchMedia('(hover: hover)').matches) {
    let frame;
    hero.addEventListener('pointermove', e => {
      const r = visual.getBoundingClientRect();
      const mx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      const my = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        visual.style.setProperty('--mx', (mx * .6).toFixed(3));
        visual.style.setProperty('--my', (my * .6).toFixed(3));
      });
    });
    hero.addEventListener('pointerleave', () => {
      visual.style.setProperty('--mx', 0);
      visual.style.setProperty('--my', 0);
    });
  }

  // Count the stats up from zero.
  document.querySelectorAll('.hero-stats [data-count]').forEach(el => {
    const target = Number(el.dataset.count), pad = Number(el.dataset.pad || 1);
    const show = n => { el.textContent = String(n).padStart(pad, '0'); };
    if (!motionOK) return show(target);
    const start = performance.now(), duration = 900;
    show(0);
    requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      show(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) requestAnimationFrame(tick);
    });
  });

  // Champion chip: the busiest game's current #1, if the backend is running.
  const label = document.getElementById('heroChampLabel'), name = document.getElementById('heroChamp');
  async function loadChampion() {
    if (!(await apiReady)) { label.textContent = 'Leaderboard'; name.textContent = 'Top score wins'; return; }
    try {
      const boards = await Promise.all(['reaction', 'memory', 'number', 'catch'].map(g => apiRequest(`/scores/${g}?limit=1`)));
      const best = boards.filter(b => b.scores.length).sort((a, b) => b.players - a.players)[0];
      if (!best) { label.textContent = 'Champion'; name.textContent = 'Be the first'; return; }
      const top = best.scores[0];
      label.textContent = `${best.name} champion`;
      name.textContent = `${top.username} · ${top.score} ${best.unit}`;
    } catch {}
  }
  loadChampion();
  document.addEventListener('tartr8:score', loadChampion);
})();
