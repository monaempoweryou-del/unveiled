# SOP: TikTok Paid Acquisition (UNVEILED)
**Standard for every future paid campaign. Version 1.0 — 2026-07-17.**

## 0. The rule
The objective is **paying customers**, never views, likes, or engagement. Every setting below exists to serve one number: **cost per completed onboarding**, and then **cost per paying customer**. If a decision does not move that number, it is not made.

---

## 1. Tracking foundation (BUILT + LIVE)
Without this, TikTok's algorithm optimizes for clicks and burns budget on tourists. This is done:

| Item | Status | Detail |
|---|---|---|
| TikTok Pixel scaffold | **Live** on `unveiled.pro/start` | `window.TT_PIXEL_ID` — no-ops safely until the ID is pasted |
| `CompleteRegistration` event | **Live** | Fires on the *real* success point: successful lead insert. This is THE optimization event |
| `ttclid` capture | **Live** | Stored to the lead (`social_profiles.meta.ttclid`) so a customer traces to the exact click. CAPI-ready |
| Source attribution | **Live** | `SRC_MAP` now maps `tiktok` / `tiktok-ads` → lead `channel`; previously TikTok traffic landed unattributed |

**Only missing value: the Pixel ID** (requires a TikTok Ads account). Paste it into `TT_PIXEL_ID` and tracking is fully armed.

### Destination URL (use exactly this)
```
https://unveiled.pro/start?src=tiktok-ads&campaign=tt-first-customer&cid=southbay-reveal&cv=1
```
Every lead then arrives with `channel=tiktok-ads`, `campaign`, `creative_id` — queryable in Supabase `leads`. That is how ROI gets proven instead of guessed.

---

## 2. Campaign architecture
**Native TikTok campaign. Never "boost a post"** — boosting optimizes for engagement and cannot optimize for onboarding completion.

- **Campaign**: `UNVEILED | Free Website | Conversions`
  - Objective: **Website Conversions**
  - Attribution: 7-day click / 1-day view
  - Campaign Budget Optimization: **off** at launch (control each ad group while learning)

- **Ad Group A — Interest/Behavior**
  - Optimization event: **CompleteRegistration**
  - Location: Los Angeles metro first (that is where our proof and previews are), then expand
  - Age 25-55 · All genders
  - Interests: Small Business, Entrepreneurship, Home Improvement, Business Services, Marketing
  - Behaviors: engaged with small-business / entrepreneur content (last 15 days)
  - Placement: TikTok feed only (disable Pangle/audience network — junk traffic)

- **Ad Group B — Broad**
  - Same optimization event, **no interest targeting**, same geo/age
  - TikTok's algorithm often beats manual targeting once the pixel has data. This is the control.

- **Ad Group C — Retargeting** (turn on after ~500 landing-page visits)
  - Audience: visited `/start`, did not fire `CompleteRegistration`
  - Plus video viewers 25/50/75% and profile engagers

---

## 3. Creative
**Use the approved reveal video. Do not produce a new one.**
- `southbay_reveal.mp4` — 1080x1920, 12s, real before/after of South Bay Door
- Live copy: https://unveiled.pro/content/southbay-reveal.mp4
- Staged in Postiz: https://uploads.postiz.com/C9j0zuvGvt.mp4

**Native requirements (non-negotiable for TikTok):**
- Vertical 9:16, no letterboxing, no watermark from other platforms
- Hook lands in the first 1 second (it does: "THEIR WEBSITE RIGHT NOW")
- **Add sound.** The video is currently silent. Silent ads underperform badly on TikTok. Add a trending/licensed track or a voiceover before spending.
- Captions/on-screen text already baked in (most viewers watch muted)

**Ad copy (test 2):**
1. `I build local businesses a free website in 72 hours. No catch. See yours before you pay anything.`
2. `Your competitor's website looks like this. Yours doesn't have to. Free preview in 72 hours.`

**CTA button:** `Sign Up` or `Learn More`

---

## 4. Budget & bidding
- **Launch:** $20-30/day per ad group (A + B) = $40-60/day total
- **Minimum honest test:** 7 days. Do not judge on day 1-2 (learning phase)
- **Bid:** Lowest Cost at launch. Switch to **Cost Cap** only once real CPA is known
- **Learning reality:** a brand-new pixel has zero conversion history. The first days are the algorithm learning and will look expensive. Budget for that, or do not start.
- **Kill rules:**
  - Pause an ad group at **>$60 per completed onboarding** with zero paying customers after ~$300 spend
  - Kill the whole test at **$500 spend with 0 paying customers** and re-think offer/creative, not targeting

---

## 5. Measurement (the only scoreboard)
| Metric | Where | Target |
|---|---|---|
| Completed onboardings | Supabase `leads` where `channel='tiktok-ads'` | primary |
| Cost per completed onboarding | spend ÷ above | < $40 |
| **Paying customers** | `leads` status → paid | **≥ 1 = mission** |
| Cost per paying customer | spend ÷ paying | < LTV |

Vanity metrics (views, likes, CTR) are diagnostics only. They never justify continuing.

---

## 6. Launch checklist (human steps only)
These are the only steps that require Maor. Everything else is built.
1. Create **TikTok Ads Manager** account (business.tiktok.com) — needs identity + business details
2. **Assets → Events → Web Events → Create Pixel** (Developer Mode / Manual). Copy the **Pixel ID**
3. **Send the Pixel ID to Claude** → wired into `TT_PIXEL_ID` and verified live in minutes
4. Add a **payment method** (ad spend is a financial decision — human only)
5. Add **sound** to the creative
6. Build campaign per §2, upload creative, set destination URL from §1
7. Launch, then leave it alone for 7 days

---

## 7. Honest risk note
We are spending money on an **unvalidated creative** on a channel where our organic reach is ~0. The cheaper sequence is: post the reveal organically to the 12.4k TikTok account first, confirm the creative holds attention, *then* put money behind a proven winner. Paid amplifies a working message; it does not create one. If the CEO wants paid first, the budget above is the controlled way to learn.

---

## 8. Reuse
This document is the standard for all future paid campaigns (TikTok, Meta, Google). Clone §2-§6, swap creative and channel. The tracking foundation (§1) is already generic: any `?src=<channel>` maps to a lead `channel`, and `CompleteRegistration` is the universal conversion event.
