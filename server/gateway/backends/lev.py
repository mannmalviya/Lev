"""Lev: our trained CLM-format heads (thomasliao/Lev) on a frozen Qwen3-8B.

Follows Contrastive-LM's inference exactly (github.com/Contrastive-LM/CLM, src/clm):
- state text  = state + "\\n\\n" + instructions      (schema.state_text)
- action text = the option's description, else its key (schema.candidates)
- encoder     = Qwen3-8B last-token hidden state, L2-normalised (embedder.py, vLLM pooling)
- score       = exp(logit_scale) * cos(state_head(s), action_head(a)); softmax over options

Raw scores give near-50/50 probabilities, and v1's always favour "wait" (it still ranks
states well, AUC 0.94). If calibration.json sits next to the head (see fit_lev.py),
the score becomes scale * cos + bias[option] instead.
"""

import functools
import json
import os
import threading

from .base import Choice


def make_head(width: int, depth: int, proj: int, activation: str, layernorm: bool, residual: bool, hidden: int):
    """Same layout and parameter names as clm.heads.make_head, so the checkpoint loads as-is."""
    import torch.nn as nn

    act = {"gelu": nn.GELU, "relu": nn.ReLU, "silu": nn.SiLU}[activation]

    class Head(nn.Module):
        def __init__(self):
            super().__init__()
            self.inp = nn.Linear(hidden, width)
            self.hidden = nn.ModuleList(nn.Linear(width, width) for _ in range(depth - 2))
            self.norms = nn.ModuleList((nn.LayerNorm(width) if layernorm else nn.Identity()) for _ in range(depth - 2))
            self.out = nn.Linear(width, proj)
            self.act = act()
            self.residual = residual

        def forward(self, x):
            x = self.act(self.inp(x))
            for lin, nrm in zip(self.hidden, self.norms):
                h = self.act(nrm(lin(x)))
                x = x + h if self.residual else h
            return self.out(x)

    return Head()


@functools.cache
def load_encoder(name: str, device: str):
    """One frozen encoder shared by every Lev head (Qwen3-8B is 16 GB)."""
    import torch
    from transformers import AutoModel, AutoTokenizer

    tok = AutoTokenizer.from_pretrained(name)
    tok.padding_side = "left"  # so the last position is every row's last real token
    dtype = torch.bfloat16 if device == "cuda" else torch.float32
    return tok, AutoModel.from_pretrained(name, dtype=dtype).to(device).eval(), threading.Lock()


class LevBackend:
    kind = "clm"

    def __init__(self, id: str, head_path: str, state_only: bool = False, key_actions: bool = False) -> None:
        """state_only: the head was trained on the state text alone (no instructions appended).
        key_actions: the head was trained with the option keys ("jump") as action texts, not their descriptions."""
        import torch

        self.torch = torch
        self.id = id
        self.params = "8B + head"
        self.head_path = head_path = os.path.expanduser(head_path)
        self.state_only = state_only
        self.key_actions = key_actions
        encoder = os.environ.get("LEV_ENCODER", "Qwen/Qwen3-8B")
        self.description = f"Lev ({os.path.basename(head_path)}) on {encoder}, CLM-style"
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        ck = torch.load(head_path, map_location="cpu")
        cfg = dict(ck["cfg"])
        kw = dict(
            width=cfg["width"], depth=cfg["depth"],
            proj=ck.get("projection_dim", cfg.get("projection_dim", 512)),
            activation=cfg.get("activation", "gelu"), layernorm=cfg.get("layernorm", False),
            residual=cfg.get("residual", False), hidden=cfg.get("hidden_size", 4096),
        )
        self.state_head, self.action_head = make_head(**kw), make_head(**kw)
        self.state_head.load_state_dict(ck["state_head"])
        self.action_head.load_state_dict(ck["action_head"])
        self.state_head.eval().to(self.device)
        self.action_head.eval().to(self.device)
        self.scale = float(torch.as_tensor(ck["logit_scale"]).float().exp().clamp(max=100.0))
        calib = os.path.join(os.path.dirname(head_path), "calibration.json")
        self.calibration = json.load(open(calib)) if os.path.exists(calib) else None

        self.tok, self.encoder, self.lock = load_encoder(encoder, self.device)
        self.action_cache: dict[str, "torch.Tensor"] = {}  # option text -> projected, normalised vector

    def _embed(self, texts: list[str]):
        torch = self.torch
        batch = self.tok(texts, return_tensors="pt", padding=True).to(self.device)
        out = self.encoder(**batch).last_hidden_state[:, -1].float()
        return torch.nn.functional.normalize(out, dim=-1), int(batch["attention_mask"].sum())

    def cosines(self, state: str, instructions: str, options: dict[str, str]) -> list[float]:
        """cos(state_head(s), action_head(a)) for each option, in order."""
        torch = self.torch
        texts = [k if self.key_actions else options[k] or k for k in options]
        if self.state_only:
            instructions = ""
        state_text = f"{state.strip()}\n\n{instructions.strip()}" if state.strip() and instructions.strip() else state or instructions
        with self.lock, torch.no_grad():
            # One text per forward pass: padding shifts the embeddings, and the flap/wait gap is tiny.
            for t in texts:
                if t not in self.action_cache:
                    self.action_cache[t] = torch.nn.functional.normalize(self.action_head(self._embed([t])[0]), dim=-1)[0]
            emb, self.last_tokens = self._embed([state_text])
            zs = torch.nn.functional.normalize(self.state_head(emb), dim=-1)[0]
            za = torch.stack([self.action_cache[t] for t in texts])
            return (za @ zs).tolist()

    def choose(self, state: str, instructions: str, options: dict[str, str]) -> Choice:
        torch = self.torch
        keys = list(options)
        cos = torch.tensor(self.cosines(state, instructions, options))
        c = self.calibration
        if c:
            logits = c["scale"] * cos + torch.tensor([c["bias"].get(k, 0.0) for k in keys])
        else:
            logits = self.scale * cos
        probs = torch.softmax(logits, dim=0).tolist()
        return Choice(dict(zip(keys, probs)), input_tokens=self.last_tokens)


class LevRouter:
    """One model id for several games: each request goes to the head trained on its option keys."""

    kind = "clm"

    def __init__(self, id: str, heads: dict[tuple[str, ...], LevBackend]) -> None:
        self.id = id
        self.params = "8B + heads"
        self.heads = {frozenset(k): h for k, h in heads.items()}
        self.description = "Lev on Qwen3-8B: " + ", ".join(f"{'/'.join(k)} -> {os.path.basename(h.head_path)}" for k, h in heads.items())

    def choose(self, state: str, instructions: str, options: dict[str, str]) -> Choice:
        head = self.heads.get(frozenset(options))
        if head is None:  # no head for this game: the safe option (the last one), flagged
            safe = list(options)[-1]
            return Choice({k: float(k == safe) for k in options}, parse_error=True)
        return head.choose(state, instructions, options)
