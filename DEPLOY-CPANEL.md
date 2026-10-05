# Deploying TARTR8 to cPanel

Every push to `master` runs the tests on GitHub and, if they pass, deploys to cPanel automatically.

```
git push → master
  └─ GitHub Actions (.github/workflows/deploy-cpanel.yml)
       1. npm ci + npm test        (SQLite, libSQL and Postgres drivers)
       2. cPanel API: pull master into the cPanel Git repository
       3. cPanel API: run the deployment → .cpanel.yml
             └─ TARTR8-V1.1-editable/scripts/cpanel-deploy.sh
                  copy app → ~/tartr8   (database never touched)
                  npm install --omit=dev
                  touch tmp/restart.txt (restarts the Node app)
       4. Smoke test the live site (optional, needs SITE_URL)
```

You can also deploy by hand in cPanel: **Git Version Control → Manage → Pull or Deploy → Update from Remote**, then **Deploy HEAD Commit**.

## One-time setup

Your host must offer **Setup Node.js App** (CloudLinux) and **Git Version Control** in cPanel.
Most shared hosts with Node.js support have both.

### 1. Let cPanel read the private GitHub repository

The repository is private, so cPanel needs an SSH key that GitHub trusts.

1. cPanel → **Terminal** (or SSH in), then run:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/github_tartr8 -N "" -C "cpanel-tartr8"
   cat >> ~/.ssh/config <<'CFG'
   Host github.com
     IdentityFile ~/.ssh/github_tartr8
     IdentitiesOnly yes
   CFG
   chmod 600 ~/.ssh/config
   cat ~/.ssh/github_tartr8.pub
   ```
   No Terminal? Use cPanel → **SSH Access → Manage SSH Keys → Generate a New Key**, name it `github_tartr8`
   with no passphrase, and ask your host to add the `~/.ssh/config` lines above.
2. GitHub → repository **Settings → Deploy keys → Add deploy key**. Paste the public key and leave
   **Allow write access unticked** (read-only).
3. Back in Terminal, run `ssh -T git@github.com` once and type `yes` to trust GitHub's key.

### 2. Clone the repository in cPanel

cPanel → **Git Version Control → Create**:
- **Clone a Repository:** on
- **Clone URL:** `git@github.com:13150NG/Tartr8.git`
- **Repository Path:** `repositories/Tartr8` (outside `public_html`, so the code is never publicly visible)
- **Repository Name:** `Tartr8`

Then open **Manage** and set the checked-out branch to **master**.

### 3. Create the Node.js app

cPanel → **Setup Node.js App → Create Application**:

| Field | Value |
|---|---|
| Node.js version | 20 or newer (the highest offered) |
| Application mode | Production |
| Application root | `tartr8` |
| Application URL | your domain, e.g. `tartr8.com` |
| Application startup file | `server/index.js` |

Environment variables (click **Add Variable**):

| Name | Value | Why |
|---|---|---|
| `DB_FILE` | `/home/<cpanel-user>/tartr8-data/tartr8.db` | Keeps the SQLite database outside the app folder |
| `NODE_ENV` | `production` | |

Do **not** set `DATABASE_URL` or `TURSO_DATABASE_URL`. Without them the app uses the SQLite file,
which is created and set up automatically on first start.

Click **Create**. Then run the first deployment by hand: **Git Version Control → Manage → Pull or Deploy →
Deploy HEAD Commit**. The deploy log lives at `~/.cpanel/logs/vc_*_git_deploy.log`.

### 4. Connect GitHub Actions to cPanel

1. cPanel → **Security → Manage API Tokens → Create**. Name it `github-deploy`, with no expiry or a
   long one. Copy the token; it is shown only once.
2. GitHub → repository **Settings → Secrets and variables → Actions**:

   **Secrets** (New repository secret):
   | Name | Value |
   |---|---|
   | `CPANEL_HOST` | your server hostname, e.g. `server123.hostingprovider.com` (as in the cPanel login URL, without `https://` or `:2083`) |
   | `CPANEL_USER` | your cPanel username |
   | `CPANEL_API_TOKEN` | the token from step 1 |
   | `CPANEL_REPO_PATH` | `/home/<cpanel-user>/repositories/Tartr8` |

   **Variables** tab (optional, enables the smoke test):
   | Name | Value |
   |---|---|
   | `SITE_URL` | `https://tartr8.com` |
3. GitHub → **Settings → Environments → New environment** named `production`. Optionally add yourself
   as a required reviewer, so each deploy waits for your approval.

### 5. Try it

GitHub → **Actions → Deploy to cPanel → Run workflow**, or push a commit to `master`.

## Good to know

- **The database is safe across deploys.** It lives in `~/tartr8-data/`, outside the app folder, and the
  deploy script never touches `server/data` either. Back up `~/tartr8-data/tartr8.db` regularly,
  for example with cPanel's Backup tool or a daily cron job copying it.
- **A failed test means no deploy.** The site keeps running the previous version.
- **To change the app folder,** set `APP_DIR` in Setup Node.js App's environment variables and use the
  same folder as the Application root.
- **Reading contact messages on cPanel:** in Terminal, run
  `source ~/nodevenv/tartr8/*/bin/activate && cd ~/tartr8 && DB_FILE=~/tartr8-data/tartr8.db npm run messages`.
- **Vercel keeps working separately** (`npm run deploy:vercel`) with its own Neon database.
