"""Random probabilities, for frontend testing. FAKE_DELAY_MS adds a pretend model time."""

import os
import random
import time

from .base import Choice


class FakeBackend:
    id = "fake"
    kind = "fake"
    params = None
    description = "Random probabilities, for frontend testing"

    def __init__(self) -> None:
        self.delay_s = float(os.environ.get("FAKE_DELAY_MS", "5")) / 1000

    def choose(self, state: str, instructions: str, options: dict[str, str]) -> Choice:
        if self.delay_s:
            time.sleep(self.delay_s)
        weights = [random.random() for _ in options]
        total = sum(weights)
        return Choice(
            probabilities={k: w / total for k, w in zip(options, weights)},
            input_tokens=len(state.split()) + len(instructions.split()),
        )
