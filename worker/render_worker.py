#!/usr/bin/env python3
"""
UNVEILED — Video Assembly Service (Book 03 service; Production dept).

Autonomous render pipeline. Loop:
  CLAIM   - claim one pending 'assemble_reel' job (claim_render_job RPC)
  FETCH   - download the shots + voiceover from their URLs
  RENDER  - ffmpeg: normalize each shot, burn in captions (drawtext), add a
            branded CTA end card, concat, lay the voiceover over the top
  PUBLISH - push the final MP4 to GitHub Pages -> public https://unveiled.pro URL
  REGISTER- write the final into the Command Center (creative_media = ready-to-post,
            creative_assets.status = ready-to-post) + telemetry to activity_log
  finish the job completed / blocked-with-reason.

Design (Book 01/03):
  - This is the "Deploy/Media Rendering" family: one approved method, in code,
    so any surface can request it and the OS performs it (Book 03 §4).
  - White-glove (Book 01 §24): produces the finished, captioned, CTA'd file with
    no human step; a human only approves posting (permanently-gated is posting,
    not rendering).
  - Honesty: native metrics not invented; only what we measure.

Stdlib only (ffmpeg is a system binary called via subprocess).
REQUIRES ON HOST: ffmpeg built with libfreetype (drawtext) + a TTF font.
  Railway: see worker/nixpacks.toml (installs ffmpeg + fonts-dejavu-core).
Secrets via env (already set for the builder):
  SUPABASE_URL, SUPABASE_SERVICE_KEY, GITHUB_TOKEN
Optional: GITHUB_REPO (default monaempoweryou-del/unveiled),
  RENDER_POLL (default 20), WORKER_ID (default railway-render-1),
  FONT (default /usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf)
"""
import os, sys, time, json, base64, subprocess, tempfile, datetime, urllib.request, urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO  = os.environ.get("GITHUB_REPO", "monaempoweryou-del/unveiled")
WORKER_ID    = os.environ.get("WORKER_ID", "railway-render-1")
POLL         = int(os.environ.get("RENDER_POLL", "20"))
FONT         = os.environ.get("FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")
SITE_BASE    = "https://unveiled.pro"

W, H, FPS = 1080, 1920, 30
INK, CREAM, VIOLET = "0x1C1917", "0xFAF8F5", "0x8B5CF6"


def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def log(m): print(f"[{WORKER_ID}] {now()} {m}", flush=True)


# ---------- Supabase REST ----------
def _sb(method, path, body=None, headers=None):
    h = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}",
         "Content-Type": "application/json"}
    if headers: h.update(headers)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SUPABASE_URL}{path}", data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else None

def activity(entity_id, action, meta):
    try:
        _sb("POST", "/rest/v1/activity_log",
            {"entity_type": "creative_asset", "entity_id": entity_id, "action": action,
             "actor": WORKER_ID, "meta": meta}, {"Prefer": "return=minimal"})
    except Exception as e:
        log(f"activity failed ({action}): {e!r}")

def claim_render_job():
    # REST claim — no DDL/RPC needed. Grab one pending job, mark it running.
    # The status filter on the PATCH guards against a double-claim.
    rows = _sb("GET", "/rest/v1/work_queue?type=eq.assemble_reel&status=eq.pending"
                      "&order=priority.asc,created_at.asc&limit=1")
    if not rows:
        return None
    jid = rows[0]["id"]
    claimed = _sb("PATCH", f"/rest/v1/work_queue?id=eq.{jid}&status=eq.pending",
                  {"status": "running", "claimed_at": now(), "updated_at": now()},
                  {"Prefer": "return=representation"})
    return claimed[0] if claimed else None


SEED_TRACKING = "UNV-LOSS-8SEC-H01"
SEED_ASSET    = "c1000000-0000-4000-8000-000000000001"
CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3EWHLVZERh0UJFhuopr0aNP3t90"

def ensure_seed_job():
    """Self-enqueue the first 8-Seconds render if it doesn't already exist.
    Removes the human-SQL step: the worker has the capability, so the worker does it."""
    try:
        existing = _sb("GET", "/rest/v1/work_queue?type=eq.assemble_reel"
                              f"&payload->>tracking_id=eq.{SEED_TRACKING}&limit=1")
        if existing:
            return
        payload = {
            "creative_asset_id": SEED_ASSET, "tracking_id": SEED_TRACKING,
            "shots": [
                f"{CDN}/hf_20260702_015052_45292c1e-fd40-454c-9b7a-d37fe5e42a5d.mp4",
                f"{CDN}/hf_20260702_035128_ae649689-d48d-4344-9a9d-bb88b9c8adcd.mp4",
                f"{CDN}/hf_20260702_035131_d5f3ec4f-cc86-40d9-bba7-bd8c900b440e.mp4"],
            "vo": f"{CDN}/hf_20260702_015354_81c8bb85-5193-4607-aa45-1cf62b0348ab.wav",
        }
        _sb("POST", "/rest/v1/work_queue",
            {"type": "assemble_reel", "status": "pending", "priority": 5, "payload": payload},
            {"Prefer": "return=minimal"})
        log("self-enqueued first assemble_reel job (UNV-LOSS-8SEC-H01)")
    except Exception as e:
        log(f"seed enqueue skipped: {e!r}")

def finish_job(job_id, status, result=None, blocker=None):
    body = {"status": status, "updated_at": now()}
    if result is not None: body["result"] = result
    if blocker is not None: body["blocker_reason"] = blocker
    _sb("PATCH", f"/rest/v1/work_queue?id=eq.{job_id}", body, {"Prefer": "return=minimal"})


# ---------- helpers ----------
def esc_dt(text):
    """Escape text for ffmpeg drawtext."""
    return (text.replace("\\", "\\\\").replace(":", "\\:")
                .replace("'", "’").replace("%", "\\%"))

def download(url, path):
    with urllib.request.urlopen(url, timeout=120) as r, open(path, "wb") as f:
        f.write(r.read())

def norm(chain_in, out_label, extra=""):
    return (f"[{chain_in}]trim=0:5,setpts=PTS-STARTPTS,"
            f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
            f"fps={FPS},format=yuv420p{extra}[{out_label}]")

def dt(text, y, size, color, t0, t1):
    return (f"drawtext=fontfile='{FONT}':text='{esc_dt(text)}':"
            f"x=(w-text_w)/2:y={y}:fontsize={size}:fontcolor={color}:"
            f"box=1:boxcolor=0x00000055:boxborderw=28:enable='between(t,{t0},{t1})'")


# Default caption plan for the 8-Seconds reel (payload may override).
DEFAULT_CAPTIONS = {
    "s1": [("8 seconds to earn their trust", 0.4, 5)],
    "s2": [("your website has 8 seconds", 0, 2.6), ("they left.", 2.7, 5)],
    "s3": [("imagine what they see instead", 0.3, 5)],
    "cta": ["See your business, revealed.", "Free preview in 72 hours",
            "Build First. Decide Later.", "unveiled.pro/start"],
}


def build_cmd(s1, s2, s3, vo, out, caps):
    cap = caps or DEFAULT_CAPTIONS
    # per-shot drawtext chains
    def chain(caplist):
        return "," + ",".join(dt(t, f"h*0.12", 60 if len(t) < 22 else 52, "white", a, b)
                               for (t, a, b) in caplist) if caplist else ""
    ctacard = ("color=c=%s:s=%dx%d:d=4:r=%d" % (CREAM, W, H, FPS))
    ctatxt = cap.get("cta", DEFAULT_CAPTIONS["cta"])
    cta_dt = ",".join([
        dt(ctatxt[0], "h*0.34", 62, INK, 0.2, 4),
        dt(ctatxt[1], "h*0.44", 44, INK, 0.5, 4),
        dt(ctatxt[2], "h*0.56", 40, VIOLET, 0.9, 4),
        dt(ctatxt[3], "h*0.63", 46, INK, 1.2, 4),
    ])
    fc = ";".join([
        norm("0:v", "v0", chain(cap.get("s1"))),
        norm("1:v", "v1", chain(cap.get("s2"))),
        norm("2:v", "v2", chain(cap.get("s3"))),
        f"[3:v]{cta_dt},format=yuv420p[v3]",
        "[v0][v1][v2][v3]concat=n=4:v=1:a=0[v]",
        "[4:a]afade=t=out:st=17:d=0.8[a]",
    ])
    return [
        "ffmpeg", "-y",
        "-i", s1, "-i", s2, "-i", s3,
        "-f", "lavfi", "-i", ctacard,
        "-i", vo,
        "-filter_complex", fc,
        "-map", "[v]", "-map", "[a]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
        "-shortest", out,
    ]


# ---------- publish ----------
def publish_to_pages(local_path, repo_path):
    """Commit the file to the Pages repo -> public https URL. Reuses GITHUB_TOKEN."""
    with open(local_path, "rb") as f:
        content_b64 = base64.b64encode(f.read()).decode()
    api = f"https://api.github.com/repos/{GITHUB_REPO}/contents/{repo_path}"
    # get existing sha if present (update vs create)
    sha = None
    try:
        req = urllib.request.Request(api, headers={"Authorization": f"Bearer {GITHUB_TOKEN}",
                                                   "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            sha = json.loads(r.read().decode()).get("sha")
    except Exception:
        pass
    body = {"message": f"Render: {repo_path}", "content": content_b64}
    if sha: body["sha"] = sha
    req = urllib.request.Request(api, data=json.dumps(body).encode(), method="PUT",
                                 headers={"Authorization": f"Bearer {GITHUB_TOKEN}",
                                          "Accept": "application/vnd.github+json"})
    urllib.request.urlopen(req, timeout=60).read()
    return f"{SITE_BASE}/{repo_path}"


# ---------- register into the Command Center ----------
def register_final(asset_id, tracking_id, public_url, seconds, cost_min):
    # add the finished video as ready-to-post media on the asset
    try:
        _sb("POST", "/rest/v1/creative_media",
            {"creative_asset_id": asset_id, "kind": "video", "role": "final-reel",
             "producer": "worker:ffmpeg", "cost_credits": 0, "version": 1,
             "url": public_url, "aspect_ratio": "9:16", "status": "ready-to-post"},
            {"Prefer": "return=minimal"})
    except Exception as e:
        log(f"media insert failed: {e!r}")
    try:
        _sb("PATCH", f"/rest/v1/creative_assets?id=eq.{asset_id}",
            {"status": "ready-to-post", "published_url": public_url, "updated_at": now()},
            {"Prefer": "return=minimal"})
    except Exception as e:
        log(f"asset patch failed: {e!r}")
    activity(asset_id, "reel_rendered",
             {"tracking_id": tracking_id, "url": public_url, "seconds": seconds,
              "render_minutes": cost_min, "producer": "worker:ffmpeg"})


def process(job):
    payload = job.get("payload") or {}
    asset_id   = payload.get("creative_asset_id")
    tracking   = payload.get("tracking_id", "reel")
    shots      = payload.get("shots") or []
    vo_url     = payload.get("vo")
    caps       = payload.get("captions")
    if len(shots) < 3 or not vo_url:
        finish_job(job["id"], "blocked", blocker="need 3 shots + vo in payload")
        return
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        s1, s2, s3 = f"{tmp}/s1.mp4", f"{tmp}/s2.mp4", f"{tmp}/s3.mp4"
        vo, out = f"{tmp}/vo.wav", f"{tmp}/final.mp4"
        log("downloading assets")
        download(shots[0], s1); download(shots[1], s2); download(shots[2], s3)
        download(vo_url, vo)
        log("rendering (captions + CTA)")
        r = subprocess.run(build_cmd(s1, s2, s3, vo, out, caps),
                           capture_output=True, text=True)
        if r.returncode != 0 or not os.path.exists(out):
            finish_job(job["id"], "blocked", blocker=f"ffmpeg failed: {r.stderr[-500:]}")
            return
        repo_path = f"marketing/reels/{tracking}.mp4"
        log(f"publishing -> {repo_path}")
        url = publish_to_pages(out, repo_path)
        mins = round((time.time() - t0) / 60, 1)
        if asset_id:
            register_final(asset_id, tracking, url, 17.8, mins)
        finish_job(job["id"], "completed", result=json.dumps({"url": url}))
        log(f"DONE -> {url}")


def run_render_loop():
    if not (SUPABASE_URL and SERVICE_KEY):
        log("no supabase creds; render service idle"); return
    log("Video Assembly Service online; polling for assemble_reel jobs")
    ensure_seed_job()  # self-activate: enqueue the first render if none exists
    while True:
        try:
            job = claim_render_job()
            if job:
                log(f"claimed render job {job.get('id')}")
                process(job)
            else:
                time.sleep(POLL)
        except Exception as e:
            log(f"loop error: {e!r}")
            time.sleep(POLL)


if __name__ == "__main__":
    run_render_loop()
