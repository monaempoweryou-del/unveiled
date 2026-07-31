#!/usr/bin/env python3
"""
UNVEILED — branded tracking proxy (wo-20260714-002).

Reverse-proxies the branded subdomain go.unveiled.pro onto the Supabase
`track` edge function so outreach emails carry a branded open-pixel and
click/yes link instead of a raw *.supabase.co URL (raw supabase links hurt
inbox placement and look untrustworthy).

    https://go.unveiled.pro/functions/v1/track?...   -> upstream, path preserved
    https://go.unveiled.pro/t?...                    -> upstream track, query preserved
    https://go.unveiled.pro/health                   -> 200 (Railway healthcheck)

Deliberately INERT until switched on: the listener only starts when
TRACK_PROXY_ENABLED is truthy, so deploying this file changes nothing about
the running worker. Turn it on in Railway (env var + custom domain) in an
attended session, then repoint the links in outreach_sender.py LAST, only
after go.unveiled.pro verifies live.

Standard library only (matches worker/requirements.txt).
"""
import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://eosvftmiwndmctrqprtz.supabase.co"
).rstrip("/")
UPSTREAM = os.environ.get("TRACK_UPSTREAM", f"{SUPABASE_URL}/functions/v1/track")
PORT = int(os.environ.get("PORT", "8080"))
TIMEOUT = float(os.environ.get("TRACK_PROXY_TIMEOUT", "10"))

# Hop-by-hop and host-scoped headers must not be forwarded either direction.
_DROP_REQUEST_HEADERS = {
    "host", "connection", "keep-alive", "proxy-authenticate",
    "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade",
    "content-length", "accept-encoding",
}
_DROP_RESPONSE_HEADERS = {
    "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
    "te", "trailer", "transfer-encoding", "upgrade", "content-length",
}


def enabled():
    return os.environ.get("TRACK_PROXY_ENABLED", "").strip().lower() in (
        "1", "true", "yes", "on"
    )


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """The click/yes link answers with a 302 the browser must see itself."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def upstream_url(path, query):
    """Map an inbound branded path onto the Supabase function host."""
    if path.startswith("/functions/v1/"):
        target = f"{SUPABASE_URL}{path}"
    else:
        target = UPSTREAM
    return f"{target}?{query}" if query else target


class TrackProxyHandler(BaseHTTPRequestHandler):
    server_version = "unveiled-track-proxy/1"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *a):
        print(f"[track-proxy] {self.address_string()} {fmt % a}", flush=True)

    def _split(self):
        path, _, query = self.path.partition("?")
        return path, query

    def _forward(self, body=None):
        path, query = self._split()

        if path in ("/health", "/healthz"):
            self._respond(200, b"ok", {"Content-Type": "text/plain"})
            return

        headers = {
            k: v for k, v in self.headers.items()
            if k.lower() not in _DROP_REQUEST_HEADERS
        }
        req = urllib.request.Request(
            upstream_url(path, query),
            data=body,
            headers=headers,
            method=self.command,
        )
        try:
            with _opener.open(req, timeout=TIMEOUT) as r:
                payload = r.read()
                out = {
                    k: v for k, v in r.headers.items()
                    if k.lower() not in _DROP_RESPONSE_HEADERS
                }
                self._respond(r.status, payload, out)
        except urllib.error.HTTPError as e:
            # Upstream said no; pass its answer through verbatim (302s land here).
            payload = e.read()
            out = {
                k: v for k, v in (e.headers or {}).items()
                if k.lower() not in _DROP_RESPONSE_HEADERS
            }
            self._respond(e.code, payload, out)
        except Exception as e:
            print(f"[track-proxy] upstream error: {e!r}", flush=True)
            self._respond(502, b"upstream unavailable",
                          {"Content-Type": "text/plain"})

    def _respond(self, status, payload, headers):
        self.send_response(status)
        for k, v in headers.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)

    def do_GET(self):
        self._forward()

    def do_HEAD(self):
        self._forward()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        self._forward(self.rfile.read(length) if length else None)


def run_proxy():
    """Serve forever. Returns immediately (no listener) when switched off."""
    if not enabled():
        print("[track-proxy] disabled (set TRACK_PROXY_ENABLED=1 to serve)",
              flush=True)
        return
    print(f"[track-proxy] listening on :{PORT} -> {UPSTREAM}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), TrackProxyHandler).serve_forever()


if __name__ == "__main__":
    os.environ.setdefault("TRACK_PROXY_ENABLED", "1")
    try:
        run_proxy()
    except KeyboardInterrupt:
        sys.exit(0)
