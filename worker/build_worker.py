#!/usr/bin/env python3
"""
UNVEILED — Phase 1 builder worker.

Runs always-on on Railway. Loop:
  1a CLAIM   - atomically claim one pending build_website job (claim_build_job RPC)
  1b BUILD   - generate the site HTML via the Claude API, then QA it
  1c DEPLOY  - publish to GitHub Pages (Contents API) -> live unveiled.pro link
  1d HANDOFF - write leads.preview_url + status='PREVIEW READY'
               (this fires the existing approval trigger; the customer reveal
                still waits for the CEO's yes — autonomy stops at the gate)
  log every stage to activity_log; mark the job completed or blocked-with-reason.

Stdlib only. Secrets via env (set once in Railway):
  SUPABASE_URL, SUPABASE_SERVICE_KEY      (already set in Phase 0)
  ANTHROPIC_API_KEY                        (Claude API - generation)
  GITHUB_TOKEN                             (fine-grained, repo: unveiled, contents RW)
Optional:
  GITHUB_REPO (default monaempoweryou-del/unveiled), MODEL (default claude-sonnet-4-6),
  BUILD_POLL_INTERVAL (default 20), WORKER_ID (default railway-builder-1)
"""
import os, sys, time, json, uuid, base64, re, datetime, urllib.request, urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO  = os.environ.get("GITHUB_REPO", "monaempoweryou-del/unveiled")
MODEL        = os.environ.get("MODEL", "claude-sonnet-4-6")
WORKER_ID    = os.environ.get("WORKER_ID", "railway-builder-1")
POLL         = int(os.environ.get("BUILD_POLL_INTERVAL", "20"))
SITE_BASE    = "https://unveiled.pro/previews"


def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def log_line(m): print(f"[{WORKER_ID}] {now()} {m}", flush=True)


# ---------- Supabase REST helpers ----------
def _sb(method, path, body=None, headers=None):
    h = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
         "Content-Type": "application/json"}
    if headers: h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SUPABASE_URL}{path}", data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else None

def activity(entity_id, action, meta):
    try:
        _sb("POST", "/rest/v1/activity_log",
            {"entity_type": "lead", "entity_id": entity_id, "action": action,
             "actor": WORKER_ID, "meta": meta},
            {"Prefer": "return=minimal"})
    except Exception as e:
        log_line(f"activity log failed ({action}): {e!r}")

def claim_job():
    rows = _sb("POST", "/rest/v1/rpc/claim_build_job", {"p_worker": WORKER_ID})
    return rows[0] if rows else None

def update_lead(lead_id, fields):
    _sb("PATCH", f"/rest/v1/leads?id=eq.{lead_id}", fields, {"Prefer": "return=minimal"})

def finish_job(job_id, status, result=None, blocker=None):
    body = {"status": status, "updated_at": now()}
    if result is not None: body["result"] = result
    if blocker is not None: body["blocker_reason"] = blocker
    _sb("PATCH", f"/rest/v1/work_queue?id=eq.{job_id}", body, {"Prefer": "return=minimal"})


# ---------- Claude API (site generation) ----------
BRAND = (
    "You are UNVEILED's senior web designer. Build ONE complete, production-grade, "
    "mobile-first single-file HTML page for the business below. Bar: Apple-level polish. "
    "Hard rules: (1) self-contained HTML with inline CSS, no external build steps; "
    "(2) NEVER use an em dash; write naturally. (3) Include full head metadata: "
    "<title>, meta description, canonical, og:title/description/image/url/type, "
    "twitter:card=summary_large_image + twitter:image, a favicon (inline emoji data-URI is fine), "
    "JSON-LD LocalBusiness, and <meta name=\"robots\" content=\"noindex\"> (preview). "
    "og:image and twitter:image MUST be absolute https URLs. (4) Real, specific copy about THIS "
    "business — no lorem, no placeholder. (5) A clear booking/contact call to action. "
    "Use tasteful imagery via https://images.unsplash.com source URLs relevant to the industry. "
    "Return ONLY the HTML, starting with <!DOCTYPE html>. No commentary."
)

def generate_site(lead, slug):
    canon = f"{SITE_BASE}/{slug}/"
    prompt = (
        f"{BRAND}\n\nBUSINESS:\n"
        f"- Name: {lead.get('business')}\n- Industry: {lead.get('industry','')}\n"
        f"- Location: {lead.get('location','')}\n- About: {lead.get('about','')}\n"
        f"- Wants: {lead.get('needs','')}\n- Canonical URL (use for canonical/og:url): {canon}\n"
        f"- For og:image/twitter:image use an absolute https Unsplash URL relevant to the industry.\n"
    )
    body = {"model": MODEL, "max_tokens": 14000,
            "messages": [{"role": "user", "content": prompt}]}
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages", data=json.dumps(body).encode(),
        method="POST", headers={"x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=420) as r:
        out = json.loads(r.read().decode())
    html = "".join(b.get("text", "") for b in out.get("content", []))
    i = html.find("<!DOCTYPE")
    if i > 0: html = html[i:]
    return html.strip()


# ---------- inline QA (mirrors the locked standards) ----------
def qa(html):
    issues = []
    # 1. COMPLETENESS first — a truncated page is the worst failure (renders blank).
    if "<!DOCTYPE" not in html: issues.append("no doctype")
    if "<body" not in html.lower(): issues.append("no <body> tag")
    if "</body>" not in html.lower() or "</html>" not in html.lower():
        issues.append("incomplete HTML — page was truncated (no closing body/html)")
    # body must contain real, visible content (catches blank/empty-body pages)
    m = re.search(r"<body[^>]*>(.*)</body>", html, re.S | re.I)
    body = m.group(1) if m else ""
    visible = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", body, flags=re.S | re.I)
    visible = re.sub(r"<[^>]+>", " ", visible)
    if len(visible.split()) < 80:
        issues.append("body has too little visible content (blank/near-empty page)")
    # 2. Standards
    if "—" in html: issues.append("contains em dash (LS-AITELLS)")
    needs = ['og:title', 'og:description', 'og:image', 'og:url', 'og:type',
             'twitter:card', 'twitter:image', 'application/ld+json',
             'name="robots"', 'rel="canonical"']
    for n in needs:
        if n not in html: issues.append(f"missing {n}")
    for m in re.findall(r'(og:image|twitter:image)"[^>]*content="([^"]*)"', html):
        if not m[1].startswith("https://"): issues.append(f"{m[0]} not absolute https")
    if len(html) < 4000: issues.append("html suspiciously short")
    return (len(issues) == 0, issues)


# ---------- GitHub Pages deploy (Contents API) ----------
def _gh(method, path, body=None):
    h = {"Authorization": f"Bearer {GITHUB_TOKEN}", "Accept": "application/vnd.github+json",
         "User-Agent": "unveiled-builder"}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"https://api.github.com{path}", data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404 and method == "GET": return None
        raise

def deploy(slug, html):
    path = f"/repos/{GITHUB_REPO}/contents/previews/{slug}/index.html"
    existing = _gh("GET", path)
    body = {"message": f"Builder: publish {slug}",
            "content": base64.b64encode(html.encode()).decode(),
            "committer": {"name": "UNVEILED Builder", "email": "unveiled@monadigitalmarketing.com"}}
    if existing and existing.get("sha"): body["sha"] = existing["sha"]
    _gh("PUT", path, body)
    return f"{SITE_BASE}/{slug}/"


def slugify(name):
    s = re.sub(r"[^a-z0-9]+", "-", (name or "site").lower()).strip("-")
    return s or "site"


# ---------- one job, end to end ----------
def process(job):
    payload = job.get("payload") or {}
    lead_id = payload.get("lead_id")
    slug = slugify(payload.get("business"))
    activity(lead_id, "build_started", {"job": job["id"], "slug": slug})
    if lead_id: update_lead(lead_id, {"status": "BUILDING", "updated_at": now()})

    try:
        log_line(f"generating site for {payload.get('business')} ({slug})")
        html = generate_site(payload, slug)
        activity(lead_id, "homepage_complete", {"bytes": len(html)})

        ok, issues = qa(html)
        if not ok:
            # one corrective retry
            log_line(f"QA failed: {issues}; retrying once")
            html = generate_site(payload, slug)
            ok, issues = qa(html)
        if not ok:
            finish_job(job["id"], "blocked", blocker=f"QA failed: {issues}")
            activity(lead_id, "build_blocked", {"reason": issues})
            if lead_id: update_lead(lead_id, {"status": "CHANGES REQUESTED", "updated_at": now()})
            return
        activity(lead_id, "qa_passed", {"checks": "metadata+aitells"})

        url = deploy(slug, html)
        activity(lead_id, "deployed", {"preview_url": url})
        log_line(f"deployed {url}")

        if lead_id:
            update_lead(lead_id, {"preview_url": url, "status": "PREVIEW READY", "updated_at": now()})
        finish_job(job["id"], "completed", result={"preview_url": url, "slug": slug})
        activity(lead_id, "job_completed", {"preview_url": url, "handoff": "PREVIEW READY -> CEO approval"})
        log_line(f"DONE {slug} -> awaiting CEO approval")
    except Exception as e:
        log_line(f"job {job.get('id')} FAILED: {e!r}")
        finish_job(job["id"], "blocked", blocker=repr(e)[:400])
        activity(lead_id, "build_blocked", {"reason": repr(e)[:400]})


def builder_keys_present():
    return all([SUPABASE_URL, SERVICE_KEY, ANTHROPIC_API_KEY, GITHUB_TOKEN])


def run_builder():
    """Builder loop. Returns immediately (without crashing) if keys are missing,
    so the host process can keep the heartbeat alive until the keys are added."""
    if not builder_keys_present():
        missing = [k for k, v in {"ANTHROPIC_API_KEY": ANTHROPIC_API_KEY,
                   "GITHUB_TOKEN": GITHUB_TOKEN}.items() if not v]
        log_line(f"builder IDLE: awaiting keys {missing} (heartbeat continues)")
        return
    log_line(f"Phase 1 builder starting (model={MODEL}, repo={GITHUB_REPO}, poll={POLL}s)")
    while True:
        try:
            job = claim_job()
            if job:
                log_line(f"claimed job {job['id']}")
                process(job)
            else:
                time.sleep(POLL)
        except Exception as e:
            log_line(f"loop error: {e!r}")
            time.sleep(POLL)


if __name__ == "__main__":
    run_builder()
