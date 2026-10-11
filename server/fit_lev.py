"""Fit Lev's calibration (one scale + one bias per action) on expert data the eval never sees.

python fit_lev.py calib-flappy.jsonl  ->  writes calibration.json next to the head file.
The head itself is unchanged. Only the softmax input becomes: scale * cos + bias[action].
"""

import json
import os
import sys

import torch

from gateway.backends.lev import LevBackend

rows = [json.loads(line) for line in open(sys.argv[1])]
rows = [r for r in rows if len(r["safe_actions"]) == 1]  # only states where one action is clearly right
# LEV_HEAD picks the head (default v1); LEV_STATE_ONLY=1 for heads trained without instructions (v2).
lev = LevBackend("eval", os.environ.get("LEV_HEAD", "~/models/lev/text_state_flappy_head.pt"), os.environ.get("LEV_STATE_ONLY") == "1")
lev.calibration = None  # fit on raw cosines
q = rows[0]["request"]["questions"]["action"]
keys = list(q["criteria"])

cos = torch.tensor([lev.cosines(r["request"]["state"], q["instructions"], q["criteria"]) for r in rows])
y = torch.tensor([keys.index(r["safe_actions"][0]) for r in rows])

scale = torch.tensor(10.0, requires_grad=True)
# LEV_SCALE_ONLY=1: fit only the scale, so the picks stay the head's own (only the probabilities change).
scale_only = os.environ.get("LEV_SCALE_ONLY") == "1"
bias = torch.zeros(len(keys), requires_grad=not scale_only)
opt = torch.optim.LBFGS([scale] if scale_only else [scale, bias], max_iter=500)


def loss_fn():
    opt.zero_grad()
    loss = torch.nn.functional.cross_entropy(scale * cos + bias - bias[-1], y)
    loss.backward()
    return loss


opt.step(loss_fn)
b = (bias - bias[-1]).tolist()
acc = ((scale * cos + torch.tensor(b)).argmax(1) == y).float().mean().item()
out = {"scale": scale.item(), "bias": dict(zip(keys, b)), "fit_rows": len(rows), "fit_accuracy": acc}
path = os.path.join(os.path.dirname(lev.head_path), "calibration.json")
json.dump(out, open(path, "w"), indent=2)
print(f"wrote {path}: {out}")
