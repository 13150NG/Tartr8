// Copies only the public website files into ./public for static hosting (Vercel).
// Server code, the database and package files are never included.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'public');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const item of ['index.html', 'game.html', '404.html', 'robots.txt', 'sitemap.xml', 'site.webmanifest', 'css', 'js', 'assets']) {
  fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });
}
console.log('Built public/ with', fs.readdirSync(out).join(', '));
