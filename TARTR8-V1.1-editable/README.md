# TARTR8 V1.1 — Editable Prototype

## Running it

Requires Node.js 20 or newer.

```bash
npm install
npm start          # http://localhost:3000
```

- `npm run dev` — same, but restarts automatically when server files change
- `npm test` — API tests
- `npm run messages` — print contact-form messages
- `PORT=8080 npm start` — use a different port

## SEO

- Each page has its own title, description, canonical URL, Open Graph/Twitter sharing tags (image: `assets/og-image.png`)
  and schema.org structured data (Organization, WebSite, VideoGame).
- `robots.txt`, `sitemap.xml`, `site.webmanifest` and a real `404.html` page are served at the site root.
- The live domain is **https://tartr8.com**. If it changes, find-and-replace it in `index.html`, `game.html`,
  `robots.txt` and `sitemap.xml`, and update `<lastmod>` in the sitemap when pages change.
- `*.vercel.app` test deployments send `X-Robots-Tag: noindex` so only tartr8.com gets indexed.
- After going live, submit `https://tartr8.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools.

## Database

- **Local and cPanel:** a SQLite file at `server/data/tartr8.db`, created automatically on first start (override with `DB_FILE`).
- **Vercel:** Turso (hosted, SQLite-compatible), used automatically when `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set.
  Vercel has no permanent disk, so the SQLite file can't be used there.

Tables are created and upgraded automatically on start. `npm run messages` reads whichever database the env vars point to.

## Deploying to Vercel (testing)

1. Create a free database at [turso.tech](https://turso.tech) and copy its **URL** (`libsql://…`) and an **auth token**.
2. Add them to the Vercel project (choose Production, Preview and Development when asked):
   ```bash
   vercel env add TURSO_DATABASE_URL
   vercel env add TURSO_AUTH_TOKEN
   ```
3. Deploy: `npm run deploy:vercel` (or `npm run deploy:vercel -- preview` for a preview URL).
   This deploys from a clean copy outside git; deploying from inside the repo can be blocked by Vercel when the
   last commit's author isn't a member of your Vercel team.

How it works: `npm run build` copies only the public site files into `public/`, which Vercel serves as static files.
`api/index.js` runs the Express API as a serverless function. Server code and data are never served publicly.

## Deploying to cPanel

Automated: every push to `master` runs the tests, then deploys through cPanel's Git Version Control
(`.cpanel.yml` → `scripts/cpanel-deploy.sh`). See **[DEPLOY-CPANEL.md](../DEPLOY-CPANEL.md)** for the one-time setup.
Without `DATABASE_URL`/`TURSO_DATABASE_URL` the app uses the SQLite file (set `DB_FILE` to keep it outside the app folder).

## Frontend (editable files)
- `index.html` — page content and navigation
- `assets/logo.png` — supplied TARTR8 Cyberhub logo
- `css/variables.css` — brand colours, fonts and layout variables
- `css/header.css` — logo/header/navigation
- `css/sections.css` — homepage, Tech, About, Leaderboard and Contact
- `css/games.css` — game cards and game modal
- `css/responsive.css` — mobile layout
- `js/games.js` — Reaction, Memory and Number Rush (open in the modal)
- `game.html` — Catch, a standalone full-screen game linked from the Games section
- `js/navigation.js` — mobile menu
- `js/main.js` — modal/game launching
- `js/api.js` — backend detection, accounts (sign-in dialog, header account menu) and the post-game "post score" prompt
- `js/online.js` — leaderboard section (champion spotlight + rankings) and contact form
- `js/lab-bg.js` — animated arcade background in the Game Lab section

The supplied logo is used as an image asset, so it can be replaced later by swapping `assets/logo.png`.

## Backend (`server/`)
Express + SQLite. The database file is created at `server/data/tartr8.db` (override with `DB_FILE`).

- `server/index.js` — starts the server
- `server/app.js` — routes and validation
- `server/auth.js` — accounts and sessions
- `server/games.js` — per-game leaderboard rules (sort order, allowed score range)
- `server/db.js` — database tables

| Method | Path | Body / notes |
| --- | --- | --- |
| GET | `/api/health` | `{ ok: true }` |
| POST | `/api/auth/register` | `{ username, email }` — creates an account and signs in. Usernames and emails are unique (case-insensitive) |
| POST | `/api/auth/login` | `{ username, email }` — both must match the same account |
| POST | `/api/auth/logout` | Ends the session |
| GET | `/api/auth/me` | `{ user, bests }` — signed-in user and their best score + rank per game, or `{ user: null }` |
| GET | `/api/scores/:game?limit=10` | Each player's best score, best first (first entry is the champion). Includes `me` when signed in. `game` is `reaction`, `memory`, `number` or `catch` |
| POST | `/api/scores` | `{ game, score }` — **requires sign-in**. Returns `{ rank, best, newBest }`. 20 per minute per IP |
| POST | `/api/contact` | `{ name, email, message }` — 5 per 10 minutes per IP |

Sign-in/sign-up is limited to 15 attempts per 10 minutes per IP. Sessions last 30 days in an HttpOnly cookie.

**Security notes**
- Accounts have no password: anyone who knows a player's username *and* email can sign in as them.
  Fine for a casual leaderboard; add an emailed one-time code before storing anything sensitive.
- Scores are calculated in the browser, so a determined player could post a fake one.
  The score ranges in `server/games.js` block obviously impossible values.
