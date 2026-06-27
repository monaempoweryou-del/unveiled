#!/usr/bin/env python3
"""
UNVEILED — combined worker entrypoint (one Railway service, two jobs).

Thread 1: the Phase 0 heartbeat (every 30s) so the watchdog always sees a pulse,
          even while a build is running.
Main:     the Phase 1 builder loop (claims build_website jobs and ships them).

If the builder keys (ANTHROPIC_API_KEY, GITHUB_TOKEN) are not set yet, the builder
idles gracefully and the heartbeat keeps running — so this is safe to deploy before
the keys exist. Add the keys in Railway and redeploy to activate building.
"""
import threading
import time

import heartbeat
import build_worker


def heartbeat_thread():
    while True:
        try:
            heartbeat.log_heartbeat()
        except Exception as e:
            print(f"[heartbeat] error: {e!r}", flush=True)
        time.sleep(heartbeat.INTERVAL)


def main():
    print("[worker_main] starting: heartbeat thread + builder loop", flush=True)
    threading.Thread(target=heartbeat_thread, daemon=True).start()
    # Builder returns immediately if keys are missing; keep the process (and
    # heartbeat) alive either way.
    build_worker.run_builder()
    # If the builder returned (keys missing), idle forever so the heartbeat lives.
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
