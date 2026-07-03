#!/usr/bin/env python3
"""
UNVEILED — Website Weakness Analyzer (upstream capability).

Given a business URL, fetch the page (on the worker's network) and score its
weaknesses. Bigger weakness = bigger opportunity for UNVEILED. Writes
website_quality (0..100), website_weakness_score, weaknesses[], digital_maturity
onto the business_intelligence record.

fetch() uses urllib (works on the worker; the sandbox has no egress — analyze()
is testable there on HTML strings). analyze() is pure + deterministic.
Stdlib only.
"""
import re, sys, json, urllib.request
try:
    import industry_config
except ImportError:
    industry_config = None

PHONE = re.compile(r"(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}")

CHECKS = [
    ("not mobile-optimized",       lambda h, u, t: 'name="viewport"' not in h),
    ("no HTTPS",                   lambda h, u, t: bool(u) and not u.lower().startswith("https")),
    ("no click-to-call / phone",  lambda h, u, t: 'tel:' not in h and not PHONE.search(t)),
    ("no structured data (SEO)",  lambda h, u, t: 'application/ld+json' not in h),
    ("no social share metadata",  lambda h, u, t: 'og:title' not in h and 'twitter:card' not in h),
    ("thin content",              lambda h, u, t: len(t) < 900),
    ("no clear call-to-action",   lambda h, u, t: not re.search(r"book|call|quote|contact|schedule|get started", t, re.I)),
    ("weak trust signals",        lambda h, u, t: not re.search(r"licensed|insured|reviews?|testimonial|years", t, re.I)),
]

def _text(html):
    t = re.sub(r"<script.*?</script>", " ", html, flags=re.S | re.I)
    t = re.sub(r"<style.*?</style>", " ", t, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t).strip()

def analyze(html, url="", industry=None):
    if not html:
        return {"website_url": url or None, "website_quality": 0,
                "website_weakness_score": 100, "digital_maturity": "none",
                "weaknesses": ["no website / unreachable"]}
    h = html.lower()
    t = _text(html)
    tl = t.lower()
    found = [name for name, test in CHECKS if test(h, url, t)]
    n = len(CHECKS)
    # industry-specific must-haves (the per-industry website analysis profile)
    if industry and industry_config:
        musts = industry_config.get(industry).get("site_must_have", [])
        n += len(musts)
        for kw in musts:
            if kw.lower() not in tl:
                found.append(f"missing (industry): {kw}")
    quality = max(0, round(100 * (n - len(found)) / n))
    maturity = ("advanced" if quality >= 80 else "decent" if quality >= 55
                else "basic" if quality >= 30 else "none")
    return {"website_url": url or None, "website_quality": quality,
            "website_weakness_score": 100 - quality,   # higher = bigger opportunity
            "digital_maturity": maturity, "weaknesses": found}

def fetch(url, timeout=20):
    """Runs on the worker (real network). Returns HTML or ''. Never raises."""
    if url and not url.startswith("http"):
        url = "https://" + url
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "UNVEILED-analyzer/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read(500000).decode("utf-8", "ignore")
    except Exception:
        return ""

def analyze_url(url):
    return analyze(fetch(url), url)

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        weak = "<html><body><h1>Joe Plumbing</h1><p>We fix pipes.</p></body></html>"
        strong = ('<html><head><meta name="viewport" content="w"><meta property="og:title" content="x">'
                  '<script type="application/ld+json">{}</script></head><body>'
                  '<a href="tel:5551234567">Call (555) 123-4567</a> Book online. Licensed &amp; insured, 20 years, '
                  + "great reviews. " * 80 + '</body></html>')
        print("WEAK :", json.dumps(analyze(weak, "http://joeplumbing.com")))
        print("STRONG:", json.dumps(analyze(strong, "https://good.com")))
    elif len(sys.argv) > 1:
        print(json.dumps(analyze_url(sys.argv[1]), indent=2))
