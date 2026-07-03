#!/usr/bin/env python3
"""
UNVEILED — Business Discovery Service (Book 03 service; vendor-agnostic).

CONTRACT (stable): discover(spec) -> validated intelligence records ready to
upsert into the Customer Intelligence Layer (business_intelligence). The company
depends on the SERVICE, never on a source. Implementations plug in underneath and
are tried in priority order; the service is never blocked because one vendor is
down: "which approved discovery implementations are currently available?" -> use
the best available -> fall back -> if none, report NO IMPLEMENTATION (never fake).

spec  = {"industry": str, "city": str, "count": int}
record= one business_intelligence row (stage='discovered'), normalized + deduped.

Implementations (adapters):
  google_maps / yelp / linkedin / directory  -> online; require a connector or the
      Chrome MCP (browser). Marked UNAVAILABLE until wired (available()==False).
  api        -> a future business-data API; available() when DISCOVERY_API_KEY set.
  csv        -> functional now; reads DISCOVERY_CSV (or --csv). Fallback source.

Stdlib only. Runs in the worker or standalone.
Usage:
  python3 discovery_service.py --status
  python3 discovery_service.py --spec '{"industry":"plumber","city":"Dallas","count":25}' [--csv path]
"""
import csv as csvmod, os, re, json, sys


# ---------- normalization into a CIL record ----------
def domain_of(s):
    if not s:
        return None
    s = s.strip().lower()
    s = re.sub(r"^https?://", "", s)
    s = re.sub(r"^www\.", "", s)
    return s.split("/")[0] or None

def to_record(raw, source, spec):
    """Map any adapter's raw dict into the business_intelligence contract shape."""
    website = raw.get("website") or raw.get("website_url") or ""
    dom = domain_of(website) or domain_of(raw.get("domain") or "")
    contact = {k: raw.get(k) for k in ("name", "email", "phone") if raw.get(k)}
    return {
        "domain": dom,
        "business_name": raw.get("business_name") or raw.get("name"),
        "industry": raw.get("industry") or spec.get("industry"),
        "city": raw.get("city") or spec.get("city"),
        "region": raw.get("region"),
        "website_url": website or None,
        "socials": raw.get("socials") or {},
        "stage": "discovered",
        "contact": contact,
        "contact_verified": False,
        "channel": "outbound",
        "campaign": spec.get("campaign", "discovery"),
        "research": {"source": source},
    }

def dedupe(records):
    seen, out = set(), []
    for r in records:
        key = r.get("domain") or (r.get("business_name"), r.get("city"))
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


# ---------- adapter base + implementations ----------
class DiscoveryAdapter:
    name = "base"; priority = 100
    def available(self): return False
    def discover(self, spec): raise NotImplementedError

class _OnlineStub(DiscoveryAdapter):
    """Online sources: require a connector or the Chrome MCP to be wired in the
    execution context. Until then they honestly report unavailable (never fake)."""
    requires = "connector/Chrome MCP"
    def available(self): return False
    def discover(self, spec):
        raise NotImplementedError(f"{self.name}: requires {self.requires} — implementation pending")

class GoogleMapsAdapter(_OnlineStub): name = "google_maps"; priority = 10
class YelpAdapter(_OnlineStub):       name = "yelp";        priority = 20
class LinkedInAdapter(_OnlineStub):   name = "linkedin";    priority = 30
class DirectoryAdapter(_OnlineStub):  name = "directory";   priority = 40; requires = "a directory connector"

class ApiAdapter(DiscoveryAdapter):
    name = "api"; priority = 45
    def available(self): return bool(os.environ.get("DISCOVERY_API_KEY"))
    def discover(self, spec):
        raise NotImplementedError("api: adapter shell present; wire the provider call when DISCOVERY_API_KEY is set")

class CsvAdapter(DiscoveryAdapter):
    """FUNCTIONAL. CSV columns (any subset): business_name, website, industry, city, email, phone, name."""
    name = "csv"; priority = 50
    def __init__(self, path=None):
        self.path = path or os.environ.get("DISCOVERY_CSV")
    def available(self):
        return bool(self.path and os.path.exists(self.path))
    def discover(self, spec):
        rows = []
        want = (spec.get("industry") or "").strip().lower()
        with open(self.path, newline="", encoding="utf-8") as f:
            for raw in csvmod.DictReader(f):
                raw = {(k or "").strip().lower(): (v or "").strip() for k, v in raw.items()}
                if not (raw.get("business_name") or raw.get("name") or raw.get("website")):
                    continue
                # Honor the requested industry filter; a blank/absent industry means "all".
                if want and (raw.get("industry") or "").strip().lower() != want:
                    continue
                rows.append(to_record(raw, "csv", spec))
                if spec.get("count") and len(rows) >= spec["count"]:
                    break
        return rows


def build_registry(csv_path=None):
    return sorted(
        [GoogleMapsAdapter(), YelpAdapter(), LinkedInAdapter(), DirectoryAdapter(),
         ApiAdapter(), CsvAdapter(csv_path)],
        key=lambda a: a.priority)


def available_adapters(csv_path=None):
    return [a for a in build_registry(csv_path) if a.available()]


def discover(spec, csv_path=None):
    """Try approved implementations in priority order; first available wins.
    Never blocked by one vendor; never fabricates."""
    for a in build_registry(csv_path):
        if a.available():
            recs = dedupe(a.discover(spec))
            return {"adapter": a.name, "count": len(recs), "records": recs}
    return {"adapter": None, "count": 0, "records": [],
            "note": "NO DISCOVERY IMPLEMENTATION AVAILABLE — connect a source (Maps/Yelp/LinkedIn/directory/API) or provide a CSV. Do NOT fabricate businesses."}


def main():
    args = sys.argv[1:]
    csv_path = None
    if "--csv" in args:
        csv_path = args[args.index("--csv") + 1]
    if "--status" in args or not args:
        print("Business Discovery Service — adapter availability (priority order):")
        for a in build_registry(csv_path):
            print(f"  [{'AVAILABLE' if a.available() else 'unavailable':<10}] {a.name:<12} (priority {a.priority})")
        avail = available_adapters(csv_path)
        print(f"\n-> {len(avail)} available. Active source: {avail[0].name if avail else 'NONE (provide CSV or connect a source)'}")
        return
    if "--spec" in args:
        spec = json.loads(args[args.index("--spec") + 1])
        res = discover(spec, csv_path)
        print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
