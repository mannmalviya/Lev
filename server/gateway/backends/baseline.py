"""Text baseline: an instruct LLM (Qwen3-4B by default) writes a short JSON answer, thinking off.

Probabilities come from the logits at the step where the option name starts.
If the text does not parse, we return the safe option (the last one) and flag parse_error.
"""

import json
import os
import re
import threading

from .base import Choice

PROMPT = """State:
{state}

Question: {instructions}

Options:
{options}

Answer with JSON only, in this exact form: {{"answer": "<option>"}} where <option> is one of: {names}."""

ANSWER_RE = re.compile(r'"answer"\s*:\s*"([^"]*)"')
ANSWER_START_RE = re.compile(r'"answer"\s*:\s*"$')


class BaselineBackend:
    kind = "torch"

    def __init__(self) -> None:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.torch = torch
        self.hf_id = os.environ.get("BASELINE_HF_MODEL", "Qwen/Qwen3-4B")
        self.id = os.environ.get("BASELINE_ID", "baseline-qwen3-4b")
        self.params = os.environ.get("BASELINE_PARAMS", "4B")
        self.description = f"{self.hf_id}, thinking off, writes a short text answer"
        self.max_new_tokens = int(os.environ.get("BASELINE_MAX_NEW_TOKENS", "16"))
        self.tok = AutoTokenizer.from_pretrained(self.hf_id)
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.bfloat16 if device == "cuda" else torch.float32
        self.model = AutoModelForCausalLM.from_pretrained(self.hf_id, dtype=dtype).to(device).eval()
        self.lock = threading.Lock()

    def _first_token(self, prefix_text: str, option: str) -> int:
        prefix_ids = self.tok.encode(prefix_text, add_special_tokens=False)
        ids = self.tok.encode(prefix_text + option, add_special_tokens=False)
        n = len(prefix_ids)
        # The first token that differs from the prefix is where the option starts.
        for i in range(min(n, len(ids))):
            if ids[i] != prefix_ids[i]:
                return ids[i]
        return ids[n]

    def choose(self, state: str, instructions: str, options: dict[str, str]) -> Choice:
        torch = self.torch
        names = list(options)
        user = PROMPT.format(
            state=state,
            instructions=instructions,
            options="\n".join(f"- {k}: {v}" for k, v in options.items()),
            names=", ".join(names),
        )
        text = self.tok.apply_chat_template(
            [{"role": "user", "content": user}], tokenize=False, add_generation_prompt=True, enable_thinking=False
        )
        inputs = self.tok(text, return_tensors="pt").to(self.model.device)
        with self.lock, torch.no_grad():
            out = self.model.generate(
                **inputs,
                max_new_tokens=self.max_new_tokens,
                do_sample=False,
                output_scores=True,
                return_dict_in_generate=True,
                pad_token_id=self.tok.eos_token_id,
            )
        gen_ids = out.sequences[0, inputs["input_ids"].shape[1] :].tolist()
        reply = self.tok.decode(gen_ids, skip_special_tokens=True)
        n_in, n_out = inputs["input_ids"].shape[1], len(gen_ids)

        match = ANSWER_RE.search(reply)
        if not match or match.group(1) not in options:
            safe = names[-1]
            return Choice({k: float(k == safe) for k in names}, parse_error=True, input_tokens=n_in, output_tokens=n_out, extra={"reply": reply})

        # Find the generation step right after `"answer": "` and read the option-start logits there.
        for step in range(len(gen_ids)):
            prefix_text = self.tok.decode(gen_ids[:step], skip_special_tokens=True)
            if ANSWER_START_RE.search(prefix_text):
                logits = out.scores[step][0].float()
                first = {k: self._first_token(prefix_text, k) for k in names}
                picked = torch.tensor([logits[t] for t in first.values()])
                probs = torch.softmax(picked, dim=0).tolist()
                return Choice(dict(zip(names, probs)), input_tokens=n_in, output_tokens=n_out)

        # Parsed but could not locate the step (odd tokenization): all mass on the written answer.
        return Choice({k: float(k == match.group(1)) for k in names}, input_tokens=n_in, output_tokens=n_out)


def _selftest() -> None:
    b = BaselineBackend()
    c = b.choose(
        "bird_y=300 bird_vy=6 falling\npipe_dx=40 gap_top=150 gap_bottom=250 dy_to_gap_center=+100 below_center",
        "Fly the bird through the gap of the next pipe. Pick the action for this moment.",
        {"flap": "Flap: the bird jumps up.", "wait": "Wait: do nothing, the bird falls."},
    )
    print(json.dumps(c.__dict__, indent=2))


if __name__ == "__main__":
    _selftest()
