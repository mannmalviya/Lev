"""Text baseline on a llama.cpp server (Qwen3.6-35B-A3B by default, see start-llama-baseline.sh).

Same prompt as the Qwen3-4B baseline. We pre-fill the reply with `{"answer": "` and ask for
one token, so the model only writes the start of the option name. Probabilities come from
that token's top logprobs.
"""

import json
import math
import os
import urllib.request

from .base import Choice
from .baseline import PROMPT


class LlamaCppBackend:
    kind = "llamacpp"

    def __init__(self) -> None:
        self.url = os.environ.get("LLAMA_URL", "http://127.0.0.1:8001") + "/v1/chat/completions"
        self.id = os.environ.get("LLAMA_ID", "baseline-qwen3.6-35b-a3b")
        self.params = os.environ.get("LLAMA_PARAMS", "35B (3B active)")
        self.description = "Qwen3.6-35B-A3B on llama.cpp, thinking off, picks the option name"

    def choose(self, state: str, instructions: str, options: dict[str, str]) -> Choice:
        names = list(options)
        user = PROMPT.format(
            state=state,
            instructions=instructions,
            options="\n".join(f"- {k}: {v}" for k, v in options.items()),
            names=", ".join(names),
        )
        body = {
            "messages": [{"role": "user", "content": user}, {"role": "assistant", "content": '{"answer": "'}],
            "temperature": 0,
            "max_tokens": 1,
            "logprobs": True,
            "top_logprobs": 20,
            "chat_template_kwargs": {"enable_thinking": False},
        }
        req = urllib.request.Request(self.url, json.dumps(body).encode(), {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            r = json.load(resp)
        top = r["choices"][0]["logprobs"]["content"][0]["top_logprobs"]
        usage = r.get("usage", {})
        n_in, n_out = usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)

        # Each option gets the best token that starts its name ("fl" -> "flap").
        p = {k: 0.0 for k in names}
        for t in top:
            tok = t["token"].strip()
            for k in names:
                if tok and k.startswith(tok):
                    p[k] = max(p[k], math.exp(t["logprob"]))
        total = sum(p.values())
        if total == 0:
            safe = names[-1]
            return Choice({k: float(k == safe) for k in names}, parse_error=True, input_tokens=n_in, output_tokens=n_out)
        return Choice({k: v / total for k, v in p.items()}, input_tokens=n_in, output_tokens=n_out)
