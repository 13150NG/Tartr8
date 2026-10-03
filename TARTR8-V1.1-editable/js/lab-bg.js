// Decorative arcade background for the Game Lab section: floating game icons,
// twinkling pixels and a gentle mouse parallax. Purely visual.

const LAB_ICONS = {
  gamepad: '<path d="M7 8h10a5 5 0 0 1 4.6 7l-.6 1.4a2.8 2.8 0 0 1-4.6.8L14.6 15H9.4l-1.8 2.2a2.8 2.8 0 0 1-4.6-.8L2.4 15A5 5 0 0 1 7 8z"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="16" cy="11.5" r=".9" class="fill"/><circle cx="18" cy="13.5" r=".9" class="fill"/>',
  invader: '<path class="fill" stroke="none" d="M6 4h2v2H6zM16 4h2v2h-2zM8 6h8v2H8zM6 8h12v2H6zM4 10h4v2H4zM10 10h4v2h-4zM16 10h4v2h-4zM4 12h16v2H4zM4 14h2v4H4zM18 14h2v4h-2zM8 14h8v2H8zM8 18h3v2H8zM13 18h3v2h-3z"/>',
  dpad: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/><path d="M12 6v2M12 16v2M6 12h2M16 12h2"/>',
  buttons: '<circle cx="12" cy="5" r="2.6"/><circle cx="5" cy="12" r="2.6"/><circle cx="19" cy="12" r="2.6" class="fill"/><circle cx="12" cy="19" r="2.6"/>',
  joystick: '<circle cx="12" cy="6" r="3.5" class="fill"/><path d="M12 9.5V16M4 17h16v4H4z"/><path d="M8 17v-1h8v1"/>',
  coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><path d="M12 9v6"/>',
  heart: '<path class="fill" stroke="none" d="M5 5h4v2h2v2h2V7h2V5h4v2h2v6h-2v2h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5v-2H3V7h2z"/>',
  crosshair: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="1.5" class="fill"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/>',
  block: '<path d="M3 9h6V3h6v6h6v6H3z"/><path d="M9 9h6v6M9 9v6"/>',
  dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.3" class="fill"/><circle cx="12" cy="12" r="1.3" class="fill"/><circle cx="16" cy="16" r="1.3" class="fill"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  star: '<path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z"/>'
};

// x/y in %, size in px, depth = parallax strength, dur = float time, accent = orange
const LAB_LAYOUT = [
  ['gamepad', 4, 8, 78, 1.2, 9, false, -12],
  ['invader', 88, 6, 56, .8, 7, true, 0],
  ['coin', 46, 4, 34, .5, 6, true, 0],
  ['dpad', 93, 46, 60, 1.4, 10, false, 8],
  ['heart', 2, 52, 36, .6, 5, true, 0],
  ['buttons', 70, 14, 46, .9, 8, false, 0],
  ['crosshair', 30, 22, 40, .7, 11, false, 0],
  ['block', 6, 88, 58, 1.1, 9, false, 14],
  ['joystick', 84, 90, 64, 1.3, 8, false, -8],
  ['dice', 52, 94, 42, .8, 10, false, 18],
  ['bolt', 96, 74, 34, .6, 6, true, 0],
  ['star', 24, 96, 28, .5, 7, true, 0],
  ['invader', 60, 30, 30, .4, 12, false, 0],
  ['coin', 14, 32, 26, .4, 7, false, 0]
];

(function buildLabBackground() {
  const layer = document.querySelector('.lab-bg');
  if (!layer) return;

  const icons = LAB_LAYOUT.map(([name, x, y, size, depth, dur, accent, rot], i) => `
    <span class="lab-icon${accent ? ' accent' : ''}" style="--x:${x}%;--y:${y}%;--size:${size}px;--depth:${depth};--dur:${dur}s;--delay:${-i * 1.3}s;--rot:${rot}deg">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${LAB_ICONS[name]}</svg>
    </span>`).join('');

  const pixels = Array.from({ length: 26 }, () => {
    const x = Math.random() * 100, y = Math.random() * 100;
    return `<i class="lab-pixel" style="--x:${x}%;--y:${y}%;--delay:${-Math.random() * 4}s;--dur:${2 + Math.random() * 3}s"></i>`;
  }).join('');

  layer.innerHTML = `<div class="lab-glow lab-glow-a"></div><div class="lab-glow lab-glow-b"></div>
    <div class="lab-grid"></div>${pixels}${icons}<div class="lab-scanlines"></div>
    <span class="lab-corner tl"></span><span class="lab-corner tr"></span><span class="lab-corner bl"></span><span class="lab-corner br"></span>`;

  // Mouse parallax (skipped on touch devices and for reduced motion).
  const section = layer.parentElement;
  if (matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) {
    let frame;
    section.addEventListener('pointermove', e => {
      const r = section.getBoundingClientRect();
      const mx = (e.clientX - r.left) / r.width - .5, my = (e.clientY - r.top) / r.height - .5;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        layer.style.setProperty('--mx', mx.toFixed(3));
        layer.style.setProperty('--my', my.toFixed(3));
      });
    });
    section.addEventListener('pointerleave', () => {
      layer.style.setProperty('--mx', 0);
      layer.style.setProperty('--my', 0);
    });
  }
})();
