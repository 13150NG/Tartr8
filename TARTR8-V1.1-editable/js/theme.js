// Light / dark theme. Loaded in <head> so the saved theme applies before first paint.
// Dark is the default; the visitor's choice is remembered in localStorage.
(function () {
  const KEY = 'tartr8-theme';
  const root = document.documentElement;
  const META_COLORS = { dark: '#07080a', light: '#f6f4f1' };

  function saved() {
    try { return localStorage.getItem(KEY); } catch { return null; }
  }

  function apply(theme) {
    if (theme === 'light') root.setAttribute('data-theme', 'light');
    else root.removeAttribute('data-theme');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = META_COLORS[theme] || META_COLORS.dark;
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      const next = theme === 'light' ? 'dark' : 'light';
      btn.setAttribute('aria-label', `Switch to ${next} mode`);
      btn.title = `Switch to ${next} mode`;
    });
  }

  apply(saved() === 'light' ? 'light' : 'dark');

  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme === 'light' ? 'light' : 'dark');
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = root.dataset.theme === 'light' ? 'dark' : 'light';
        apply(next);
        try { localStorage.setItem(KEY, next); } catch { /* private mode: still switches for this page */ }
      });
    });
  });
})();
