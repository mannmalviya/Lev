"""Lev: our trained CLM-format head (thomasliao/Lev, text_state_flappy_head.pt) on a frozen Qwen3-8B.

Follows Contrastive-LM's inference exactly (github.com/Contrastive-LM/CLM, src/clm):
- state text  = state + "\\n\\n" + instructions      (schema.state_text)
- action text = the option's description, else its key (schema.candidates)
- encoder     = Qwen3-8B last-token hidden state, L2-normalised (embedder.py, vLLM pooling)
- score       = exp(logit_scale) * cos(state_head(s), action_head(a)); softmax over options
"""

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


class LevBackend:
    kind = "clm"

    def __init__(self) -> None:
        import torch
        from transformers import AutoModel, AutoTokenizer

        self.torch = torch
        self.id = os.environ.get("LEV_ID", "ours-lev-8b")
        self.params = "8B + head"
        head_path = os.environ.get("LEV_HEAD", os.path.expanduser("~/models/lev/text_state_flappy_head.pt"))
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

        self.tok = AutoTokenizer.from_pretrained(encoder)
        self.tok.padding_side = "left"  # so the last position is every row's last real token
        dtype = torch.bfloat16 if self.device == "cuda" else torch.float32
        self.encoder = AutoModel.from_pretrained(encoder, dtype=dtype).to(self.device).eval()
        self.lock = threading.Lock()
        self.action_cache: dict[str, "torch.Tensor"] = {}  # option text -> projected, normalised vector

    def _embed(self, texts: list[str]):
        torch = self.torch
        batch = self.tok(texts, return_tensors="pt", padding=True).to(self.device)
        out = self.encoder(**batch).last_hidden_state[:, -1].float()
        return torch.nn.functional.normalize(out, dim=-1), int(batch["attention_mask"].sum())

    def choose(self, state: str, instructions: str, options: dict[str, str]) -> Choice:
        torch = self.torch
        keys = list(options)
        texts = [options[k] or k for k in keys]
        state_text = f"{state.strip()}\n\n{instructions.strip()}" if state.strip() and instructions.strip() else state or instructions
        with self.lock, torch.no_grad():
            missing = [t for t in dict.fromkeys(texts) if t not in self.action_cache]
            emb, tokens = self._embed([state_text] + missing)
            for t, e in zip(missing, emb[1:]):
                self.action_cache[t] = torch.nn.functional.normalize(self.action_head(e[None]), dim=-1)[0]
            zs = torch.nn.functional.normalize(self.state_head(emb[:1]), dim=-1)[0]
            za = torch.stack([self.action_cache[t] for t in texts])
            probs = torch.softmax(self.scale * (za @ zs), dim=0).tolist()
        return Choice(dict(zip(keys, probs)), input_tokens=tokens)
