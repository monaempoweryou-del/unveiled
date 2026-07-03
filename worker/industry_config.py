#!/usr/bin/env python3
"""
UNVEILED — Industry Configuration (per-industry tuning for the acquisition engines).

One config per first-wave industry, consumed by qualification.py and
website_analysis.py so scoring is industry-aware (not generic). Each entry:
  value          our estimated monthly deal value
  strategy       best-fit outreach strategy (from OUTREACH-EXPERIMENT-V1)
  site_must_have  keywords a good site in this industry should contain; missing =
                  an industry-specific weakness (feeds website analysis profile)
  qual_threshold  min qualification score to pass
Hypotheses (Book 01 §4) — recalibrate from industry_intelligence as data lands.
Stdlib only.
"""

DEFAULT = {"value": 250, "strategy": "outreach-v1-curiosity",
           "site_must_have": ["call", "contact"], "qual_threshold": 50}

CONFIG = {
    "locksmith":            {"value": 250, "strategy": "outreach-v1-pain",
                             "site_must_have": ["24/7", "call", "emergency", "licensed"], "qual_threshold": 50},
    "home-improvement":     {"value": 300, "strategy": "outreach-v1-critique",
                             "site_must_have": ["gallery", "portfolio", "financing", "quote"], "qual_threshold": 50},
    "adu-contractor":       {"value": 400, "strategy": "outreach-v1-opportunity",
                             "site_must_have": ["adu", "gallery", "permit", "financing"], "qual_threshold": 50},
    "custom-home-builder":  {"value": 450, "strategy": "outreach-v1-critique",
                             "site_must_have": ["portfolio", "gallery", "process", "contact"], "qual_threshold": 55},
    "garage-door":          {"value": 275, "strategy": "outreach-v1-competitor",
                             "site_must_have": ["quote", "repair", "install", "call"], "qual_threshold": 50},
    "pool-cleaning":        {"value": 300, "strategy": "outreach-v1-opportunity",
                             "site_must_have": ["book", "service area", "weekly", "quote"], "qual_threshold": 50},
    "hvac":                 {"value": 350, "strategy": "outreach-v1-pain",
                             "site_must_have": ["maintenance", "financing", "emergency", "book"], "qual_threshold": 50},
    "med-spa":              {"value": 500, "strategy": "outreach-v1-pride",
                             "site_must_have": ["book", "appointment", "before", "membership"], "qual_threshold": 50},
    "dental":               {"value": 500, "strategy": "outreach-v1-curiosity",
                             "site_must_have": ["book", "appointment", "new patient", "insurance"], "qual_threshold": 50},
    "pest-control":         {"value": 350, "strategy": "outreach-v1-opportunity",
                             "site_must_have": ["plan", "subscription", "service area", "quote"], "qual_threshold": 50},
}

FIRST_WAVE = set(CONFIG)

def get(industry):
    return CONFIG.get((industry or "").lower(), DEFAULT)
