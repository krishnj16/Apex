"""ReadinessAnalyzer and duration calibration.

Readiness is a transparent weighted average of the check-in fields the user filled in.
It adjusts the TYPE and INTENSITY of work. It is not a medical assessment.
"""
from __future__ import annotations

from dataclasses import dataclass
from statistics import median
from typing import Optional

from .types import CheckIn

TARGET_SLEEP_HOURS = 7.5
WEIGHTS = {"sleep_hours": 0.30, "sleep_quality": 0.15, "energy": 0.25, "stress": 0.15, "mental_fatigue": 0.15}


@dataclass
class Readiness:
    score: Optional[float]
    components: dict[str, float]
    notes: list[str]


def compute_readiness(c: Optional[CheckIn]) -> Readiness:
    if c is None:
        return Readiness(None, {}, ["No check-in today; planning with neutral intensity."])
    parts: dict[str, float] = {}
    if c.sleep_hours is not None:
        parts["sleep_hours"] = max(0.0, min(c.sleep_hours / TARGET_SLEEP_HOURS, 1.0))
    if c.sleep_quality is not None:
        parts["sleep_quality"] = (c.sleep_quality - 1) / 4
    if c.energy is not None:
        parts["energy"] = (c.energy - 1) / 9
    if c.stress is not None:
        parts["stress"] = 1 - (c.stress - 1) / 9
    if c.mental_fatigue is not None:
        parts["mental_fatigue"] = 1 - (c.mental_fatigue - 1) / 9
    if not parts:
        return Readiness(None, {}, ["Check-in had no scored fields; planning with neutral intensity."])
    total_w = sum(WEIGHTS[k] for k in parts)
    score = sum(WEIGHTS[k] * v for k, v in parts.items()) / total_w
    notes = [f"Readiness {round(score * 100)}% from {len(parts)} of 5 check-in fields."]
    if score < 0.4:
        notes.append("Low readiness: lighter task types and shorter blocks; total study time is kept.")
    elif score >= 0.75:
        notes.append("High readiness: demanding work is scheduled first.")
    return Readiness(round(score, 4), parts, notes)


NEUTRAL_READINESS = 0.6
MIN_CALIBRATION_SAMPLES = 10


def estimation_ratio(samples: tuple[tuple[int, int], ...]) -> tuple[float, str]:
    """Median actual/planned ratio, shrunk toward 1.0 until there is enough history."""
    valid = [a / p for p, a in samples if p > 0 and a > 0]
    if len(valid) < MIN_CALIBRATION_SAMPLES:
        return 1.0, f"Duration calibration needs {MIN_CALIBRATION_SAMPLES} timed sessions ({len(valid)} so far)."
    raw = median(valid)
    n = len(valid)
    ratio = 1 + (raw - 1) * n / (n + 10)
    ratio = max(0.8, min(ratio, 1.5))
    return round(ratio, 3), f"Your tasks take {raw:.2f}x their estimate (median of {n}); blocks scaled by {ratio:.2f}x."
