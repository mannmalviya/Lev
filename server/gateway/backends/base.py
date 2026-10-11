"""Backend interface (docs/API.md section 6).

Every question type is reduced to one choice over named options:
- choice: the options in `criteria`
- noul:   options "yes" / "no"
- score:  one option per level ("0", "1", ...)
A backend only has to implement `choose`. The gateway shapes the answers.
"""

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class Choice:
    probabilities: dict[str, float]
    parse_error: bool = False
    input_tokens: int = 0
    output_tokens: int = 0
    extra: dict = field(default_factory=dict)


class Backend(Protocol):
    id: str
    kind: str  # "fake" | "torch" | "clm" | "llamacpp"
    params: str | None
    description: str

    def choose(self, state: str, instructions: str, options: dict[str, str]) -> Choice:
        """Return a probability for every key of `options`. They must add up to 1."""
        ...
