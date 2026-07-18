# Deploying AllAttest — step-by-step beginner guide

By the end of this guide you will have a **live URL** you can send to anyone,
like `https://allattest.vercel.app`, running the full app.

## How the pieces fit (read this first)

The app has two halves, and they go to two different hosts:

```
                 your live URL
https://allattest.vercel.app
              │
              ▼
        ┌───────────┐    /api/* requests forwarded    ┌──────────────────────┐
        │  VERCEL   │ ──────────────────────────────▶ │  AZURE APP SERVICE   │
        │ (React UI)│                                 │ (Express API + db +  │
        └───────────┘                                 │  sync scheduler)     │
              ▲                                       └──────────────────────┘
              │                                                  ▲
              └──────────── both auto-deploy from ───────────────┘
                        ┌────────────────────────┐
                        │        GITHUB          │
                        │  (your code lives here)│
                        └────────────────────────┘
```

Why the split: Vercel is perfect for the React frontend, but it cannot run the
API — the API writes a database file to disk and runs a background sync
scheduler, and Vercel's serverless functions have neither a persistent disk
nor long-running processes. Azure App Service runs the API as a normal
always-on Node server. Vercel then *forwards* every `/api/...` request to
Azure, so visitors only ever see one URL.

**Order matters:** GitHub first (both hosts deploy from it), then Azure (so
the API URL exists), then Vercel (which needs that URL).

Everything in this guide uses **free tiers**. Total time: about 45 minutes.

---

## Part 0 — One-time setup (accounts + Git)

1. **GitHub account** — sign up at https://github.com (free).
2. **Azure account** — sign up at https://azure.microsoft.com/free (free tier;
   it asks for a credit card for identity but the F1 plan we use costs $0).
3. **Vercel account** — go to https://vercel.com and click **Continue with
   GitHub** (this links the two, which we need later).
4. **Install Git on your PC** — download from https://git-scm.com/download/win,
   run the installer, accept every default. To verify: open **PowerShell**
   (Start menu → type "powershell") and run:
   ```powershell
   git --version
   ```
   You should see something like `git version 2.45.0`.
5. Tell Git who you are (once ever):
   ```powershell
   git config --global user.name "Rajesh"
   git config --global user.email "raj@synergytechs.net"
   ```

---

## Part 1 — Put the code in your AllAttest repo on GitHub

You already created an empty repository named **AllAttest** on GitHub, so
there is nothing to create — we just connect your project folder to it and
push. (Your local folder is still named `assurecomply` on disk; that's fine,
the folder name doesn't matter to GitHub.)

### 1a. One small housekeeping step first

A file named `github-workflow-deploy-api-to-azure.yml` sits in your project
folder — it's the auto-deploy recipe, but security tooling can't place it into
the special `.github\workflows` folder for you. In VS Code, open the folder
(File → Open Folder → `C:\Users\RajNettem\Documents\assurecomply`), open the
built-in terminal (Ctrl+`) and run:

```powershell
mkdir .github\workflows -Force
Move-Item github-workflow-deploy-api-to-azure.yml .github\workflows\deploy-api-to-azure.yml
```

### 1b. Connect the folder to your AllAttest repo and push

In the same VS Code terminal, run these one at a time
(replace `YOUR-USERNAME` with your GitHub username in the remote command —
you can copy the exact URL from your repo's green **Code** button on GitHub):

```powershell
git init
git add .
git commit -m "AllAttest initial commit"
git remote add origin https://github.com/YOUR-USERNAME/AllAttest.git
git branch -M main
git push -u origin main
```

The first push may open a browser window asking you to sign in to GitHub —
approve it. When it finishes, refresh your AllAttest repo page on GitHub:
**your code is there.** From then on you can commit and push from VS Code's
Source Control panel (Commit → Sync Changes) instead of the terminal.
(The `.gitignore` file already excludes `node_modules` and the demo database,
so the repo stays clean.)

> The push also triggered the "Deploy API to Azure" workflow, which will show
> a ❌ red X under the repo's **Actions** tab. That's expected — Azure doesn't
> exist yet. We fix it in Part 3.

---

## Part 2 — Create the API home on Azure

### 2a. Create the Web App

1. Go to https://portal.azure.com and sign in.
2. In the top search bar type **App Services** and open it.
3. Click **+ Create** → **Web App**.
4. Fill the form:
   - **Subscription:** your subscription (usually only one).
   - **Resource group:** click "Create new" → name it `allattest-rg`.
   - **Name:** pick something globally unique, e.g. `allattest-api-raj`.
     ⚠️ WRITE THIS NAME DOWN — you need it 3 more times. Your API URL becomes
     `https://allattest-api-raj.azurewebsites.net`.
   - **Publish:** Code
   - **Runtime stack:** Node 20 LTS
   - **Operating System:** Linux
   - **Region:** East US (or whichever is closest to you)
   - **Pricing plan:** click "Explore pricing plans" and pick
     **Free F1** (shared, 60 minutes/day compute — fine for a demo).
5. Click **Review + create** → **Create**. Wait ~1 minute for
   "Your deployment is complete", then click **Go to resource**.

### 2b. Download the "publish profile" (the key GitHub uses to deploy)

1. On your Web App's page, look at the top toolbar and click
   **Download publish profile**. A file like
   `allattest-api-raj.PublishSettings` downloads.
   - **If the button is greyed out:** in the left menu go to
     **Settings → Configuration → General settings**, set
     **SCM Basic Auth Publishing Credentials** to **On**, click Save,
     then try the download again.
2. Open the downloaded file with Notepad (right-click → Open with → Notepad).
   You'll see a wall of XML. **Select ALL of it (Ctrl+A) and copy (Ctrl+C).**

---

## Part 3 — Connect GitHub to Azure (auto-deploy the API)

### 3a. Give GitHub the key

1. On GitHub, open your `AllAttest` repository.
2. Click **Settings** (repo settings, top tab) → in the left menu:
   **Secrets and variables → Actions**.
3. Click **New repository secret**.
   - **Name:** `AZURE_WEBAPP_PUBLISH_PROFILE`  (exactly that, all caps)
   - **Secret:** paste the XML you copied from the publish profile.
4. Click **Add secret**.

### 3b. Tell the workflow your app's name

1. Still on GitHub, go to the **Code** tab and open the file
   `.github/workflows/deploy-api-to-azure.yml`.
2. Click the **pencil icon** (top right of the file view) to edit it.
3. Find the line:
   ```yaml
   AZURE_WEBAPP_NAME: YOUR-AZURE-APP-NAME # <-- CHANGE THIS
   ```
   and replace `YOUR-AZURE-APP-NAME` with your real app name from Part 2a
   (e.g. `allattest-api-raj`).
4. Click **Commit changes** (green button) → **Commit changes** again.

That commit triggers the deployment. Click the **Actions** tab to watch it —
you'll see "Deploy API to Azure" running. It takes 2–4 minutes and should end
with a green ✓.

### 3c. Verify the API is live

Open this in your browser (with your app name):

```
https://allattest-api-raj.azurewebsites.net/api/tenants
```

If you see `{"error":"Sign in required"}` — **that's success!** The API is
running and correctly refusing unauthenticated requests. (The very first load
can take ~30 seconds on the free plan while the app wakes up.)

> On boot the server auto-seeds the demo database (tenants + demo logins), so
> the API is immediately usable.

---

## Part 4 — Put the frontend on Vercel and link everything

### 4a. Point the frontend at YOUR Azure API

1. On GitHub, open the file `client/vercel.json` and click the pencil to edit.
2. Replace `YOUR-AZURE-APP-NAME` with your app name so it reads e.g.:
   ```json
   "destination": "https://allattest-api-raj.azurewebsites.net/api/:path*"
   ```
3. **Commit changes**.

### 4b. Import the project into Vercel

1. Go to https://vercel.com and sign in (with GitHub).
2. Click **Add New… → Project**.
3. Find `AllAttest` in the repository list and click **Import**.
   (If it's not listed: click "Adjust GitHub App Permissions" and grant Vercel
   access to the repo.)
4. On the configure screen — **this is the important part**:
   - **Root Directory:** click **Edit** and select the **`client`** folder.
   - Framework Preset should auto-detect **Vite** (leave build settings alone).
5. Click **Deploy**. Wait ~1 minute for the confetti.

### 4c. Open your live URL 🎉

Vercel shows your URL, like `https://allattest.vercel.app`. Open it:

1. You should see the **AllAttest sign-in page**.
2. Sign in with the operator demo login:
   `rajesh@allattest.com` / `ops-demo-2026`
3. You land in the Admin Console. Open a tenant, click around — this is the
   real app, live on the internet. Send the URL to anyone.

**How it works from now on:** every `git push` to `main` auto-deploys — Vercel
rebuilds the frontend, and the GitHub Action redeploys the API when anything
in `server/` changed. Your update loop is just:

```powershell
cd C:\Users\RajNettem\Documents\assurecomply
git add .
git commit -m "describe what you changed"
git push
```

---

## Part 5 — Optional finishing touches

**Live AI agents.** The agents return stub text until the API has an Anthropic
key. In the Azure portal: your Web App → **Settings → Environment variables**
→ **+ Add** → Name `ANTHROPIC_API_KEY`, Value your key (from
https://console.anthropic.com) → **Apply**. The app restarts and agents go
live.

**A custom domain** (e.g. `app.allattest.com`). In Vercel: your project →
**Settings → Domains** → type your domain → follow the DNS instructions it
shows (you add one CNAME record wherever you bought the domain). Vercel
handles the HTTPS certificate automatically.

**Keep the API awake.** The F1 free plan sleeps after idle periods (first
visit after a while takes ~30s). If that bothers you for demos, upgrade the
App Service plan to **Basic B1** (~$13/mo) and turn on **Always On** in
Configuration → General settings.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| GitHub Action fails: "Publish profile is invalid" | The secret wasn't pasted fully. Re-download the publish profile, copy ALL the XML, delete and re-create the `AZURE_WEBAPP_PUBLISH_PROFILE` secret. |
| GitHub Action fails: app name not found | The `AZURE_WEBAPP_NAME` in the workflow doesn't exactly match the Azure app name. Edit and recommit. |
| "Download publish profile" is greyed out | Configuration → General settings → SCM Basic Auth Publishing Credentials → **On** → Save. |
| Live URL loads, but sign-in says "Can't reach the API" | `client/vercel.json` still says `YOUR-AZURE-APP-NAME`, or has a typo. Fix, commit — Vercel redeploys automatically. |
| First request takes ~30s | Free-plan cold start; the app is waking up. Subsequent requests are fast. |
| Demo data reset after a deploy | Expected: each API deployment ships fresh code and re-seeds the demo database. Real persistence is the Postgres swap on the roadmap (store.js is the single swap point). |
| Vercel build fails | Check that Root Directory is set to `client` (Project → Settings → Build & Deployment). |

## Security notes for a public demo

- The demo logins are printed on the sign-in page on purpose. Before showing
  real customers, reseed with your own passwords or create users via the
  Admin Console and remove the hints from `Login` in `client/src/App.jsx`.
- Connector credentials entered in the demo are stored in the API's JSON
  database. Production hardening (secrets manager, Postgres, SSO) is listed
  in CLAUDE.md's roadmap.
