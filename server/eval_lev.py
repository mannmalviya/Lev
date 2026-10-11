"""Score Lev against the expert bot's labels: python eval_lev.py eval-flappy.jsonl"""

import json
import random
import sys
import time

from gateway.backends.lev import LevBackend

rows = [json.loads(line) for line in open(sys.argv[1])]
random.Random(0).shuffle(rows)
rows = rows[:300]
lev = LevBackend()
q = rows[0]["request"]["questions"]["action"]

safe = decisive = decisive_ok = label_ok = 0
flaps = 0
probs = []
t0 = time.perf_counter()
for r in rows:
    c = lev.choose(r["request"]["state"], q["instructions"], q["criteria"])
    pick = max(c.probabilities, key=c.probabilities.get)
    probs.append(c.probabilities["flap"])
    flaps += pick == "flap"
    safe += pick in r["safe_actions"] or not r["safe_actions"]
    label_ok += pick == r["label"]
    if len(r["safe_actions"]) == 1:
        decisive += 1
        decisive_ok += pick == r["safe_actions"][0]
ms = (time.perf_counter() - t0) / len(rows) * 1000
print(f"states={len(rows)}  safe_pick={safe / len(rows):.2%}  matches_label={label_ok / len(rows):.2%}  "
      f"decisive={decisive_ok}/{decisive}  picks_flap={flaps}  ms_per_call={ms:.0f}")
print(f"P(flap): min={min(probs):.3f} max={max(probs):.3f} (scale={lev.scale:.3f})")
