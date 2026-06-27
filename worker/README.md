# UNVEILED Worker — Phase 0 (Pulse off the laptop)

**Goal of this phase:** prove a process running on Railway can write to our
database on its own, forever, with no chat and no human. Nothing more.

When heartbeat rows show up in `activity_log` while this chat is closed and
your Mac is asleep, Phase 0 is **proven** and we move to Phase 1.

---

## What you do once (about 15 minutes)

You only need **two secrets** for Phase 0. The other two (GitHub token,
Anthropic key) come in Phase 1.

### 1. Get the two secrets
- **SUPABASE_URL** → `https://eosvftmiwndmctrqprtz.supabase.co`
- **SUPABASE_SERVICE_KEY** → Supabase dashboard → **Project Settings → API →
  Project API keys → `service_role`** (the secret one, *not* `anon`/publishable).
  Copy it. You'll paste it into Railway; I never see it.

### 2. Deploy to Railway
Easiest path (CLI, no GitHub needed):
```bash
# install once
npm i -g @railway/cli
railway login

# from this folder:  UNVEILED/worker
cd "<path to>/UNVEILED/worker"
railway init          # create a new project, name it "unveiled-worker"
railway up            # uploads + builds this folder
```

### 3. Set the variables + start command (Railway dashboard)
- Open the project → **Variables** → add:
  - `SUPABASE_URL` = the URL above
  - `SUPABASE_SERVICE_KEY` = the service_role key
- **Settings → Deploy → Custom Start Command:** `python heartbeat.py`
- (No public port needed — this is a background worker, not a web app.)
- Redeploy.

### 4. Confirm it's alive
- Railway **Deploy Logs** should print `heartbeat ok (201)` every 30 seconds.

---

## The Phase 0 proof (what I'll verify before we continue)

Run this in the Supabase SQL editor after it's been running a few minutes
(then again later, while your Mac is asleep):

```sql
select actor, action, meta->>'host' as host, created_at
from activity_log
where action = 'heartbeat'
order by created_at desc
limit 10;
```

**Pass = ** fresh rows from `actor = 'railway-worker-1'`, ~30s apart,
arriving even when nothing of ours is open. That is the floor's pulse,
independent of you and me. Once I see that, Phase 0 is done and I build the
Phase 1 builder worker.
