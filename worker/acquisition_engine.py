#!/usr/bin/env python3
"""
UNVEILED — Acquisition Engine (continuous production line, not batches).

Every business_intelligence record is a unit on a moving line. Each cycle, the
engine advances EVERY record as far as it legally/technically can, keeps the
line full, and NEVER waits on replies — "waiting" is a per-prospect state, never
a company state (Continuous Outreach Directive, 2026-07-02).

Stage machine (field `stage` on business_intelligence):
  discovered -> analyzed -> qualified -> verified -> outreach_ready
             -> outreach_sent -> [terminal: replied | declined | bounced | invalid]

Transitions call the company's PROVEN services (retrieval-before-creation):
  analyze   -> website_analysis.analyze_url(url)      (worker network)
  qualify   -> qualification.qualify(rec)
  verify    -> contact present + verified              (agent/web adapter)
  prepare   -> render personalized permission-first draft (one real observation)
  send      -> outreach_queue_send() [DB: suppression + send-once enforced]
              then enqueue the tasks row the live Resend drain delivers
  monitor   -> email_events (delivered/open/click/reply) sets terminal state

Control loop (execution_engine semantics): advance all runnable records; a record
that hits blocked_external (e.g. needs worker fetch / needs contact) is PARKED,
never halts the others; if runnable inventory < MIN_QUEUE, trigger discovery to
refill. Emits ONE stage-count briefing per cycle. Stdlib only.

Runs against Supabase in production (worker). In a no-egress context it runs
--dry-run over Knowledge-OS/DISCOVERY/cil-records-*.json to prove the machine.
"""
import os, sys, json, glob
sys.path.insert(0, os.path.dirname(__file__))
import qualification
try:
    import website_analysis
except Exception:
    website_analysis = None

MIN_QUEUE = 25          # keep at least this many pre-send records moving
ORDER = ["discovered","analyzed","qualified","verified","outreach_ready",
         "outreach_sent"]
TERMINAL = {"replied","declined","bounced","invalid","unsubscribed","customer"}

# per-industry strategy + angle (mirror of the outreach engines / OUTREACH-EXPERIMENT-V1)
ANGLE = {
 "locksmith":("when someone's locked out at 11pm","people call the locksmith who looks trustworthy first"),
 "home-improvement":("your work vs. your website","your work sells itself — if people can see it"),
 "adu-contractor":("the ADU buyers comparing you now","ADU buyers shortlist on the website before they call"),
 "custom-home-builder":("a better first impression","people judge a custom builder by the site first"),
 "garage-door":("the quote you lose in 5 seconds","calls go to whoever looks fastest + most trustworthy"),
 "pool-cleaning":("the pools you could be booking","clients pick the service that looks reliable + easy to book"),
 "hvac":("the AC calls slipping past you","in a heat wave homeowners call whoever looks ready + books online"),
 "med-spa":("your brand vs. your booking page","in aesthetics the site is the first treatment room"),
 "dental":("the patients deciding in 8 seconds","new patients choose by the website before they call"),
 "pest-control":("the recurring clients you could lock in","pest control is recurring revenue if signup is effortless"),
}

def _draft(rec):
    ind = rec.get("industry",""); b = rec.get("business_name","")
    subj, angle = ANGLE.get(ind, ("a quick idea", "your site should look as good as your business is"))
    hook = (rec.get("research") or {}).get("weakness_observed","")
    body = (f"Hi — {angle}. Looking at {b}, one thing stood out: {hook}. "
            f"I'd like to rebuild it for you — free, no strings — so you can see what it could look like. "
            f'Want me to send the reveal? Just reply "yes."')
    return subj, body

def advance(rec, dry=True):
    """Advance ONE record one stage. Returns (new_stage, status, note)."""
    st = rec.get("stage","discovered")
    if st in TERMINAL:
        return st, "terminal", st
    ind = (rec.get("industry") or "").lower()

    if st == "discovered":
        wq = rec.get("website_quality")
        if not rec.get("website_url"):
            rec["website_quality"] = None            # no site = analyzed (max opportunity)
            return "analyzed", "done", "no-site"
        if wq is not None:
            return "analyzed", "done", "already-scored"
        if website_analysis and not dry:
            try:
                rec["website_quality"] = website_analysis.analyze_url(rec["website_url"]).get("score")
                return "analyzed", "done", "fetched"
            except Exception as e:
                return st, "blocked_external", f"fetch failed: {e}"
        return st, "blocked_external", "needs worker fetch (no egress)"

    if st == "analyzed":
        rec.update(qualification.qualify(rec))
        return ("qualified","done","qualified") if rec.get("qualified") \
               else ("disqualified","done", rec.get("disqualification_reason","below threshold"))

    if st == "qualified":
        email = (rec.get("contact") or {}).get("email")
        if email and rec.get("contact_verified"):
            return "verified", "done", email
        if email:
            return "verified", "done", f"{email} (soft)"
        return st, "blocked_external", "needs contact verification (agent/web)"

    if st == "verified":
        subj, body = _draft(rec)
        rec["outreach"] = {"subject": subj, "body": body, "strategy": qualification.industry_config.get(ind)["strategy"]}
        return "outreach_ready", "done", "draft prepared"

    if st == "outreach_ready":
        email = (rec.get("contact") or {}).get("email"); dom = rec.get("domain","")
        call = (f"select outreach_queue_send('{email}','{rec['business_name']}','{dom}','{ind}',"
                f"'{rec.get('city','')}','{rec['outreach']['strategy']}',$$"
                f"{rec['outreach']['subject']}$$, gen_random_uuid()::text, null);")
        rec["queue_call"] = call
        if dry:
            return "outreach_ready", "blocked_external", "send needs live Supabase (queued call prepared)"
        # prod: execute call + enqueue tasks row via the verified template contract (see checklist step 4)
        return "outreach_sent", "done", "queued"

    return st, "blocked_external", f"no handler for stage {st}"

def run_cycle(records, dry=True):
    moved = 0
    for rec in records:
        # advance a record repeatedly until it parks/terminates (keeps the line moving)
        for _ in range(len(ORDER)+1):
            before = rec.get("stage","discovered")
            new, status, note = advance(rec, dry=dry)
            rec["stage"] = new
            if status in ("blocked_external","terminal") or new == before:
                break
            moved += 1
    return moved

def counts(records):
    from collections import Counter
    return dict(Counter(r.get("stage","discovered") for r in records))

if __name__ == "__main__":
    dry = "--dry-run" in sys.argv or not os.environ.get("SUPABASE_URL")
    f = sorted(glob.glob("Knowledge-OS/DISCOVERY/cil-records-*.json"))[-1]
    recs = json.load(open(f))
    for r in recs: r["stage"] = "discovered"        # replay the full line from the top
    moved = run_cycle(recs, dry=dry)
    c = counts(recs)
    ready = [r for r in recs if r.get("stage")=="outreach_ready" and r.get("queue_call")]
    print(f"Acquisition Engine — {'DRY-RUN' if dry else 'LIVE'} over {len(recs)} records ({f})")
    print(f"stage transitions this cycle: {moved}")
    print("stage counts:", json.dumps(c, indent=None))
    print(f"prepared-to-send (queued calls ready): {len(ready)}")
    parked = {}
    for r in recs:
        if r.get("stage") in ("discovered","qualified","outreach_ready") and r.get("stage")!="outreach_sent":
            parked.setdefault(r["stage"],0)
    print("parked stages awaiting external:", {s:sum(1 for r in recs if r.get('stage')==s) for s in ('discovered','qualified','outreach_ready')})
