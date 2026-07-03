#!/usr/bin/env python3
"""
UNVEILED — Qualification Model (upstream capability).

Scores a business_intelligence record into qualification_score (0..100),
qualified (bool), disqualification_reason, estimated_value_monthly.
Deterministic, testable, tunable. This is a HYPOTHESIS model (Book 01 §4):
it starts on judgment and is replaced by measured performance as
industry_intelligence accumulates real qualify->convert data.

Logic (v1): fit (first-wave industry) + reachability (verified contact) +
OPPORTUNITY (weak/absent site = we can help most) + value (industry).
Stdlib only.
"""
import sys, json
try:
    import industry_config
except ImportError:  # allow running from repo root
    from worker import industry_config

FIRST_WAVE = industry_config.FIRST_WAVE           # the 10-industry laboratory
HARD_DISQUALIFY = {"lead-gen", "directory", "national"}  # not a real local business


def qualify(rec):
    ind = (rec.get("industry") or "").lower()
    reasons = []
    score = 0.0

    # 1. FIT — must be a first-wave industry
    if ind in FIRST_WAVE:
        score += 25
    else:
        reasons.append("outside first-wave industries")

    # 2. OPPORTUNITY — a weak or absent site is the biggest signal we can help
    wq = rec.get("website_quality")
    if wq is None and not rec.get("website_url"):
        score += 40                      # no site at all = maximum opportunity
    elif wq is not None:
        score += (100 - wq) * 0.40       # weaker site -> more opportunity (0..40)

    # 3. REACHABILITY — a verified contact makes it actionable
    contact = rec.get("contact") or {}
    if rec.get("contact_verified") and contact.get("email"):
        score += 20
    elif contact.get("email"):
        score += 10
    else:
        reasons.append("no verified email")

    # 4. ESTABLISHED signal (proxy: some research present)
    if (rec.get("research") or {}).get("reviews") or (rec.get("research") or {}).get("established"):
        score += 15

    # hard disqualifiers
    blob = " ".join(str(v) for v in (rec.get("business_name"), rec.get("website_url"))).lower()
    if any(k in blob for k in HARD_DISQUALIFY):
        reasons.append("not a real local business (lead-gen/directory)")

    cfg = industry_config.get(ind)
    ev = cfg["value"]
    threshold = cfg["qual_threshold"]
    score = max(0, min(100, round(score)))
    qualified = (ind in FIRST_WAVE
                 and "not a real local business (lead-gen/directory)" not in reasons
                 and score >= threshold)
    return {
        "qualification_score": score,
        "qualified": qualified,
        "disqualification_reason": None if qualified else "; ".join(reasons) or "score below threshold",
        "estimated_value_monthly": ev,
        "stage": "qualified" if qualified else "disqualified",
    }


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        samples = [
            {"industry": "med-spa", "website_quality": 30, "contact_verified": True,
             "contact": {"email": "a@x.com"}, "research": {"reviews": 40}},
            {"industry": "hvac", "website_url": None, "contact": {"email": "b@x.com"},
             "contact_verified": True},
            {"industry": "restaurant", "website_quality": 40, "contact": {"email": "c@x.com"}},
            {"industry": "locksmith", "business_name": "National Locksmith Directory",
             "website_quality": 20, "contact": {"email": "d@x.com"}, "contact_verified": True},
        ]
        for s in samples:
            print(f"{s.get('industry'):<14}", json.dumps(qualify(s)))
