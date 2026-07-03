#!/usr/bin/env python3
"""
Execution Engine v2 — cloud drain loop for the WORKSPACE queue (Book 02 §9).

Drains `workspace_queue` (the workspace layer — NOT customer work_orders,
which persistent_execution.py owns). Runs 24/7 on Railway so the workspace
factory survives the Mac sleeping, Claude closing, and power outages.

Each cycle (WORKSPACE_INTERVAL, default 60s):
  1. beat  — upsert workspace_heartbeats (loop_name='railway-worker') with
             live queue counts; this doubles as the rolling snapshot.
  2. promote — due retries and dependency-satisfied pending orders -> runnable.
  3. drain — atomically claim runnable kind='service' orders and execute their
             next_action via the HANDLERS table. Unknown services are deferred
             to waiting_external (blocker recorded), NEVER failed silently —
             and never block other orders (scheduler rule 1).

kind='judgment' and kind='local' orders are intentionally left alone: judgment
orders are drained by Claude loops, local orders by the Mac watchdog.

Stdlib only. Uses the same env as heartbeat.py (SUPABASE_URL,
SUPABASE_SERVICE_KEY); idles gracefully if they're missing, so this is safe
to deploy anywhere.
"""
import datetime
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
WORKER_ID = os.environ.get("WORKSPACE_WORKER_ID", "railway-worker")
INTERVAL = int(os.environ.get("WORKSPACE_INTERVAL", "60"))
STATUSES = ["pending", "runnable", "running", "waiting_approval",
            "waiting_credentials", "waiting_external", "retry",
            "completed", "failed"]


def _now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def _req(method, path, body=None, prefer=None):
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=json.dumps(body).encode() if body is not None else None,
        method=method, headers=headers,
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def _event(order_id, event):
    try:
        _req("POST", "workspace_queue_events",
             {"order_id": order_id, "actor": WORKER_ID, "event": event},
             prefer="return=minimal")
    except Exception as e:  # events are best-effort, never fatal
        print(f"[workspace] event log failed for {order_id}: {e!r}", flush=True)


def _patch_order(order_id, fields, guard=""):
    """PATCH one order; optional guard narrows the WHERE (optimistic claim)."""
    fields["updated_at"] = _now()
    path = f"workspace_queue?id=eq.{urllib.parse.quote(order_id)}{guard}"
    return _req("PATCH", path, fields, prefer="return=representation")


# ---------------------------------------------------------------- handlers --
def handle_noop(order):
    return f"noop ok at {_now()}"


def handle_snapshot(order):
    counts = _counts()
    return "snapshot: " + json.dumps(counts)


HANDLERS = {
    "noop": handle_noop,
    "snapshot": handle_snapshot,
    # Register new deterministic services here; each takes the order dict and
    # returns a completion note (or raises to trigger retry policy).
}


# ------------------------------------------------------------------- cycle --
def _counts():
    rows = _req("GET", "workspace_queue?select=status")
    counts = {}
    for r in rows or []:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    return counts


def beat():
    counts = _counts()
    _req("POST", "workspace_heartbeats",
         {"loop_name": WORKER_ID, "last_beat": _now(), "counts": counts},
         prefer="resolution=merge-duplicates,return=minimal")
    return counts


def promote():
    now = _now()
    due = _req("GET", f"workspace_queue?status=eq.retry&next_retry_at=lte.{now}&select=id") or []
    for r in due:
        _patch_order(r["id"], {"status": "runnable", "blocker": None},
                     guard="&status=eq.retry")
        _event(r["id"], "retry due -> runnable")
    pending = _req("GET", "workspace_queue?status=eq.pending&select=id,dependencies") or []
    if pending:
        done_rows = _req("GET", "workspace_queue?status=eq.completed&select=id") or []
        done = {r["id"] for r in done_rows}
        for r in pending:
            if all(d in done for d in (r.get("dependencies") or [])):
                _patch_order(r["id"], {"status": "runnable"}, guard="&status=eq.pending")
                _event(r["id"], "dependencies satisfied -> runnable")


def drain():
    ran = 0
    while True:
        candidates = _req(
            "GET",
            "workspace_queue?status=eq.runnable&kind=eq.service"
            "&select=*&order=created_at.asc&limit=1") or []
        if not candidates:
            return ran
        order = candidates[0]
        oid = order["id"]
        claimed = _patch_order(
            oid, {"status": "running", "owner": WORKER_ID, "heartbeat_at": _now()},
            guard="&status=eq.runnable")
        if not claimed:  # someone else won the claim; try next cycle
            continue
        _event(oid, f"claimed by {WORKER_ID}")
        service = (order.get("next_action") or "").strip()
        handler = HANDLERS.get(service)
        try:
            if handler is None:
                _patch_order(oid, {
                    "status": "waiting_external",
                    "blocker": f"no registered handler '{service}' in railway worker",
                })
                _event(oid, f"deferred -> waiting_external: no handler '{service}'")
                continue
            note = handler(order)
            _patch_order(oid, {"status": "completed", "blocker": None})
            _event(oid, f"completed: {note}")
            ran += 1
        except Exception as e:
            attempts = (order.get("retry_attempts") or 0) + 1
            if attempts > (order.get("retry_max") or 3):
                _patch_order(oid, {"status": "failed",
                                   "blocker": f"retry budget exhausted; last error: {e!r}"})
                _event(oid, f"failed after {attempts - 1} retries: {e!r}")
            else:
                nxt = (datetime.datetime.now(datetime.timezone.utc)
                       + datetime.timedelta(minutes=15)).isoformat()
                _patch_order(oid, {"status": "retry", "retry_attempts": attempts,
                                   "next_retry_at": nxt, "blocker": repr(e)})
                _event(oid, f"deferred -> retry ({attempts}/{order.get('retry_max', 3)}): {e!r}")


def run_workspace_loop():
    if not SUPABASE_URL or not SERVICE_KEY:
        print("[workspace] SUPABASE_URL/SERVICE_KEY missing — idling", flush=True)
        time.sleep(300)
        return
    counts = beat()
    promote()
    ran = drain()
    print(f"[workspace] beat ok, counts={counts}, ran={ran}", flush=True)


def main():
    print(f"[workspace] drain loop starting (interval={INTERVAL}s)", flush=True)
    while True:
        try:
            run_workspace_loop()
        except urllib.error.HTTPError as e:
            print(f"[workspace] HTTP {e.code}: {e.read().decode(errors='replace')[:200]}", flush=True)
        except Exception as e:
            print(f"[workspace] cycle error: {e!r}", flush=True)
        time.sleep(INTERVAL)


if __name__ == "__main__":
    main()
