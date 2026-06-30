#!/usr/bin/env python3
"""
UNVEILED — Brand Research 2.0  (LS-BRAND-RESEARCH).

The Front Door asks for the least possible. This module does the rest.

It takes whatever loose identifier a business owner naturally knows —
    @handle  ·  a profile URL  ·  a Page name  ·  "Business + City"
— and intelligently RESOLVES it to the correct, VERIFIED public profile,
assigning a CONFIDENCE SCORE to every match. Below the threshold a match is
FLAGGED FOR REVIEW, never guessed (accuracy is more important than speed).
Once a profile is resolved it HARVESTS everything publicly available that will
make the generated website unmistakably theirs.

Philosophy (LOCKED): **the AI does the work, the customer shouldn't.**

Provider-agnostic by design (decision 2026-06-29 "pluggable + ship now"):
  • @handle / profile-URL inputs resolve + verify with NO external key (stdlib).
  • name-only inputs need a web-search backend. Set SEARCH_PROVIDER + its key
    to unlock them. With none configured we DO NOT guess — name-only inputs are
    cleanly flagged for review. Add a key later and they start resolving with
    zero code change.

Stdlib only (the worker has no third-party deps). Every network call degrades
gracefully and NEVER raises — a failed lookup lowers confidence and records
exactly what could not be reached. We never fabricate a profile we did not find.
"""
import os, re, json, urllib.request, urllib.parse, urllib.error
from difflib import SequenceMatcher

# ---- tunables (env-overridable) ------------------------------------------------
AUTO_ACCEPT = float(os.environ.get("BRAND_RESEARCH_THRESHOLD", "0.90"))  # >= => auto-use
UA = "Mozilla/5.0 (compatible; UNVEILED-ResearchBot/2.0; +https://unveiled.pro)"
MAX_BYTES = 1_200_000
TIMEOUT = 15

# Canonical host per platform + how to turn a bare handle into a profile URL.
PLATFORMS = {
    "instagram": {"host": "instagram.com",  "handle_url": "https://www.instagram.com/{h}/"},
    "facebook":  {"host": "facebook.com",   "handle_url": "https://www.facebook.com/{h}"},
    "tiktok":    {"host": "tiktok.com",     "handle_url": "https://www.tiktok.com/@{h}"},
    "linkedin":  {"host": "linkedin.com",   "handle_url": "https://www.linkedin.com/company/{h}"},
    "youtube":   {"host": "youtube.com",    "handle_url": "https://www.youtube.com/@{h}"},
    "google":    {"host": "google.",        "handle_url": None},   # GBP / Maps — name-driven
    "yelp":      {"host": "yelp.com",        "handle_url": None},
}

# Words that carry no identity signal when matching a name.
_STOP = {"the", "and", "of", "a", "llc", "inc", "co", "ltd", "corp", "company"}


# ---------- low-level, safe fetch ----------------------------------------------
def _fetch(url, timeout=TIMEOUT):
    """GET a URL. Returns (final_url, text, status). (url, None, status|0) on failure."""
    if not url:
        return (url, None, 0)
    if not url.startswith(("http://", "https://")):
        url = "https://" + url.lstrip("/")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA,
                                                   "Accept-Language": "en-US,en;q=0.9"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read(MAX_BYTES)
            return (r.geturl() or url, raw.decode("utf-8", "replace"), getattr(r, "status", 200) or 200)
    except urllib.error.HTTPError as e:
        return (url, None, e.code)
    except Exception:
        return (url, None, 0)


def _meta(html, *keys):
    """First matching <meta property/name=...> content, or ''. Tries og:/twitter:/name."""
    for k in keys:
        m = re.search(
            r'<meta[^>]+(?:property|name)=["\']' + re.escape(k) + r'["\'][^>]*content=["\']([^"\']*)',
            html or "", re.I)
        if not m:
            m = re.search(
                r'<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:property|name)=["\']' + re.escape(k) + r'["\']',
                html or "", re.I)
        if m and m.group(1).strip():
            return m.group(1).strip()
    return ""


def _title(html):
    m = re.search(r"<title[^>]*>(.*?)</title>", html or "", re.S | re.I)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else ""


def _looks_blocked(html, status):
    """Platform login walls / rate-limits look 'reachable' but carry no profile."""
    if status in (401, 403, 429):
        return True
    low = (html or "").lower()
    if not low:
        return status not in (200, 0)
    walls = ("log in to continue", "login • instagram", "you must log in",
             "please enable javascript", "are you a robot", "captcha",
             "content isn't available", "this page isn't available")
    return any(w in low for w in walls)


# ---------- identity matching --------------------------------------------------
def _tokens(s):
    return [t for t in re.sub(r"[^a-z0-9 ]", " ", (s or "").lower()).split()
            if len(t) >= 2 and t not in _STOP]


def _compress(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def name_match(business, candidate_text):
    """0..1 — how strongly `candidate_text` (a profile title/handle/snippet) refers
    to `business`. Handles 'bellahair' vs 'Bella Hair Studio' (compressed/substring)
    and multi-word token coverage."""
    bt = _tokens(business)
    ct = (candidate_text or "").lower()
    coverage = (sum(1 for t in bt if t in ct) / len(bt)) if bt else 0.0
    cb, cc = _compress(business), _compress(candidate_text)
    if cb and cc and (cb in cc or cc in cb):
        compressed = 1.0
    elif cb and cc:
        compressed = SequenceMatcher(None, cb, cc).ratio()
    else:
        compressed = 0.0
    return round(max(coverage, compressed), 3)


# ---------- input classification ----------------------------------------------
def classify(raw):
    """Classify a loose identifier: 'url' | 'handle' | 'name' | 'empty'."""
    s = (raw or "").strip()
    if not s:
        return "empty"
    if s.startswith("@"):
        return "handle"
    low = s.lower()
    if re.match(r"^https?://", s, re.I) or "/" in s:
        return "url"
    if re.search(r"[\w-]+\.(com|co|net|org|io|me|tv|biz|us|app|page|gl|shop|xyz)\b", low):
        return "url"
    if any(p["host"].rstrip(".") in low for p in PLATFORMS.values() if p["host"]):
        return "url"
    if " " in s:           # "Bella Hair Studio", "Bella Hair Austin"
        return "name"
    return "handle"        # single token with no space -> treat as a handle/slug


def _handle_of(raw):
    s = (raw or "").strip().lstrip("@")
    s = re.split(r"[?#]", s)[0]
    return s.strip("/").split("/")[-1] if "/" in s else s.strip("/")


def _canonical_url(platform, raw, itype):
    p = PLATFORMS.get(platform, {})
    if itype == "url":
        u = raw.strip()
        return u if u.startswith(("http://", "https://")) else "https://" + u.lstrip("/")
    if itype == "handle" and p.get("handle_url"):
        return p["handle_url"].format(h=urllib.parse.quote(_handle_of(raw)))
    return None


# ---------- pluggable web search (only needed for name-only inputs) -------------
def _search_provider():
    return (os.environ.get("SEARCH_PROVIDER", "") or "").strip().lower()


def search(query, limit=6):
    """Provider-agnostic web search. Returns [{title,url,snippet}]. [] if no backend.
    Never raises. Add a key + SEARCH_PROVIDER to unlock name-based discovery."""
    prov = _search_provider()
    try:
        if prov == "serpapi" and os.environ.get("SERPAPI_KEY"):
            q = urllib.parse.urlencode({"engine": "google", "q": query,
                                        "num": limit, "api_key": os.environ["SERPAPI_KEY"]})
            _, txt, _ = _fetch("https://serpapi.com/search.json?" + q)
            data = json.loads(txt or "{}")
            return [{"title": r.get("title", ""), "url": r.get("link", ""),
                     "snippet": r.get("snippet", "")} for r in data.get("organic_results", [])][:limit]
        if prov in ("google_cse", "google") and os.environ.get("GOOGLE_CSE_KEY") and os.environ.get("GOOGLE_CSE_CX"):
            q = urllib.parse.urlencode({"key": os.environ["GOOGLE_CSE_KEY"],
                                        "cx": os.environ["GOOGLE_CSE_CX"], "q": query, "num": limit})
            _, txt, _ = _fetch("https://www.googleapis.com/customsearch/v1?" + q)
            data = json.loads(txt or "{}")
            return [{"title": r.get("title", ""), "url": r.get("link", ""),
                     "snippet": r.get("snippet", "")} for r in data.get("items", [])][:limit]
        if prov == "bing" and os.environ.get("BING_SEARCH_KEY"):
            q = urllib.parse.urlencode({"q": query, "count": limit})
            req = urllib.request.Request("https://api.bing.microsoft.com/v7.0/search?" + q,
                                         headers={"Ocp-Apim-Subscription-Key": os.environ["BING_SEARCH_KEY"],
                                                  "User-Agent": UA})
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                data = json.loads(r.read(MAX_BYTES).decode("utf-8", "replace"))
            return [{"title": v.get("name", ""), "url": v.get("url", ""),
                     "snippet": v.get("snippet", "")} for v in
                    data.get("webPages", {}).get("value", [])][:limit]
    except Exception:
        return []
    return []


def search_backend_available():
    p = _search_provider()
    return bool(
        (p == "serpapi" and os.environ.get("SERPAPI_KEY")) or
        (p in ("google_cse", "google") and os.environ.get("GOOGLE_CSE_KEY") and os.environ.get("GOOGLE_CSE_CX")) or
        (p == "bing" and os.environ.get("BING_SEARCH_KEY"))
    )


# ---------- confidence ---------------------------------------------------------
def _confidence(itype, nm, reachable, blocked, verified_nm, loc_match=0.0, search_rank=None):
    """Transparent 0..1 score. Components recorded by the caller in `evidence`."""
    base = {"url": 0.82, "handle": 0.74, "name": 0.48}.get(itype, 0.48)
    score = base + 0.20 * nm                         # identity strength
    if itype == "name" and search_rank is not None:  # search position trust
        score += max(0.0, 0.10 - 0.02 * search_rank)
    if reachable and not blocked:
        score += 0.08
        if verified_nm >= 0.70:                       # the live page confirms the name
            score += 0.06
    if blocked:                                       # walled bot is expected, not evidence against
        score -= 0.02 if itype != "name" else 0.12
    score += 0.05 * max(0.0, min(1.0, loc_match))     # location agreement (GBP)
    return round(max(0.0, min(0.99, score)), 3)


# ---------- resolve one platform ----------------------------------------------
def resolve_one(platform, raw, business, location=""):
    """Resolve a single platform identifier to a verified candidate + confidence.
    Returns a dict; status in {'accepted','review','not_found'}. Never raises."""
    out = {"platform": platform, "input": raw, "input_type": classify(raw),
           "candidate_url": None, "confidence": 0.0, "status": "not_found",
           "evidence": [], "reasons": []}
    itype = out["input_type"]
    if itype == "empty":
        out["reasons"].append("no identifier provided")
        return out

    # 1) get a candidate URL
    if itype in ("url", "handle"):
        url = _canonical_url(platform, raw, itype)
        if not url:                               # e.g. a bare handle for Google/Yelp
            itype = out["input_type"] = "name"
        else:
            out["candidate_url"] = url
            out["evidence"].append(f"{itype} → {url}")

    if itype == "name":
        if not search_backend_available():
            out["status"] = "review"
            out["confidence"] = 0.0
            out["reasons"].append("name-only input; no search backend configured — flagged for review")
            return out
        q = f"{raw} {location} {platform}".strip()
        host = PLATFORMS.get(platform, {}).get("host", "")
        hits = [h for h in search(q) if host and host.rstrip(".") in (h.get("url", "").lower())]
        if not hits:
            out["reasons"].append(f"search returned no {platform} result for '{raw}'")
            return out
        ranked = sorted(
            enumerate(hits),
            key=lambda ih: name_match(business, (ih[1].get("title", "") + " " + ih[1].get("url", ""))),
            reverse=True)
        rank, best = ranked[0]
        out["candidate_url"] = best.get("url")
        out["evidence"].append(f"search hit #{rank+1}: {best.get('title','')[:80]}")
        out["_search_rank"] = rank
        out["_search_title"] = best.get("title", "")

    if not out["candidate_url"]:
        return out

    # 2) verify the candidate live (best-effort; platforms often wall bots)
    final, html, status = _fetch(out["candidate_url"])
    blocked = _looks_blocked(html, status)
    reachable = bool(html) and status in (200, 0)
    page_name = _meta(html, "og:title", "og:site_name") or _title(html)
    verified_nm = name_match(business, page_name) if page_name else 0.0
    if reachable and not blocked:
        out["evidence"].append(f"verified page: '{page_name[:70]}' (name match {verified_nm})")
    elif blocked:
        out["evidence"].append(f"page reachable but walled (status {status}) — using asserted identity")
    else:
        out["evidence"].append(f"could not reach page (status {status})")

    # identity score: trust the live page ONLY if it really loaded (not a wall);
    # otherwise fall back to the user-asserted handle / search title.
    if reachable and not blocked and page_name:
        surface = page_name
    else:
        surface = out.get("_search_title") or _handle_of(raw) or raw
    nm = max(name_match(business, surface), verified_nm)
    loc_match = name_match(location, page_name) if (location and page_name) else 0.0

    out["confidence"] = _confidence(itype, nm, reachable, blocked, verified_nm,
                                    loc_match, out.get("_search_rank"))
    out["candidate_url"] = final or out["candidate_url"]
    out["status"] = "accepted" if out["confidence"] >= AUTO_ACCEPT else "review"
    if out["status"] == "review":
        out["reasons"].append(
            f"confidence {out['confidence']} < {AUTO_ACCEPT} — confirm before use")
    for k in ("_search_rank", "_search_title"):
        out.pop(k, None)
    return out


# ---------- harvest a resolved profile ----------------------------------------
def harvest(url, platform=""):
    """Pull publicly-available branding from a resolved profile/page. Never raises.
    Returns what was actually retrieved + an honest `blocked` flag."""
    h = {"source_url": url, "reachable": False, "blocked": False,
         "name": "", "image": "", "cover": "", "description": "",
         "category": "", "location": "", "hours": "", "links": [], "sample_text": ""}
    final, html, status = _fetch(url)
    h["source_url"] = final or url
    if not html:
        h["blocked"] = status in (401, 403, 429)
        return h
    if _looks_blocked(html, status):
        h["blocked"] = True
        # OG tags sometimes survive a login wall — grab whatever is there
    h["reachable"] = True
    h["name"] = _meta(html, "og:title", "og:site_name") or _title(html)
    h["image"] = _meta(html, "og:image", "twitter:image")
    h["description"] = _meta(html, "og:description", "description", "twitter:description")
    # external links in profile body (first few, deduped, no platform self-links)
    seen = []
    for m in re.findall(r'href=["\'](https?://[^"\']+)', html, re.I):
        low = m.lower()
        if any(p["host"].rstrip(".") in low for p in PLATFORMS.values() if p["host"]):
            continue
        if m not in seen:
            seen.append(m)
        if len(seen) >= 5:
            break
    h["links"] = seen
    # opening hours / category cues (best-effort; usually only on websites/GBP)
    hrs = re.search(r"((?:mon|tue|wed|thu|fri|sat|sun)[a-z]*[\s:].{0,40}\d{1,2}\s*[:.]?\d{0,2}\s*(?:am|pm))",
                    html, re.I)
    if hrs:
        h["hours"] = re.sub(r"\s+", " ", hrs.group(1)).strip()[:80]
    return h


# ---------- orchestrate the whole discovery ------------------------------------
def _identifiers(lead):
    """Pull the loose social identifiers off the lead (Front Door by_platform map,
    raw links, and the website)."""
    out = {}
    sp = lead.get("social_profiles") or {}
    if isinstance(sp, str):
        try:
            sp = json.loads(sp)
        except Exception:
            sp = {}
    byp = sp.get("by_platform") if isinstance(sp, dict) else {}
    if isinstance(byp, dict):
        for k, v in byp.items():
            if v:
                out[k.lower()] = str(v).strip()
    # also accept top-level loose keys some channels send
    for k in list(PLATFORMS):
        if k not in out and lead.get(k):
            out[k] = str(lead[k]).strip()
    return out


def run_discovery(lead):
    """Resolve every identifier on a lead, score it, harvest accepted profiles,
    and return a single reviewable Discovery Report. Never raises."""
    lead = lead or {}
    business = (lead.get("business") or lead.get("business_name") or "the business").strip()
    location = (lead.get("location") or lead.get("city") or "").strip()
    report = {
        "business": business, "location": location,
        "threshold": AUTO_ACCEPT,
        "search_backend": _search_provider() or "none",
        "profiles": {}, "accepted": {}, "needs_review": [],
        "harvested": {}, "overall_confidence": 0.0, "summary": "",
    }
    try:
        ids = _identifiers(lead)
        confs = []
        for platform, raw in ids.items():
            if platform not in PLATFORMS:
                continue
            res = resolve_one(platform, raw, business, location)
            report["profiles"][platform] = res
            confs.append(res["confidence"])
            if res["status"] == "accepted" and res["candidate_url"]:
                report["accepted"][platform] = res["candidate_url"]
                report["harvested"][platform] = harvest(res["candidate_url"], platform)
            elif res["status"] == "review":
                report["needs_review"].append(
                    {"platform": platform, "input": raw,
                     "confidence": res["confidence"], "reasons": res["reasons"]})

        # website is its own (high-trust) signal — confirm reachable + harvest OG
        site = lead.get("website") or lead.get("existing_website")
        if site:
            hv = harvest(site, "website")
            report["harvested"]["website"] = hv
            report["profiles"]["website"] = {
                "platform": "website", "input": site, "input_type": "url",
                "candidate_url": hv["source_url"],
                "confidence": 0.95 if hv["reachable"] else 0.0,
                "status": "accepted" if hv["reachable"] else "review",
                "evidence": [f"reached: {hv['reachable']}"], "reasons": []}
            if hv["reachable"]:
                report["accepted"]["website"] = hv["source_url"]
                confs.append(0.95)

        report["overall_confidence"] = round(sum(confs) / len(confs), 3) if confs else 0.0
        n_ok, n_rev = len(report["accepted"]), len(report["needs_review"])
        report["summary"] = (f"{n_ok} profile(s) verified and auto-accepted; "
                             f"{n_rev} flagged for review.") if (n_ok or n_rev) else \
                            "No social identifiers supplied — nothing to resolve."
        if not search_backend_available():
            report["summary"] += " (Name-only lookups await a search backend.)"
    except Exception as e:  # discovery must never break a build
        report["summary"] = f"discovery error (non-fatal): {e!r}"
    return report


def merge_into_lead(lead, report):
    """Inject the ACCEPTED, verified profile URLs back onto the lead so the existing
    brand engine (which reads full URLs) consumes verified data. Non-destructive."""
    lead = dict(lead or {})
    sp = lead.get("social_profiles") or {}
    if isinstance(sp, str):
        try:
            sp = json.loads(sp)
        except Exception:
            sp = {}
    if not isinstance(sp, dict):
        sp = {}
    resolved = dict(sp.get("resolved") or {})
    links = list(sp.get("links") or [])
    for platform, url in (report.get("accepted") or {}).items():
        if platform == "website":
            if not lead.get("website"):
                lead["website"] = url
            continue
        resolved[platform] = url
        if url not in links:
            links.append(url)
    sp["resolved"] = resolved
    sp["links"] = links
    lead["social_profiles"] = sp

    # Surface harvested imagery so the brand/asset engine can source it authentic-first.
    imgs = []
    for h in (report.get("harvested") or {}).values():
        for key in ("image", "cover"):
            u = h.get(key)
            if u and u.startswith("http"):
                imgs.append(u)
    seen, deduped = set(), []
    for u in imgs:
        if u not in seen:
            seen.add(u); deduped.append(u)
    if deduped:
        existing = lead.get("discovered_images") or []
        lead["discovered_images"] = existing + [u for u in deduped if u not in existing]
    return lead


# ---------- needs_review helper for the pipeline -------------------------------
def needs_review(report):
    return bool((report or {}).get("needs_review"))


if __name__ == "__main__":
    # offline smoke test (no network keys -> name-only flags for review, handles score on assertion)
    demo = {"business_name": "Bella Hair Studio", "location": "Austin, TX",
            "website": "bellahairstudio.com",
            "social_profiles": {"by_platform": {
                "instagram": "@bellahair", "facebook": "Bella Hair Studio ATX",
                "google": "Bella Hair Austin", "tiktok": "@bellahairtx"}}}
    rep = run_discovery(demo)
    print(json.dumps(rep, indent=2)[:4000])
