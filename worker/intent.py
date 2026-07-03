#!/usr/bin/env python3
"""
UNVEILED — Intent Signal Scoring (Customer Intelligence Layer).

Every customer action is a signal. Qualification says "are they a fit"; INTENT
says "how strongly have they leaned in." Intent is separate from qualification
and feeds the Company Brain's PRODUCTION priority when capacity is constrained
(Decision-Prioritization doctrine). It never auto-decides a customer; it ranks
attention and build order by demonstrated buying intent.

Tiers (each action adds evidence, never removes it):
  clicked "Yes"                         -> qualified lead        (base intent)
  Yes + uploaded any asset              -> higher-intent lead    (invested time)
  multiple uploads / notes / extra info -> strongest intent      (clear buying signal)

Output feeds business_intelligence.intent (score + tier) and lowers the build
work_queue.priority number (lower = built sooner) via priority_boost.
Deterministic, stdlib only, testable. Hypothesis weights (Book 01 §4) — recalibrate
from real convert-rates by tier as data lands.
"""
import sys, json

# action -> intent points (evidence-based, additive)
WEIGHTS = {
    "clicked_yes":        20,   # said yes at all
    "uploaded_asset":     18,   # per asset uploaded (logo/photo/brand/etc.)
    "provided_notes":     15,   # wrote us something specific
    "provided_brand_info":10,   # colors / links / extra business info
    "returned_to_page":    6,   # came back (repeat engagement)
}
UPLOAD_CAP = 4  # diminishing returns past a handful of assets

def score_intent(actions: dict) -> dict:
    """actions: {clicked_yes:bool, uploads:int, notes:bool, brand_info:bool, returns:int}"""
    s = 0
    if actions.get("clicked_yes"):
        s += WEIGHTS["clicked_yes"]
    uploads = min(int(actions.get("uploads", 0)), UPLOAD_CAP)
    s += uploads * WEIGHTS["uploaded_asset"]
    if actions.get("notes"):
        s += WEIGHTS["provided_notes"]
    if actions.get("brand_info"):
        s += WEIGHTS["provided_brand_info"]
    s += min(int(actions.get("returns", 0)), 3) * WEIGHTS["returned_to_page"]
    s = max(0, min(100, s))

    # tier from the evidence pattern (not just the number)
    if uploads >= 2 or (uploads >= 1 and (actions.get("notes") or actions.get("brand_info"))):
        tier = "strongest"          # multiple uploads / uploads + detail
    elif uploads >= 1:
        tier = "higher"             # yes + at least one asset
    elif actions.get("clicked_yes"):
        tier = "qualified"          # yes only
    else:
        tier = "none"

    # priority_boost lowers the build queue priority number (lower = sooner).
    # base say_yes priority = 5; strongest intent can move to the front.
    priority_boost = {"strongest": 3, "higher": 2, "qualified": 1, "none": 0}[tier]
    return {
        "intent_score": s,
        "intent_tier": tier,
        "priority_boost": priority_boost,
        "build_priority": max(1, 5 - priority_boost),   # -> work_queue.priority
    }

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--selftest":
        cases = [
            ("yes only",                 {"clicked_yes": True}),
            ("yes + 1 upload",           {"clicked_yes": True, "uploads": 1}),
            ("yes + logo + notes",       {"clicked_yes": True, "uploads": 1, "notes": True}),
            ("yes + 3 uploads + brand",  {"clicked_yes": True, "uploads": 3, "brand_info": True}),
            ("no yes",                   {}),
        ]
        for name, a in cases:
            r = score_intent(a)
            print(f"{name:<26} score={r['intent_score']:>3}  tier={r['intent_tier']:<10} build_priority={r['build_priority']}")
