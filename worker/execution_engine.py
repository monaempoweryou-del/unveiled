#!/usr/bin/env python3
"""
UNVEILED — Execution Engine (Continuous Execution Doctrine).

One approval = continuous execution. Given a Work Order's tasks + dependencies,
the engine executes every independently-executable task (in parallel where
possible), re-evaluates after each completion, and keeps pulling work until there
is nothing left it can legally/technically run. It stops ONLY at the four
boundaries and then emits a single briefing. No "what's next", no waiting.

Four stop categories (a task returns one):
  done                    -> success; dependents may run
  blocked_constitutional  -> Books 01-03 forbid it (a gate); dependents blocked
  blocked_external        -> a real external dependency the company can't overcome
  needs_decision          -> a business decision requires the CEO
  failed                  -> error (retried per policy, then blocked)

The engine never stops just because a task finished; it re-evaluates and
continues. It only surfaces the briefing when no task is runnable.

Stdlib only. Usable in the worker loop or standalone.
"""
import concurrent.futures as cf
import time, sys


class Task:
    def __init__(self, id, run, deps=None, retries=1):
        self.id = id
        self.run = run              # callable() -> (status, detail)
        self.deps = set(deps or [])
        self.retries = retries
        self.status = "pending"     # pending|running|done|blocked_*|needs_decision|failed
        self.detail = ""

DONE = "done"
BLOCKERS = {"blocked_constitutional", "blocked_external", "needs_decision", "failed"}


class ExecutionEngine:
    def __init__(self, tasks, max_parallel=8):
        self.tasks = {t.id: t for t in tasks}
        self.max_parallel = max_parallel

    def _deps_done(self, t):
        return all(self.tasks[d].status == DONE for d in t.deps if d in self.tasks)

    def _dep_blocked(self, t):
        return any(self.tasks[d].status in BLOCKERS for d in t.deps if d in self.tasks)

    def _ready(self):
        r = []
        for t in self.tasks.values():
            if t.status != "pending":
                continue
            if self._dep_blocked(t):
                t.status, t.detail = "blocked_external", "upstream task blocked"
            elif self._deps_done(t):
                r.append(t)
        return r

    def _run_one(self, t):
        attempts = 0
        while True:
            attempts += 1
            try:
                status, detail = t.run()
            except Exception as e:
                status, detail = "failed", repr(e)
            if status == "failed" and attempts <= t.retries:
                continue
            return t.id, status, detail

    def run(self):
        # Keep pulling ready work until nothing is runnable (the only stop).
        while True:
            ready = self._ready()
            if not ready:
                break
            with cf.ThreadPoolExecutor(max_workers=min(self.max_parallel, len(ready))) as ex:
                for t in ready:
                    t.status = "running"
                futs = {ex.submit(self._run_one, t): t for t in ready}
                for fu in cf.as_completed(futs):
                    tid, status, detail = fu.result()
                    self.tasks[tid].status = status
                    self.tasks[tid].detail = detail
            # loop re-evaluates: newly-unblocked tasks become ready automatically
        return self.briefing()

    def briefing(self):
        b = {"completed": [], "running": [], "blocked": [], "needs_decision": []}
        for t in self.tasks.values():
            if t.status == DONE:
                b["completed"].append(t.id)
            elif t.status == "running":
                b["running"].append(t.id)
            elif t.status == "needs_decision":
                b["needs_decision"].append({"task": t.id, "why": t.detail})
            elif t.status in BLOCKERS:
                b["blocked"].append({"task": t.id, "category": t.status, "why": t.detail})
        return b


def _fmt(b):
    out = ["EXECUTION BRIEFING (reached a genuine stopping point)"]
    out.append("✅ Completed: " + (", ".join(b["completed"]) or "none"))
    out.append("🔄 Running:   " + (", ".join(b["running"]) or "none"))
    out.append("🚧 Blocked:   " + ("; ".join(f"{x['task']} ({x['category']}: {x['why']})" for x in b["blocked"]) or "none"))
    out.append("❓ Needs you:  " + ("; ".join(f"{x['task']} ({x['why']})" for x in b["needs_decision"]) or "none"))
    return "\n".join(out)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        # a realistic acquisition graph tonight: independent chains run in parallel;
        # execution continues past a blocked branch; stops only at real boundaries.
        def ok(): return ("done", "")
        def railway_down(): return ("blocked_external", "Railway vendor outage")
        def needs_source(): return ("needs_decision", "connect a discovery source or provide a CSV")
        tasks = [
            Task("discover", needs_source),                          # boundary: business decision
            Task("analyze", ok, deps=["discover"]),                  # blocked via dep
            Task("qualify", ok, deps=["analyze"]),                   # blocked via dep
            Task("industry_research", ok),                           # independent -> runs
            Task("build_engines", ok, deps=["industry_research"]),   # runs
            Task("render_video", railway_down),                      # boundary: external
            Task("update_registry", ok, deps=["build_engines"]),     # runs
        ]
        print(_fmt(ExecutionEngine(tasks).run()))
