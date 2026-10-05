const menuToggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('.nav');

function setMenu(open) {
  nav.classList.toggle('mobile', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
}

if (menuToggle && nav) {
  menuToggle.onclick = () => setMenu(!nav.classList.contains('mobile'));
  nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
}

// Highlight the nav link for the section currently in view.
// On-page section links (plus Home, which links to "/" but tracks the #home section). Not /store.
const navLinks = [...document.querySelectorAll('.nav a[href^="#"], .nav a[data-section]')];
const sectionOf = a => a.dataset.section || a.getAttribute('href').slice(1);
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    navLinks.forEach(a => a.classList.toggle('active', sectionOf(a) === entry.target.id));
  });
}, { rootMargin: '-45% 0px -50% 0px' });
navLinks.forEach(a => {
  const section = document.getElementById(sectionOf(a));
  if (section) observer.observe(section);
});
