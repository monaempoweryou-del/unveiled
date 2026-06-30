#!/usr/bin/env python3
"""
UNVEILED — Brand Profile engine (LS-BRAND-PRESERVE + LS-ASSET-STRUCTURE).

The production worker must LEARN a business's existing brand before it
designs anything. UNVEILED elevates brands, it does not replace them.

This module turns whatever we know about a lead (existing website, social
profiles, Google Business Profile, lead fields) into a structured
**Brand Profile** plus a **10-slot asset set** sourced authentic-first.

Order the engine always follows (mirrors CLAUDE.md / Book 04):
  1. Learn the business
  2. Learn the existing brand
  3. Decide what deserves to be preserved
  4. Improve what is weak
  5. Build something that still feels unmistakably like THAT company

Stdlib only (the worker has no third-party deps on Railway). Every network
call degrades gracefully: a brand learn that fails NEVER crashes a build, it
just lowers confidence and records what could not be reached. We never
fabricate a brand element or an asset we could not actually retrieve.

Asset standard (LS-ASSET-STRUCTURE):
  - 10 slots total: 1 logo + 1 hero + up to 8 gallery
  - Launch minimum: logo + hero + 3 supporting = 5 REAL images
  - Sourcing ladder: real business assets > social media > Google Business >
    high-quality stock (last resort, the exception, never the default)
"""
import re, json, urllib.request, urllib.error
from urllib.parse import urljoin, urlparse

UA = "Mozilla/5.0 (compatible; UNVEILED-BrandBot/1.0; +https://unveiled.pro)"
MAX_BYTES = 1_500_000  # cap any fetched page

STOCK_HOSTS = ("images.unsplash.com", "unsplash.com", "images.pexels.com",
               "pexels.com", "pixabay.com", "istockphoto.com", "shutterstock.com")

# Lead keys that might carry an existing website / socials (be liberal).
WEBSITE_KEYS = ("website", "website_url", "site", "url", "existing_website",
                "domain", "homepage", "web")
SOCIAL_PATTERNS = {
    "facebook":  r"https?://(?:[\w.-]*\.)?facebook\.com/[^\s\"'<>)]+",
    "instagram": r"https?://(?:[\w.-]*\.)?instagram\.com/[^\s\"'<>)]+",
    "linkedin":  r"https?://(?:[\w.-]*\.)?linkedin\.com/[^\s\"'<>)]+",
    "yelp":      r"https?://(?:[\w.-]*\.)?yelp\.com/[^\s\"'<>)]+",
    "tiktok":    r"https?://(?:[\w.-]*\.)?tiktok\.com/[^\s\"'<>)]+",
    "google":    r"https?://(?:maps\.app\.goo\.gl|g\.page|www\.google\.com/maps)/[^\s\"'<>)]+",
}


# ---------- low-level fetch (safe, stdlib) ----------
def _fetch(url, timeout=20):
    """GET a URL. Returns (final_url, text) or (url, None) on any failure."""
    if not url:
        return (url, None)
    if not url.startswith(("http://", "https://")):
        url = "https://" + url.lstrip("/")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read(MAX_BYTES)
            final = r.geturl() or url
        return (final, raw.decode("utf-8", "replace"))
    except Exception:
        return (url, None)


def _is_stock(u):
    return any(h in (u or "").lower() for h in STOCK_HOSTS)


def _clean_text(html):
    t = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", html or "", flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", t).strip()


# ---------- extraction primitives ----------
def extract_palette(html):
    """Most-used brand colors, ignoring near-black/near-white/grey scaffolding."""
    hexes = re.findall(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b", html or "")
    counts = {}
    for h in hexes:
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        h = h.lower()
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        # skip greyscale (low saturation) and the obvious black/white extremes
        mx, mn = max(r, g, b), min(r, g, b)
        if mx - mn < 18 and (mx < 30 or mx > 235):
            continue
        counts["#" + h] = counts.get("#" + h, 0) + 1
    ranked = sorted(counts, key=counts.get, reverse=True)
    return ranked[:6]


def extract_fonts(html):
    fonts = []
    # Google Fonts links
    for fam in re.findall(r"fonts\.googleapis\.com/css2?\?family=([^\"'&]+)", html or ""):
        fonts.append(fam.replace("+", " ").split(":")[0])
    # font-family declarations
    for fam in re.findall(r"font-family\s*:\s*([^;}{\"']+)", html or "", re.I):
        first = fam.split(",")[0].strip().strip("'\"")
        if first and first.lower() not in (
            "inherit", "initial", "sans-serif", "serif", "monospace"):
            fonts.append(first)
    # dedupe, keep order
    seen, out = set(), []
    for f in fonts:
        k = f.lower()
        if k not in seen:
            seen.add(k); out.append(f)
    return out[:4]


def extract_logo(html, base):
    """Best-guess existing logo URL (real asset). None if not confidently found."""
    # 1) an <img> that looks like a logo
    for m in re.finditer(r"<img\b[^>]*>", html or "", re.I):
        tag = m.group(0)
        if re.search(r'(class|id|alt|src)\s*=\s*["\'][^"\']*logo', tag, re.I):
            src = re.search(r'src\s*=\s*["\']([^"\']+)', tag, re.I)
            if src:
                return urljoin(base, src.group(1))
    # 2) explicit logo schema / link
    m = re.search(r'<link[^>]+rel=["\'](?:apple-touch-icon|icon)["\'][^>]*href=["\']([^"\']+)', html or "", re.I)
    if m:
        href = m.group(1)
        if not href.lower().endswith(".ico"):
            return urljoin(base, href)
    return None


def extract_images(html, base, limit=24):
    """Real photographic images from the page, absolute https, stock excluded."""
    urls, seen = [], set()
    cands = re.findall(r'<img\b[^>]*\bsrc\s*=\s*["\']([^"\']+)', html or "", re.I)
    # og:image is usually the strongest hero candidate -> front of the list
    og = re.search(r'property=["\']og:image["\'][^>]*content=["\']([^"\']+)', html or "", re.I)
    if og:
        cands.insert(0, og.group(1))
    for src in cands:
        u = urljoin(base, src)
        if not u.startswith("http"):
            continue
        low = u.lower()
        if low.startswith("data:") or low.endswith((".svg", ".ico", ".gif")):
            continue
        if any(k in low for k in ("sprite", "icon", "favicon", "pixel", "spacer", "blank")):
            continue
        if _is_stock(u):
            continue  # we want the owner's real images here
        if u in seen:
            continue
        seen.add(u); urls.append(u)
        if len(urls) >= limit:
            break
    return urls


def extract_social(html, lead):
    found = {}
    blob = (html or "") + " " + " ".join(
        str(lead.get(k, "")) for k in lead) if isinstance(lead, dict) else (html or "")
    for name, pat in SOCIAL_PATTERNS.items():
        m = re.search(pat, blob, re.I)
        if m:
            found[name] = m.group(0).rstrip(').,"\'')
    return found


def extract_voice(html):
    """Short real samples of the brand's own words -> the model infers tone."""
    samples = []
    t = re.search(r"<title[^>]*>(.*?)</title>", html or "", re.S | re.I)
    if t:
        samples.append(_clean_text(t.group(1))[:140])
    d = re.search(r'name=["\']description["\'][^>]*content=["\']([^"\']+)', html or "", re.I)
    if d:
        samples.append(d.group(1)[:200])
    for h in re.findall(r"<h[12][^>]*>(.*?)</h[12]>", html or "", re.S | re.I)[:4]:
        s = _clean_text(h)
        if 3 <= len(s) <= 120:
            samples.append(s)
    # dedupe
    seen, out = set(), []
    for s in samples:
        if s and s.lower() not in seen:
            seen.add(s.lower()); out.append(s)
    return out[:6]


# ---------- the brand profile ----------
def build_brand_profile(lead):
    """Step 1+2: learn the business, then learn the existing brand.

    Returns a structured dict. Never raises. `confidence` reflects how much
    real brand signal we actually retrieved (0.0 = nothing, we are improvising
    and the report must say so)."""
    lead = lead or {}
    name = lead.get("business") or lead.get("business_name") or "the business"

    site_url = None
    for k in WEBSITE_KEYS:
        v = lead.get(k)
        if v and isinstance(v, str) and "." in v:
            site_url = v.strip()
            break

    profile = {
        "business": name,
        "industry": lead.get("industry", ""),
        "location": lead.get("location", ""),
        "existing_website": site_url,
        "reached_website": False,
        "palette": [],
        "fonts": [],
        "logo_url": None,
        "voice_samples": [],
        "real_images": [],
        "social": {},
        "personality": "",
        "confidence": 0.0,
        "notes": [],
    }

    html = None
    if site_url:
        final, html = _fetch(site_url)
        if html:
            profile["reached_website"] = True
            profile["existing_website"] = final
            profile["palette"] = extract_palette(html)
            profile["fonts"] = extract_fonts(html)
            profile["logo_url"] = extract_logo(html, final)
            profile["voice_samples"] = extract_voice(html)
            profile["real_images"] = extract_images(html, final)
        else:
            profile["notes"].append(
                f"Existing website '{site_url}' could not be reached for brand learning.")
    else:
        profile["notes"].append(
            "No existing website on the lead — brand learned from socials/lead fields only.")

    profile["social"] = extract_social(html or "", lead)

    # Fold in any imagery harvested by Brand Research 2.0 (resolved social/profile
    # pages) — authentic-first, stock excluded. Makes the page use the owner's real
    # photos even when their website had few or none.
    discovered = lead.get("discovered_images") or []
    if discovered:
        merged = []
        for u in list(discovered) + list(profile["real_images"]):
            if u and not _is_stock(u) and u not in merged:
                merged.append(u)
        added = len(merged) - len(profile["real_images"])
        profile["real_images"] = merged
        if added > 0:
            profile["notes"].append(
                f"{added} image(s) discovered from verified social/profile harvest "
                f"added to the authentic asset pool.")

    # Customer-uploaded assets ALWAYS win (LS-ASSET-STRUCTURE). From the Front
    # Door's optional "Make it yours" step, stored at social_profiles.uploads:
    # an uploaded logo overrides any discovered logo; an uploaded hero is the
    # preferred hero; uploaded gallery images lead the authentic pool.
    sp = lead.get("social_profiles") or {}
    if isinstance(sp, str):
        try:
            sp = json.loads(sp)
        except Exception:
            sp = {}
    ups = (sp.get("uploads") if isinstance(sp, dict) else None) or {}
    up_logo, up_hero = ups.get("logo"), ups.get("hero")
    up_gallery = [u for u in (ups.get("gallery") or []) if u]
    if up_logo:
        profile["logo_url"] = up_logo
        profile["notes"].append("Customer-uploaded logo used (overrides discovery).")
    preferred = ([up_hero] if up_hero else []) + up_gallery
    if preferred:
        merged = []
        for u in preferred + list(profile["real_images"]):
            if u and u not in merged and not _is_stock(u):
                merged.append(u)
        profile["real_images"] = merged
        profile["notes"].append(
            f"{len(preferred)} customer-uploaded image(s) lead the asset pool"
            + (" (hero preferred)." if up_hero else "."))

    # personality cue from industry (a starting hypothesis, not a fact)
    profile["personality"] = (lead.get("personality")
                              or lead.get("about", "")[:160]
                              or f"a {profile['industry']} business in {profile['location']}".strip())

    # confidence: weighted by how much real signal we actually gathered
    score = 0.0
    score += 0.30 if profile["palette"] else 0.0
    score += 0.15 if profile["fonts"] else 0.0
    score += 0.20 if profile["logo_url"] else 0.0
    score += 0.25 if profile["real_images"] else 0.0
    score += 0.10 if profile["social"] else 0.0
    profile["confidence"] = round(score, 2)
    return profile


# ---------- the 10-slot asset set ----------
def assemble_assets(profile, industry=""):
    """Step 3+4: build the standard 10-slot asset set, authentic-first.

    Returns dict with: logo, hero, gallery[], real_count, stock_count,
    stock_slots[], real_assets_available (count we actually found), and a
    per-slot source label so the Brand Report can be fully honest."""
    real = list(profile.get("real_images") or [])
    logo = profile.get("logo_url")
    real_available = len(real) + (1 if logo else 0)

    slots = {"logo": None, "hero": None, "gallery": [],
             "real_count": 0, "stock_count": 0, "stock_slots": [],
             "real_assets_available": real_available, "sources": {}}

    # logo: real if we have one (never a stock photo as a logo)
    if logo:
        slots["logo"] = logo
        slots["sources"]["logo"] = "real:existing-site"
        slots["real_count"] += 1

    # hero + up to 8 gallery, real first
    pool = list(real)
    if pool:
        slots["hero"] = pool.pop(0)
        slots["sources"]["hero"] = "real:existing-site"
        slots["real_count"] += 1
    for i, u in enumerate(pool[:8]):
        slots["gallery"].append(u)
        slots["sources"][f"gallery_{i}"] = "real:existing-site"
        slots["real_count"] += 1

    # Minimum launch standard = 5 real images (logo+hero+3). If real assets
    # fall short, the ladder says: social > Google Business > stock (last
    # resort). We can record social/GBP profiles for enrichment but must not
    # invent images we did not fetch — so any gap to the minimum is filled
    # with clearly-flagged stock, and the Brand Report says exactly that.
    def _stock(kind):
        q = re.sub(r"[^a-z ]", "", (industry or "business").lower()).strip().replace(" ", ",")
        return f"https://images.unsplash.com/featured/1200x800/?{q or 'business'}"

    MIN = 5
    if slots["hero"] is None:
        slots["hero"] = _stock(industry)
        slots["sources"]["hero"] = "stock:last-resort"
        slots["stock_count"] += 1
        slots["stock_slots"].append("hero")
    # top up gallery toward the 3-supporting minimum
    need = max(0, 3 - len(slots["gallery"]))
    for j in range(need):
        slots["gallery"].append(_stock(industry))
        idx = len(slots["gallery"]) - 1
        slots["sources"][f"gallery_{idx}"] = "stock:last-resort"
        slots["stock_count"] += 1
        slots["stock_slots"].append(f"gallery_{idx}")

    slots["meets_minimum"] = (
        (1 if slots["logo"] else 0) + (1 if slots["hero"] else 0)
        + len(slots["gallery"])) >= MIN
    return slots


# ---------- prompt + report rendering ----------
def render_prompt_block(profile, assets):
    """The brand-aware instructions injected into the generation prompt."""
    p = profile
    lines = []
    lines.append("BRAND PROFILE. Design FROM this. Respect first, improve second, "
                 "replace only what is genuinely weak. The owner must say "
                 "'that\'s my business, my brand, at its best', never 'an UNVEILED template.'")
    if p["reached_website"]:
        lines.append(f"- Existing website (learned): {p['existing_website']}")
    if p["palette"]:
        lines.append(f"- Existing brand colors (PRESERVE unless genuinely weak): {', '.join(p['palette'])}")
    if p["fonts"]:
        lines.append(f"- Existing typography to echo: {', '.join(p['fonts'])}")
    if p["voice_samples"]:
        lines.append("- The brand's own words (match this tone, do not invent a new voice): "
                     + " | ".join(p["voice_samples"]))
    if p["personality"]:
        lines.append(f"- Personality / positioning: {p['personality']}")
    if p["social"]:
        lines.append("- Social presence: " + ", ".join(f"{k}: {v}" for k, v in p["social"].items()))
    if p["confidence"] < 0.34:
        lines.append("- LOW brand signal: little existing brand was retrievable. Make conservative, "
                     "tasteful executive choices appropriate to the industry, and DO NOT impose a "
                     "generic UNVEILED house style.")

    # concrete assets the page MUST use (real first). This is what kills
    # 'stock-by-default': we hand the model the real URLs to place.
    lines.append("\nUSE THESE EXACT IMAGE URLs (already sourced authentic-first; do not substitute stock):")
    if assets.get("logo"):
        lines.append(f"- LOGO: {assets['logo']}  (present the real logo cleanly in the header/footer)")
    if assets.get("hero"):
        tag = "REAL" if assets["sources"].get("hero", "").startswith("real") else "stock-fallback"
        lines.append(f"- HERO [{tag}]: {assets['hero']}")
    for i, g in enumerate(assets.get("gallery", [])):
        tag = "REAL" if assets["sources"].get(f"gallery_{i}", "").startswith("real") else "stock-fallback"
        lines.append(f"- GALLERY {i+1} [{tag}]: {g}")
    lines.append("Every <img> must have descriptive alt text. Use og:image/twitter:image = the HERO url above.")
    return "\n".join(lines)


def render_report(profile, assets, slug):
    """The internal Brand Report (preserved / improved / why) for the Company OS."""
    p = profile
    preserved, improved = [], []
    if p["palette"]:
        preserved.append(f"Brand color palette ({', '.join(p['palette'][:4])})")
    else:
        improved.append("No clear existing palette found. Selected an industry-appropriate, restrained palette.")
    if p["fonts"]:
        preserved.append(f"Typography direction ({', '.join(p['fonts'][:2])})")
    else:
        improved.append("No distinct typography found. Chose a clean, human typeface pairing.")
    if p["logo_url"]:
        preserved.append("Existing logo (presented cleanly, not replaced)")
    else:
        improved.append("No usable logo retrieved. Used a refined wordmark lockup, NOT an AI logo cliché.")
    if assets["real_count"] >= 1:
        preserved.append(f"{assets['real_count']} real business image(s) the owner will recognize")
    improved.append("Layout, hierarchy, mobile polish, metadata and CTA raised to the UNVEILED bar.")

    report = {
        "slug": slug,
        "business": p["business"],
        "brand_confidence": p["confidence"],
        "reached_existing_website": p["reached_website"],
        "existing_website": p["existing_website"],
        "discovered": {
            "palette": p["palette"], "fonts": p["fonts"],
            "logo_found": bool(p["logo_url"]), "voice_samples": p["voice_samples"],
            "social": p["social"],
        },
        "assets": {
            "logo": assets.get("logo"), "hero": assets.get("hero"),
            "gallery_count": len(assets.get("gallery", [])),
            "real_count": assets["real_count"], "stock_count": assets["stock_count"],
            "stock_slots": assets["stock_slots"],
            "real_assets_available": assets["real_assets_available"],
            "meets_minimum_5": assets["meets_minimum"],
        },
        "preserved": preserved,
        "improved": improved,
        "notes": p["notes"],
        "decision_order": ["learn business", "learn brand", "decide preserve",
                           "improve weak", "build still-feels-like-them"],
    }
    return report


if __name__ == "__main__":
    # tiny self-test with a fabricated lead (no network) to prove it never crashes
    demo = {"business": "Acme Tile & Stone", "industry": "tile contractor",
            "location": "San Diego, CA", "about": "Family-run since 1998."}
    prof = build_brand_profile(demo)
    assets = assemble_assets(prof, prof["industry"])
    print(json.dumps(render_report(prof, assets, "acme-tile-stone"), indent=2))
    print("\n--- PROMPT BLOCK ---\n")
    print(render_prompt_block(prof, assets))
