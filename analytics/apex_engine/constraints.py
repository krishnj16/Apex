"""ConstraintSolver: how much study is feasible today, and where blocks go.

Guarantees (covered by tests):
  * total planned study <= study_max, <= user-entered available time, <= feasible free time
  * rejuvenation_min is never consumed by study or breaks
  * no block overlaps a class, rehab session, commitment, or user-pinned block
"""
from __future__ import annotations

from dataclasses import dataclass

from .types import Candidate, DayConstraints, FixedBlock

MIN_BLOCK = 20


def merge(blocks: list[tuple[int, int]]) -> list[tuple[int, int]]:
    out: list[tuple[int, int]] = []
    for s, e in sorted(blocks):
        if out and s <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], e))
        else:
            out.append((s, e))
    return out


def free_intervals(c: DayConstraints) -> list[tuple[int, int]]:
    busy = merge([(max(b.start, c.day_start), min(b.end, c.day_end))
                  for b in c.fixed_blocks if b.end > c.day_start and b.start < c.day_end])
    free, cursor = [], c.day_start
    for s, e in busy:
        if s > cursor:
            free.append((cursor, s))
        cursor = max(cursor, e)
    if cursor < c.day_end:
        free.append((cursor, c.day_end))
    return free


@dataclass
class Budget:
    free_minutes: int
    fixed_minutes: int
    pinned_study: int
    study_budget: int          # minutes still to allocate (excludes pinned)
    notes: list[str]


class ConstraintSolver:
    def budget(self, c: DayConstraints, block_len: int, ratio: float, low_readiness: bool) -> Budget:
        notes: list[str] = []
        window = c.day_end - c.day_start
        free = sum(e - s for s, e in free_intervals(c))
        pinned = sum(b.end - b.start for b in c.fixed_blocks if b.kind == "pinned_study")
        fixed = window - free - pinned

        # Study blocks need breaks between them; reserve them so rejuvenation stays intact.
        usable = free + pinned - c.rejuvenation_min
        study_cap = int(usable / (1 + c.break_minutes / max(block_len, 1)))
        caps = {"your daily maximum": c.study_max, "feasible free time": study_cap}
        if c.available_study_minutes is not None:
            caps["the time you said you have"] = c.available_study_minutes
        binding = min(caps, key=caps.get)
        total = max(0, min(caps.values()))
        notes.append(f"Study capped at {total} min by {binding}.")
        if low_readiness and total > c.study_min:
            reduced = max(c.study_min, int(total * 0.85))
            notes.append(f"Low readiness: trimmed to {reduced} min (never below your {c.study_min} min minimum).")
            total = reduced
        if total < c.study_min:
            notes.append(f"Only {total} min is feasible today, below your {c.study_min} min minimum. "
                         "The plan fits the time you actually have.")
        if ratio != 1.0:
            notes.append(f"Block lengths include your {ratio:.2f}x duration calibration.")
        return Budget(free, fixed, pinned, max(0, total - pinned), notes)

    def place(self, chosen: list[Candidate], c: DayConstraints, budget_min: int
              ) -> tuple[list[tuple[Candidate, int, int]], list[Candidate]]:
        """Heavier work first, into the earliest slot that fits, with a break after each block."""
        slots = [list(iv) for iv in free_intervals(c)]
        # Hard guarantee: study + one break per block never eats into rejuvenation_min.
        protected_cap = sum(e - s for s, e in slots) - c.rejuvenation_min
        ordered = sorted(chosen, key=lambda x: (-x.cognitive_load, -x.score))
        placed, dropped, used, consumed = [], [], 0, 0
        for cand in ordered:
            remaining = min(budget_min - used, protected_cap - consumed - c.break_minutes)
            want = min(cand.duration, remaining)
            done = False
            for slot in slots:
                room = slot[1] - slot[0]
                dur = min(want, room)
                if dur >= MIN_BLOCK and dur >= 0.5 * cand.duration:
                    start = slot[0]
                    placed.append((cand, start, start + dur))
                    slot[0] = min(slot[1], start + dur + c.break_minutes)
                    used += dur
                    consumed += dur + c.break_minutes
                    done = True
                    break
            if not done:
                dropped.append(cand)
                continue
        placed.sort(key=lambda t: t[1])
        return placed, dropped
