# Pipeline Dashboard

Live sales pipeline dashboard connected to HubSpot. Pulls fresh data on load with a refresh button.

---

## Deploy in ~10 minutes

### Step 1 — Create a HubSpot Private App token

1. In HubSpot, go to **Settings → Integrations → Private Apps**
2. Click **Create a private app**
3. Name it "Pipeline Dashboard"
4. Under **Scopes**, enable:
   - `crm.objects.deals.read`
   - `crm.objects.companies.read`
5. Click **Create app** → copy the token (starts with `pat-na1-...`)

Keep this token safe — it goes in Vercel only, never in code.

---

### Step 2 — Push this folder to GitHub

1. Create a free account at [github.com](https://github.com) if you don't have one
2. Create a new **private** repository named `pipeline-dashboard`
3. Push this folder to it:

```bash
cd pipeline-dashboard
git init
git add .
git commit -m "Initial deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/pipeline-dashboard.git
git push -u origin main
```

---

### Step 3 — Deploy to Vercel

1. Create a free account at [vercel.com](https://vercel.com)
2. Click **Add New → Project**
3. Import your `pipeline-dashboard` GitHub repo
4. Click **Deploy** (no build settings needed)

---

### Step 4 — Add your HubSpot token

1. In your Vercel project, go to **Settings → Environment Variables**
2. Add:
   - **Name:** `HUBSPOT_TOKEN`
   - **Value:** your token from Step 1
   - **Environment:** Production, Preview, Development (check all three)
3. Click **Save**
4. Go to **Deployments** → click the three dots on your latest deployment → **Redeploy**

---

### Step 5 — Enable password protection

Since this dashboard is for you, your SE, and your CEO:

1. In Vercel, go to **Settings → Deployment Protection**
2. Enable **Vercel Authentication** or **Password Protection**
3. Set a shared password and share it with your two colleagues

> Note: Password Protection requires Vercel Pro ($20/mo). If you want free, use Vercel Authentication instead (teammates sign in with their email via a magic link — free on all plans).

---

## Your dashboard URL

After deploy: `https://pipeline-dashboard-[hash].vercel.app`

You can set a custom domain in Vercel → Settings → Domains.

---

## Updating the dashboard

Any `git push` to `main` auto-redeploys. No manual steps needed.

---

## One known limitation

The HubSpot Companies API returns company records but doesn't tell you which deal each company is associated with in a batch search. The dashboard handles this using the hardcoded `DC_MAP` (deal_id → company_id) lookup in `public/index.html`.

**To keep this current as you add new deals:**
- When you add a new deal in HubSpot, find the deal ID and company ID
- Add the mapping to `DC_MAP` in `index.html`
- Push to GitHub to redeploy

Or ask Claude to pull the latest company associations and update the map for you anytime.

---

## File structure

```
pipeline-dashboard/
├── api/
│   └── hubspot.js      ← serverless proxy (holds your API token securely)
├── public/
│   └── index.html      ← the full dashboard
├── package.json
├── vercel.json         ← routing config
└── README.md
```
