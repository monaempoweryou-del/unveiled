# Phase 3 Assets — Law Offices of Shani Gabay

**Lead ID:** 119a1cff-8ca2-4a09-89b8-892b0375c390
**Business:** Law Offices of Shani Gabay
**Phase:** Assets
**Date:** 2026-06-15

> The prospect provided **no logo and no photos** (`logos: []`, `photos: []`). There is **no AI photo-generation tool available** in this environment. All assets below were therefore **designed and rendered in-house** as crisp vector-quality graphics (Pillow, supersampled) in the exact palette and feel decided in Phase 2 — a custom wordmark logo, favicon, monogram, a premium navy hero, section background bands, a portrait placeholder panel, a stylized service-area map, and a 5-icon practice-area set. **Photographic assets that must be collected from the client are itemized in "Missing / Needs Attention" — most critically a professional attorney headshot.**

---

## Available Assets

All files live in `website/assets/`. Generator scripts are preserved in `website/assets/_generators/` for reproducibility (not shipped).

### Brand / Identity
- **Logo (primary):** `website/assets/logo.png` — *generated.* Didot serif wordmark "Shani Gabay" + gold rule with diamond + letter-spaced "LAW OFFICES". Navy `#0F2742` text on **transparent** — for light backgrounds. 934×365, transparent PNG.
- **Logo (reversed):** `website/assets/logo-white.png` — *generated.* Same lockup in warm-white `#FAF9F7` + gold, on transparent — **for the navy header/hero/footer**. 934×365.
- **Favicon:** `website/assets/favicon.png` — *generated.* "SG" monogram in gold on a navy rounded tile with a thin gold inner frame. 64×64 PNG.
- **Monogram mark:** `website/assets/monogram.png` — *generated.* Standalone gold "SG" on transparent, 240×240 — for social avatars, watermark, loader, or compact header lockup.

### Photography / Hero
- **Hero:** `website/assets/hero.jpg` — *generated (designed background).* 1920×1080. Deep-navy vertical gradient, warm-gold glow upper-right, faint "SG" watermark, gold corner-frame accents, fine grain. **Left/center is intentionally clean for the headline + CTA overlay; the attorney headshot is meant to occupy the right.** Use `logo-white.png` over it. ⚠️ *Not a photo — see Missing/Needs Attention for the real headshot the hero is designed to receive.*

### Section Imagery
- **Services band:** `website/assets/section-services.jpg` — *generated.* 1920×620 navy band (glow left) — backdrop for the "One lawyer. Everything life throws at you." practice-area section.
- **About panel:** `website/assets/section-about.jpg` — *generated.* 900×1100 portrait, dignified navy/gold branded panel with gold inner frame + "SG" monogram. **Placeholder backdrop for the About section — replace with Shani's real headshot when supplied** (it reads as an intentional branded panel if used as-is, so the site never looks broken).
- **Service-area map:** `website/assets/section-map.jpg` — *generated.* 1600×1000 stylized minimalist map: gold "Ventura Blvd" spine, navy location pin on Encino, concentric service rings, labeled Tarzana / Sherman Oaks / San Fernando Valley / 101 freeway. Light warm-white background. Drives the "Serving the Israeli community across LA" section + local SEO.
- **CTA band:** `website/assets/section-cta.jpg` — *generated.* 1920×600 navy band (center glow, no watermark) — backdrop for the final "Free consultation. In Hebrew or English. Today." contact block.

### Practice-Area Icons (gold line icons, 256×256, transparent PNG — *generated*)
- `website/assets/icon-immigration.png` — globe + journey arc (Immigration Law — flagship)
- `website/assets/icon-citizenship.png` — star seal + ribbon (U.S. Citizenship & Naturalization)
- `website/assets/icon-injury.png` — shield + medical cross (Personal Injury)
- `website/assets/icon-family.png` — family figures (Family Law)
- `website/assets/icon-realestate.png` — house + door (Real Estate)

---

## Colors

Locked from Phase 2 strategy; hex codes confirmed and contrast-tested (below).

- **Primary (Navy):** `#0F2742` — authority/trust; headers, hero, footer, primary buttons.
- **Secondary (Warm White):** `#F7F5F1` — primary page background. *(Companion warm gray `#E8E6E1` for alternating sections/cards.)*
- **Accent (Gold/Brass):** `#C9A24B` — rules, icons, underlines, button accents, hover states. *(Lighter glow tint `#D9BA72` used in gradients.)*
- **Background:** `#F7F5F1` (light sections) / `#0F2742` (dark sections).
- **Text:** `#1A1F26` (charcoal) on light; `#FAF9F7` (warm white) on navy.

### Contrast verification (WCAG 2.1)
| Foreground | Background | Ratio | Verdict |
|---|---|---|---|
| Warm white `#FAF9F7` | Navy `#0F2742` | **14.37:1** | ✅ AAA |
| Charcoal `#1A1F26` | Warm white `#F7F5F1` | **15.21:1** | ✅ AAA |
| Navy `#0F2742` | Warm white `#F7F5F1` | **13.88:1** | ✅ AAA |
| Navy `#0F2742` | Warm gray `#E8E6E1` | **12.12:1** | ✅ AAA |
| Gold `#C9A24B` | Navy `#0F2742` | **6.30:1** | ✅ AA (all text) |
| Gold `#C9A24B` | Warm white `#F7F5F1` | **2.20:1** | ❌ FAIL |

> **⚠️ Color rule for the build:** **Gold text is only legible on navy.** Never use gold for body or small text on the light/warm-white background (2.2:1 fails). On light backgrounds, gold is for **decorative use only** — rules, dividers, icons, borders, large display flourishes. Body copy on light = charcoal `#1A1F26`; links/emphasis on light = navy `#0F2742` (underline in gold is fine).

---

## Typography

Bilingual requirement (Hebrew RTL + English LTR) drove the choice toward **Google Fonts that ship both Hebrew and Latin glyphs**, so one stack renders cleanly in both languages.

- **Headings:** **Frank Ruhl Libre** — elegant high-contrast serif with full **Hebrew + Latin** support; echoes the Didot logo wordmark and renders RTL natively. (Weights 500/700/900.)
- **Body / UI:** **Assistant** — modern humanist sans with full **Hebrew + Latin** support; highly readable, excellent at small sizes and in RTL. (Weights 300/400/600/700.)
- **Eyebrow / labels (letter-spaced small caps, e.g. "LAW OFFICES"):** Assistant 600, uppercase, tracked.

Google Fonts embed:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&family=Assistant:wght@300;400;600;700&display=swap" rel="stylesheet">
```
*(The logo/favicon themselves are baked in Didot — no web font needed for them.)*

---

## Asset → Section Map (for the build)

| Strategy section | Asset(s) |
|---|---|
| Header (sticky) | `logo-white.png` on navy / `logo.png` if light header; `favicon.png` |
| 1 — Hero | `hero.jpg` + `logo-white.png` + **[real headshot — pending]** |
| 2 — Trust Bar | text/badges only (no image needed) |
| 3 — Services | `section-services.jpg` + 5 `icon-*.png` |
| 4 — Why Shani | reuse navy band styling / icons; no new asset |
| 5 — About Shani | `section-about.jpg` placeholder → **[real headshot — pending]** |
| 6 — Testimonials | text + stars; **[client photos optional]** |
| 7 — Service Area | `section-map.jpg` |
| 8 — Contact / CTA | `section-cta.jpg` |
| Footer | `logo-white.png`, `monogram.png` |

---

## Missing / Needs Attention

**Photographic assets to collect from the client (the build can ship with the designed placeholders above, but these materially raise trust and conversion):**

1. **🔴 Professional attorney headshot of Shani Gabay — highest priority.** Research §6 flagged "no photo" as a core credibility gap; Strategy makes the headshot critical for both Hero and About. The hero and `section-about.jpg` are *designed around* receiving it. Until supplied, the branded placeholder panels stand in without looking broken.
2. **🟠 Office / location photos** — Ventura Blvd exterior or interior (reception/desk). Reinforces the "in the heart of your community, Encino" message (Service Area + About).
3. **🟠 Named testimonials with stars + source + (optional) client photos** — Strategy §6 calls for upgrading the old site's anonymous "E.D." initials to named, attributed, starred reviews (Yelp/Avvo/Facebook/Google), ideally ≥1 Hebrew testimonial for the HE view. Copy can be pulled from existing 5.0 Avvo / 100% Facebook base; collect attribution.

**Brand / design notes:**
4. **Logo is freshly designed, not client-provided.** Confirm "Shani Gabay / LAW OFFICES" wordmark direction with the client; a refined "SG" monogram (`monogram.png`) is included as an alternate/compact mark. Trivial to regenerate variants from `_generators/`.
5. **Gold-on-light contrast fails** — enforce the color rule above in the build (gold decorative only on light; gold text only on navy).
6. **All section/hero images are designed graphics, not stock photos** — by design they're text-overlay backdrops, not literal scenes (Strategy §4 explicitly steers away from gavel/scales clichés). They look intentional and premium; swapping in real photography later is a drop-in.

**Content open items carried from Research/Strategy (confirm before publish — not asset blockers):**
7. **Suite number** — 208 vs 400 conflict across directories (Research §2). Footer/contact + map.
8. **AILA membership** — add badge if confirmed (Trust Bar).
9. **Criminal defense** — ~20% of practice, held back pending client confirmation; no 6th practice icon generated by default.
10. **Default landing language** — building Hebrew-first per the funnel source; confirm with client.

---

## Summary

| | |
|---|---|
| Logo | ✅ Generated (primary + reversed + monogram) |
| Favicon | ✅ Generated (64×64) |
| Hero | ✅ Generated 1920×1080 (awaits headshot overlay) |
| Section images | ✅ Services band, About panel, Service-area map, CTA band |
| Practice icons | ✅ 5 gold line icons |
| Colors | ✅ Confirmed + WCAG-tested (1 rule flagged) |
| Typography | ✅ Frank Ruhl Libre + Assistant (bilingual HE/EN) |
| Photography | ⚠️ None provided — placeholders in place; headshot is the key gap |

**Every asset referenced in the Phase 2 strategy has a file ready in `website/assets/` for the build phase.** The only outstanding items are client-supplied photographs (headshot first), which can be dropped into the existing slots without rework.
