#!/usr/bin/env python3
"""
UNVEILED — Persistent Execution (reconnect + continue).

Execution belongs to the COMPANY, not the conversation. Work Orders + task graphs
live in the OS (work_orders / work_order_tasks). ANY execution context — chat,
coworker, Dispatch, mobile, desktop, the worker, or a different AI platform —
calls resume() on start and continues wherever the company already is.

resume() flow (Continuous Execution Doctrine):
  1 propagate_blocks   (mark dependents of blocked tasks)
  2 claim a runnable task (deps all done)
  3 run it via its handler (run_spec.type -> HANDLERS)
  4 complete_task with the result (done / blocked_* / needs_decision / failed)
  5 repeat until nothing is runnable
  6 return ONE briefing (execution_briefing)

The always-on runner is the worker; a chat/session that has OS access resumes too.
If a context has no OS access (e.g. sandbox with no Supabase egress), resume()
says so honestly — the worker still owns execution. Stdlib only.
"""
import os, json, urllib.request

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY  = os.environ.get("SUPABASE_SERVICE_KEY", "")

HANDLERS = {}   # run_spec "type" -> callable(args) -> (status, detail)
def handler(t):
    def deco(fn): HANDLERS[t] = fn; return fn
    return deco


def _sb(method, path, body=None):
    h = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}", "Content-Type": "application/json"}
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{SUPABASE_URL}{path}", data=data, method=method, headers=h)
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode()
        return json.loads(raw) if raw else None


def resume(worker="ctx-1", max_tasks=200):
    if not (SUPABASE_URL and SERVICE_KEY):
        return {"ok": False,
                "note": "no OS access from this context; execution is owned by the worker. "
                        "The company continues there. (This is not a stop condition.)"}
    _sb("POST", "/rest/v1/rpc/propagate_blocks", {})
    claimed = 0
    while claimed < max_tasks:
        rows = _sb("POST", "/rest/v1/rpc/claim_task", {"p_worker": worker})
        if not rows:
            break
        t = rows[0]
        spec = t.get("run_spec") or {}
        fn = HANDLERS.get(spec.get("type"))
        if not fn:
            status, detail = "needs_decision", f"no handler for task type '{spec.get('type','?')}' — capability missing"
        else:
            try:
                status, detail = fn(spec.get("args", {}))
            except Exception as e:
                status, detail = "failed", repr(e)
        _sb("POST", "/rest/v1/rpc/complete_task",
            {"p_id": t["id"], "p_status": status, "p_detail": detail})
        _sb("POST", "/rest/v1/rpc/propagate_blocks", {})
        claimed += 1
    # heartbeat: recalc Company Brain priorities + snapshot the KPI (best-effort)
    for rpc in ("refresh_industry_intelligence", "snapshot_execution_metrics"):
        try: _sb("POST", f"/rest/v1/rpc/{rpc}", {})
        except Exception: pass
    briefing = _sb("GET", "/rest/v1/execution_briefing?status=eq.active&select=*")
    metrics = _sb("GET", "/rest/v1/execution_metrics?select=*")
    return {"ok": True, "claimed": claimed,
            "briefing": briefing, "metrics": (metrics or [{}])[0]}


if __name__ == "__main__":
    r = resume()
    print(json.dumps(r, indent=2))
