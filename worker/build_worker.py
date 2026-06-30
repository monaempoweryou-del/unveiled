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
import brand_profile   # LS-BRAND-PRESERVE + LS-ASSET-STRUCTURE: learn the brand before building
import brand_research  # LS-BRAND-RESEARCH: resolve loose identifiers -> verified profiles first

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

def claim_revision():
    rows = _sb("POST", "/rest/v1/rpc/claim_revision_job", {"p_worker": WORKER_ID})
    return rows[0] if rows else None

def get_lead(lead_id):
    # select=* so brand-learning (visual_refresh) and the build guard see the
    # whole row (status, website, industry, etc.) without guessing column names.
    rows = _sb("GET", f"/rest/v1/leads?id=eq.{lead_id}&select=*")
    return rows[0] if rows else {}

def update_lead(lead_id, fields):
    _sb("PATCH", f"/rest/v1/leads?id=eq.{lead_id}", fields, {"Prefer": "return=minimal"})

def finish_job(job_id, status, result=None, blocker=None):
    body = {"status": status, "updated_at": now()}
    if result is not None: body["result"] = result
    if blocker is not None: body["blocker_reason"] = blocker
    _sb("PATCH", f"/rest/v1/work_queue?id=eq.{job_id}", body, {"Prefer": "return=minimal"})


def save_discovery(lead_id, report):
    """Persist the reviewable Brand Research 2.0 Discovery Report (LS-BRAND-RESEARCH).
    Upserts on lead_id. Never raises — discovery must never break a build."""
    if not lead_id:
        return
    body = {"lead_id": lead_id, "status": "complete",
            "overall_confidence": report.get("overall_confidence"),
            "needs_review": bool(report.get("needs_review")),
            "report": report, "updated_at": now()}
    try:
        _sb("POST", "/rest/v1/brand_discovery?on_conflict=lead_id", body,
            {"Prefer": "resolution=merge-duplicates,return=minimal"})
    except Exception as e:
        log_line(f"save_discovery skipped (table may not exist yet): {e!r}")


# ---------- Claude API (site generation) ----------
# Brand-aware build. The engine LEARNS the business's existing brand first
# (brand_profile.build_brand_profile), sources assets authentic-first
# (assemble_assets), and only then designs. We elevate the brand, we do not
# replace it with a house style. The brand block + the exact real-image URLs
# are injected per-build; this constant holds only the build-craft rules.
BRAND = (
    "You are UNVEILED's senior web designer. Build ONE complete, production-grade, "
    "mobile-first single-file HTML page for the business below. Bar: Apple-level polish. "
    "Hard rules: (1) self-contained HTML with inline CSS, no external build steps; "
    "(2) NEVER use an em dash; write naturally. (3) Include full head metadata: "
    "<title>, meta description, canonical, og:title/description/image/url/type, "
    "twitter:card=summary_large_image + twitter:image, a favicon (inline emoji data-URI is fine), "
    "JSON-LD LocalBusiness, and <meta name=\"robots\" content=\"noindex\"> (preview). "
    "og:image and twitter:image MUST be absolute https URLs. (4) Real, specific copy about THIS "
    "business, no lorem, no placeholder. (5) A clear booking/contact call to action. "
    "(6) BRAND FIDELITY IS THE PRODUCT: design from the BRAND PROFILE below. Respect the existing "
    "brand first, improve what is genuinely weak second, replace only when necessary. The owner "
    "must react with 'that is my business, my brand, at its best', never 'an UNVEILED template'. "
    "(7) Use the EXACT image URLs provided below in the slots indicated. Do NOT swap in your own "
    "stock images, and do NOT add Unsplash/stock images beyond the ones provided. "
    "Produce ONE focused, cohesive page with about 5 to 6 sections (hero, services, why-us/trust, "
    "a gallery or proof, and a contact/booking CTA). Keep the CSS efficient: reuse classes, avoid bloat. "
    "CRITICAL: the page MUST be COMPLETE, every tag closed, ending with </html>. If you are running long, "
    "tighten the content rather than leaving the page unfinished. Finishing the whole page matters more than "
    "adding more. Return ONLY the HTML, starting with <!DOCTYPE html>. No commentary, no markdown fences."
)

def _claude_html(prompt):
    body = {"model": MODEL, "max_tokens": 16000,
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

def generate_site(lead, slug):
    """Returns (html, brand_report). Learns the brand, then builds from it."""
    canon = f"{SITE_BASE}/{slug}/"
    # 1+2. learn the business and its existing brand (never crashes)
    profile = brand_profile.build_brand_profile(lead)
    # 3+4. assemble the standard 10-slot asset set, authentic-first
    assets = brand_profile.assemble_assets(profile, profile.get("industry", ""))
    report = brand_profile.render_report(profile, assets, slug)
    brand_block = brand_profile.render_prompt_block(profile, assets)
    # 5. build something that still feels like THAT company
    prompt = (
        f"{BRAND}\n\n{brand_block}\n\nBUSINESS:\n"
        f"- Name: {lead.get('business')}\n- Industry: {lead.get('industry','')}\n"
        f"- Location: {lead.get('location','')}\n- About: {lead.get('about','')}\n"
        f"- Wants: {lead.get('needs','')}\n- Canonical URL (use for canonical/og:url): {canon}\n"
    )
    return _claude_html(prompt), report


# ---------- inline QA (mirrors the locked standards) ----------
def qa(html, report=None):
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
    # 3. Brand + asset standards (LS-ASSET-STRUCTURE + LS-BRAND-PRESERVE)
    imgs = re.findall(r"<img\b[^>]*>", html, re.I)
    if len(imgs) < 5:
        issues.append(f"only {len(imgs)} images (LS-ASSET-STRUCTURE: minimum 5 real visuals)")
    no_alt = sum(1 for t in imgs if not re.search(r'\balt\s*=\s*["\'][^"\']', t, re.I))
    if no_alt:
        issues.append(f"{no_alt} image(s) missing alt text (LS-VISUAL)")
    # stock-by-default guard: if real assets were available but the page is all stock, fail.
    if report is not None:
        avail = report.get("assets", {}).get("real_assets_available", 0)
        srcs = re.findall(r'<img\b[^>]*\bsrc\s*=\s*["\']([^"\']+)', html, re.I)
        stock_in_page = [s for s in srcs if brand_profile._is_stock(s)]
        real_in_page = [s for s in srcs if not brand_profile._is_stock(s) and not s.startswith("data:")]
        if avail >= 1 and srcs and not real_in_page:
            issues.append("real brand assets were available but the page uses only stock "
                          "(LS-BRAND-PRESERVE: stock is the exception, not the default)")
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

def deploy_file(slug, filename, content):
    """Publish any file under previews/{slug}/ (used for index.html + brand-report.json)."""
    path = f"/repos/{GITHUB_REPO}/contents/previews/{slug}/{filename}"
    existing = _gh("GET", path)
    body = {"message": f"Builder: publish {slug}/{filename}",
            "content": base64.b64encode(content.encode()).decode(),
            "committer": {"name": "UNVEILED Builder", "email": "unveiled@monadigitalmarketing.com"}}
    if existing and existing.get("sha"): body["sha"] = existing["sha"]
    _gh("PUT", path, body)
    return f"{SITE_BASE}/{slug}/{filename}"

def deploy(slug, html):
    deploy_file(slug, "index.html", html)
    return f"{SITE_BASE}/{slug}/"


def _gh_json(slug, filename):
    """Read + decode a JSON file under previews/{slug}/; return (obj, sha) or ([],None)."""
    path = f"/repos/{GITHUB_REPO}/contents/previews/{slug}/{filename}"
    existing = _gh("GET", path)
    if existing and existing.get("content"):
        try:
            return json.loads(base64.b64decode(existing["content"]).decode("utf-8", "replace")), existing.get("sha")
        except Exception:
            return [], existing.get("sha")
    return [], None

def snapshot_version(slug, html, meta=None):
    """LS-ITERATE: record the just-deployed HTML as the next immutable version
    (vN.html) and append to versions/manifest.json. Gives V1 -> V2 -> V3 history
    for review/rollback. History must never block a deploy, so this never raises."""
    try:
        manifest, sha = _gh_json(slug, "versions/manifest.json")
        if not isinstance(manifest, list):
            manifest, sha = [], None
        n = len(manifest) + 1
        deploy_file(slug, f"versions/v{n}.html", html)
        manifest.append({"version": n, "at": now(), "bytes": len(html), **(meta or {})})
        path = f"/repos/{GITHUB_REPO}/contents/previews/{slug}/versions/manifest.json"
        body = {"message": f"Builder: snapshot {slug} v{n}",
                "content": base64.b64encode(json.dumps(manifest, indent=2).encode()).decode(),
                "committer": {"name": "UNVEILED Builder", "email": "unveiled@monadigitalmarketing.com"}}
        if sha: body["sha"] = sha
        _gh("PUT", path, body)
        log_line(f"version snapshot {slug} v{n} ({meta.get('kind') if meta else ''})")
        return n
    except Exception as e:
        log_line(f"version snapshot skipped: {e!r}")
        return None


def slugify(name):
    s = re.sub(r"[^a-z0-9]+", "-", (name or "site").lower()).strip("-")
    return s or "site"


# Statuses where the approved work is the foundation and must never be
# regenerated from scratch (LS-ITERATE). Further change goes through revision.
LOCKED_STATUSES = {"APPROVED", "LIVE", "PREVIEW READY", "PREVIEW DELIVERED", "CHANGES REQUESTED"}

# ---------- one job, end to end ----------
def process(job):
    payload = job.get("payload") or {}
    lead_id = payload.get("lead_id")
    slug = slugify(payload.get("business"))
    activity(lead_id, "build_started", {"job": job["id"], "slug": slug})

    # LS-ITERATE GUARD: the build path produces Version 1 ONLY. If a preview
    # already exists (or the lead is past first build), we do NOT throw it away
    # and rebuild — that destroys approved/refined work. Bounce to revision.
    existing_html = fetch_deployed(slug)
    lead_row = (get_lead(lead_id) if lead_id else {}) or {}
    lead_status = (lead_row.get("status") or "")
    if (existing_html or lead_status.upper() in LOCKED_STATUSES) and not payload.get("allow_rebuild"):
        reason = (f"Refused full rebuild: a preview already exists for '{slug}' "
                  f"(lead status: {lead_status or 'unknown'}). The build path makes V1 only; "
                  f"every later change must be an iterative revision that edits the approved "
                  f"version (LS-ITERATE). Pass allow_rebuild to override intentionally.")
        finish_job(job["id"], "blocked", blocker=reason)
        activity(lead_id, "build_refused_existing", {"slug": slug, "status": lead_status})
        log_line(f"BUILD REFUSED {slug}: {reason}")
        return

    if lead_id: update_lead(lead_id, {"status": "BUILDING", "updated_at": now()})

    # Fullest possible context: the lead row carries the loose social identifiers
    # from the Front Door; the job payload carries the build essentials.
    lead_ctx = dict(lead_row)
    lead_ctx.update({k: v for k, v in payload.items() if v not in (None, "")})

    # ENRICHMENT STAGE — Brand Research 2.0 (LS-BRAND-RESEARCH). Resolve loose
    # identifiers (@handle / "Name" / "Name + City") to VERIFIED public profiles
    # with confidence scoring, persist a reviewable Discovery Report, and merge the
    # accepted (>= threshold) URLs onto the lead so the brand engine consumes
    # verified data. Sub-threshold matches are flagged for review, never guessed.
    try:
        discovery = brand_research.run_discovery(lead_ctx)
        save_discovery(lead_id, discovery)
        lead_ctx = brand_research.merge_into_lead(lead_ctx, discovery)
        activity(lead_id, "brand_discovery", {
            "overall_confidence": discovery.get("overall_confidence"),
            "accepted": list(discovery.get("accepted", {}).keys()),
            "needs_review": [r["platform"] for r in discovery.get("needs_review", [])],
            "search_backend": discovery.get("search_backend"),
            "summary": discovery.get("summary")})
        log_line(f"discovery: {discovery.get('summary')}")
    except Exception as e:
        log_line(f"discovery stage skipped (non-fatal): {e!r}")

    try:
        log_line(f"learning brand + generating site for "
                 f"{lead_ctx.get('business') or lead_ctx.get('business_name')} ({slug})")
        html, report = generate_site(lead_ctx, slug)
        activity(lead_id, "brand_profile_built", {
            "confidence": report.get("brand_confidence"),
            "reached_website": report.get("reached_existing_website"),
            "real_assets": report["assets"]["real_count"],
            "stock_assets": report["assets"]["stock_count"],
            "preserved": report.get("preserved"), "improved": report.get("improved")})
        activity(lead_id, "homepage_complete", {"bytes": len(html)})

        ok, issues = qa(html, report)
        if not ok:
            # one corrective retry
            log_line(f"QA failed: {issues}; retrying once")
            html, report = generate_site(lead_ctx, slug)
            ok, issues = qa(html, report)
        if not ok:
            finish_job(job["id"], "blocked", blocker=f"QA failed: {issues}")
            activity(lead_id, "build_blocked", {"reason": issues})
            if lead_id: update_lead(lead_id, {"status": "CHANGES REQUESTED", "updated_at": now()})
            return
        activity(lead_id, "qa_passed", {"checks": "metadata+aitells+brand+assets"})

        # persist the Brand Report: live JSON sibling (for the Company OS) + lead row (graceful)
        try:
            deploy_file(slug, "brand-report.json", json.dumps(report, indent=2))
        except Exception as e:
            log_line(f"brand-report deploy skipped: {e!r}")
        if lead_id:
            try:
                update_lead(lead_id, {"brand_report": report})
            except Exception:
                pass  # column may not exist yet; report still lives as the JSON sibling

        url = deploy(slug, html)
        ver = snapshot_version(slug, html, {"kind": "build_v1", "confidence": report.get("brand_confidence")})
        activity(lead_id, "deployed", {"preview_url": url, "version": ver})
        log_line(f"deployed {url} (v{ver})")

        if lead_id:
            update_lead(lead_id, {"preview_url": url, "status": "PREVIEW READY", "updated_at": now()})
        finish_job(job["id"], "completed", result={"preview_url": url, "slug": slug})
        activity(lead_id, "job_completed", {"preview_url": url, "handoff": "PREVIEW READY -> CEO approval"})
        log_line(f"DONE {slug} -> awaiting CEO approval")
    except Exception as e:
        log_line(f"job {job.get('id')} FAILED: {e!r}")
        finish_job(job["id"], "blocked", blocker=repr(e)[:400])
        activity(lead_id, "build_blocked", {"reason": repr(e)[:400]})


# ---------- revisions (Replace Image + text Request a revision + visual refresh) ----------
# LS-ITERATE: a revision EDITS the approved version. It is Photoshop/Figma, not
# Midjourney. We never regenerate a different page; we change only what is asked
# and leave everything already approved exactly as it is.
REVISE = (
    "You are UNVEILED's senior web designer making a TARGETED EDIT to an already-APPROVED page. "
    "This is like editing a file in Figma, NOT regenerating a new design. Apply ONLY the change "
    "requested below. Preserve everything else EXACTLY: every section, its order, all copy and "
    "wording, the layout, the structure, the styling you are not asked to touch, and the entire "
    "head metadata block. Do not rephrase copy, do not reorder or add or remove sections, do not "
    "redesign anything outside the request. Never use an em dash. Return the COMPLETE updated HTML "
    "only, starting with <!DOCTYPE html>, every tag closed, ending with </html>. If you are running "
    "long, do not truncate, keep the page complete. Return ONLY the HTML, no commentary, no fences."
)

# A visual-quality refinement pass: improve how it LOOKS and FEELS while keeping
# all approved structure, copy, and layout identical. Uses the real brand assets.
REFINE_VISUAL = (
    "You are UNVEILED's senior web designer doing a VISUAL REFINEMENT pass on an already-APPROVED "
    "page. The structure, copy, and layout are APPROVED and must stay byte-for-byte in meaning: keep "
    "the same sections in the same order, the same words, the same links, and the same head metadata. "
    "Improve ONLY the visual quality using the brand assets provided below: a more authentic color "
    "palette drawn from the brand, refined typography, better imagery (use the real image URLs given), "
    "stronger visual harmony, spacing, and emotional feel. Do NOT rewrite copy, do NOT add, remove, or "
    "reorder sections, do NOT change the information architecture. This is a refinement, not a rebuild. "
    "Never use an em dash. Return the COMPLETE updated HTML only, starting with <!DOCTYPE html>, every "
    "tag closed, ending with </html>. Return ONLY the HTML, no commentary, no fences."
)

def fetch_deployed(slug):
    path = f"/repos/{GITHUB_REPO}/contents/previews/{slug}/index.html"
    existing = _gh("GET", path)
    if not existing or not existing.get("content"):
        return None
    return base64.b64decode(existing["content"]).decode("utf-8", "replace")

def apply_edit(html, instruction):
    """Targeted edit: change only what is asked, preserve all approved work."""
    return _claude_html(f"{REVISE}\n\nCHANGE REQUESTED:\n{instruction}\n\nCURRENT HTML:\n{html}")

def apply_visual_refresh(html, brand_block, instruction):
    """Visual-quality refinement on the approved page, using real brand assets."""
    return _claude_html(
        f"{REFINE_VISUAL}\n\n{brand_block}\n\nREFINEMENT FOCUS:\n{instruction}\n\nCURRENT HTML:\n{html}")

def slug_from(lead, payload):
    pu = (lead.get("preview_url") or "").rstrip("/")
    if pu:
        return pu.split("/")[-1]
    return slugify(payload.get("business") or lead.get("business_name"))

def process_revision(job):
    payload = job.get("payload") or {}
    lead_id = payload.get("lead_id")
    kind = payload.get("kind")
    lead = get_lead(lead_id) if lead_id else {}
    slug = slug_from(lead, payload)
    activity(lead_id, "revision_started", {"job": job["id"], "kind": kind})
    if lead_id: update_lead(lead_id, {"status": "BUILDING", "updated_at": now()})
    try:
        html = fetch_deployed(slug)
        if not html:
            finish_job(job["id"], "blocked", blocker=f"could not fetch deployed site for slug '{slug}'")
            activity(lead_id, "revision_blocked", {"reason": "site not found"})
            return

        if kind == "replace_image":
            orig = payload.get("original_url") or ""
            new = payload.get("new_image_url") or ""
            if not (orig and new):
                finish_job(job["id"], "blocked", blocker="replace_image missing original/new url")
                return
            if orig in html:
                html = html.replace(orig, new)
            else:
                # fallback: match by path (ignore query string / host variations)
                base = orig.split("?")[0]
                tail = "/".join(base.split("/")[-2:])
                if tail and tail in html:
                    html = re.sub(re.escape(tail) + r'[^"\')\s]*', new, html)
                else:
                    finish_job(job["id"], "blocked",
                               blocker="original image not found on the live page (it may already have changed)")
                    activity(lead_id, "revision_blocked", {"reason": "original image not found"})
                    if lead_id: update_lead(lead_id, {"status": "PREVIEW READY", "updated_at": now()})
                    return
        elif kind == "visual_refresh":
            # Improve only the visual quality, preserving all approved work,
            # using the customer's real brand assets (LS-ITERATE + LS-BRAND-PRESERVE).
            profile = brand_profile.build_brand_profile(lead)
            assets = brand_profile.assemble_assets(profile, profile.get("industry", ""))
            brand_block = brand_profile.render_prompt_block(profile, assets)
            instruction = (payload.get("instruction")
                           or "Refine color, typography, imagery, and visual harmony to feel premium "
                              "and on-brand, preserving all approved structure, copy, and layout.")
            html = apply_visual_refresh(html, brand_block, instruction)
        else:
            instruction = payload.get("instruction") or ""
            if not instruction:
                finish_job(job["id"], "blocked", blocker="revision missing instruction")
                return
            html = apply_edit(html, instruction)

        ok, issues = qa(html)
        if not ok:
            finish_job(job["id"], "blocked", blocker=f"QA failed: {issues}")
            activity(lead_id, "revision_blocked", {"reason": issues})
            if lead_id: update_lead(lead_id, {"status": "PREVIEW READY", "updated_at": now()})
            return

        url = deploy(slug, html)
        ver = snapshot_version(slug, html, {"kind": kind, "instruction": payload.get("instruction")})
        finish_job(job["id"], "completed", result={"preview_url": url, "kind": kind, "version": ver})
        if lead_id:
            update_lead(lead_id, {"preview_url": url, "status": "PREVIEW READY", "updated_at": now()})
        activity(lead_id, "revision_complete", {"kind": kind, "preview_url": url, "version": ver})
        log_line(f"REVISION done ({kind}) -> {url} (v{ver})")
    except Exception as e:
        log_line(f"revision {job.get('id')} FAILED: {e!r}")
        finish_job(job["id"], "blocked", blocker=repr(e)[:400])
        activity(lead_id, "revision_blocked", {"reason": repr(e)[:400]})
        if lead_id: update_lead(lead_id, {"status": "PREVIEW READY", "updated_at": now()})


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
                log_line(f"claimed build job {job['id']}")
                process(job)
                continue
            rev = claim_revision()
            if rev:
                log_line(f"claimed revision {rev['id']}")
                process_revision(rev)
                continue
            time.sleep(POLL)
        except Exception as e:
            log_line(f"loop error: {e!r}")
            time.sleep(POLL)


if __name__ == "__main__":
    run_builder()
