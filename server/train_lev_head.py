"""Train a Lev head (CLM format) for one game on frozen Qwen3-8B embeddings.

python train_lev_head.py train.jsonl [more.jsonl ...] out_head.pt
Rows are gen-data JSONL. The state text is embedded alone (no instructions), one text per
forward pass, exactly as LevBackend(state_only=True) does at play time. Action texts are the
option keys, so the head works for any question with the same keys (e.g. Dino Keys and Intent).
Objective: closed-set cross-entropy over the game's actions, class-weighted (like Lev v2).
"""

import json
import os
import random
import sys

import torch

from gateway.backends.lev import load_encoder, make_head

*data_paths, out_path = sys.argv[1:]
files = [[json.loads(line) for line in open(p)] for p in data_paths]
rows = [r for f in files for r in f]
keys = list(rows[0]["request"]["questions"]["action"]["criteria"])
device = "cuda"
tok, enc, _ = load_encoder("Qwen/Qwen3-8B", device)


@torch.no_grad()
def embed(text: str) -> torch.Tensor:
    batch = tok([text], return_tensors="pt").to(device)
    return torch.nn.functional.normalize(enc(**batch).last_hidden_state[:, -1].float(), dim=-1)[0].cpu()


parts = []
for path, f in zip(data_paths, files):  # embeddings are cached per file, so new DAgger files only embed themselves
    cache = path + ".emb.pt"
    if not os.path.exists(cache):
        torch.save(torch.stack([embed(r["request"]["state"]) for r in f]), cache)
    parts.append(torch.load(cache))
X = torch.cat(parts)
A = torch.stack([embed(k) for k in keys]).to(device)
y = torch.tensor([keys.index(r["label"]) for r in rows])

idx = list(range(len(rows)))
random.Random(0).shuffle(idx)
n_val = len(idx) // 10
val, tr = torch.tensor(idx[:n_val]), torch.tensor(idx[n_val:])

cfg = dict(width=4096, depth=2, projection_dim=512, activation="gelu", layernorm=True, residual=False, hidden_size=4096)
kw = dict(width=4096, depth=2, proj=512, activation="gelu", layernorm=True, residual=False, hidden=4096)
torch.manual_seed(0)
sh, ah = make_head(**kw).to(device), make_head(**kw).to(device)
logit_scale = torch.nn.Parameter(torch.tensor(2.3, device=device))  # exp(2.3) ≈ 10
opt = torch.optim.AdamW([*sh.parameters(), *ah.parameters(), logit_scale], lr=1e-4, weight_decay=0.01)
counts = torch.bincount(y[tr], minlength=len(keys)).float()
weight = (counts.sum() / counts / len(keys)).to(device)


def logits(xb):
    zs = torch.nn.functional.normalize(sh(xb), dim=-1)
    za = torch.nn.functional.normalize(ah(A), dim=-1)
    return logit_scale.clamp(max=4.6).exp() * zs @ za.T


best, best_state = -1.0, None
for epoch in range(40):
    sh.train(); ah.train()
    perm = tr[torch.randperm(len(tr))]
    for i in range(0, len(perm), 256):
        b = perm[i : i + 256]
        loss = torch.nn.functional.cross_entropy(logits(X[b].to(device)), y[b].to(device), weight=weight)
        opt.zero_grad(); loss.backward(); opt.step()
    sh.eval(); ah.eval()
    with torch.no_grad():
        pred = logits(X[val].to(device)).argmax(1).cpu()
    recall = [((pred == c) & (y[val] == c)).sum().item() / max(1, (y[val] == c).sum().item()) for c in range(len(keys))]
    macro = sum(recall) / len(recall)
    print(f"epoch {epoch + 1:2d} loss={loss.item():.3f} val_macro_recall={macro:.3f} " + " ".join(f"{k}={r:.2f}" for k, r in zip(keys, recall)), flush=True)
    if macro > best:
        best = macro
        best_state = {"state_head": {k: v.cpu().clone() for k, v in sh.state_dict().items()},
                      "action_head": {k: v.cpu().clone() for k, v in ah.state_dict().items()},
                      "logit_scale": logit_scale.detach().cpu().clone(), "cfg": cfg}
torch.save(best_state, out_path)
print(f"saved {out_path} best_val_macro_recall={best:.3f}")
