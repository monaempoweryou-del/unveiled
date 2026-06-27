#!/usr/bin/env python3
"""
UNVEILED — Phase 0 worker: PULSE OFF THE LAPTOP.

This does exactly one thing: prove that a process running on real
infrastructure (Railway), with no chat session and no human, can write
to the company's source of truth on its own, forever.

It writes a 'heartbeat' row to activity_log every HEARTBEAT_INTERVAL
seconds. When you see those rows arriving in Supabase while this chat is
closed and your Mac is asleep, Phase 0 is proven and the floor has a pulse.

Stdlib only — no pip install, nothing to break.

Required environment variables (set once in Railway):
  SUPABASE_URL          e.g. https://eosvftmiwndmctrqprtz.supabase.co
  SUPABASE_SERVICE_KEY  the service_role key (Supabase > Settings > API)

Optional:
  WORKER_ID             label for this worker (default: railway-worker-1)
  HEARTBEAT_INTERVAL    seconds between beats (default: 30)
"""
import os
import sys
import time
import uuid
import json
import datetime
import urllib.request
import urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
WORKER_ID = os.environ.get("WORKER_ID", "railway-worker-1")
INTERVAL = int(os.environ.get("HEARTBEAT_INTERVAL", "30"))


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def log_heartbeat():
    """Insert one heartbeat row into activity_log via the Supabase REST API."""
    row = {
        "entity_type": "worker",
        "entity_id": str(uuid.uuid4()),
        "action": "heartbeat",
        "actor": WORKER_ID,
        "meta": {"host": "railway", "phase": 0, "ts": _now()},
    }
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/activity_log",
        data=json.dumps(row).encode(),
        method="POST",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.status


def main():
    missing = [k for k in ("SUPABASE_URL", "SUPABASE_SERVICE_KEY")
               if not os.environ.get(k)]
    if missing:
        print(f"FATAL: missing env vars: {', '.join(missing)}", flush=True)
        sys.exit(1)

    print(f"[{WORKER_ID}] Phase 0 heartbeat worker starting "
          f"(interval={INTERVAL}s, target={SUPABASE_URL})", flush=True)

    while True:
        try:
            status = log_heartbeat()
            print(f"[{WORKER_ID}] heartbeat ok ({status}) {_now()}", flush=True)
        except urllib.error.HTTPError as e:
            body = e.read().decode(errors="replace")
            print(f"[{WORKER_ID}] heartbeat HTTP {e.code}: {body}", flush=True)
        except Exception as e:
            print(f"[{WORKER_ID}] heartbeat FAILED: {e!r}", flush=True)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
