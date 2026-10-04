// Decorative arcade background for the Game Lab section: glows, moving grid, scanlines,
// twinkling pixels and corner brackets. Purely visual.

(function buildLabBackground() {
  const layer = document.querySelector('.lab-bg');
  if (!layer) return;

  const pixels = Array.from({ length: 12 }, () => {
    const x = Math.random() * 100, y = Math.random() * 100;
    return `<i class="lab-pixel" style="--x:${x}%;--y:${y}%;--delay:${-Math.random() * 4}s;--dur:${2 + Math.random() * 3}s"></i>`;
  }).join('');

  layer.innerHTML = `<div class="lab-glow lab-glow-a"></div><div class="lab-glow lab-glow-b"></div>
    <div class="lab-grid"></div>${pixels}<div class="lab-scanlines"></div>
    <span class="lab-corner tl"></span><span class="lab-corner tr"></span><span class="lab-corner bl"></span><span class="lab-corner br"></span>`;
})();
