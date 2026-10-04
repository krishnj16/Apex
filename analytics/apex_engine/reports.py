"""MockAnalyzer and WeeklyAnalyzer. Descriptive statistics only: no predictions."""
from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from statistics import mean, median
from typing import Optional

from .types import Candidate, ErrorType


# ---------------------------------------------------------------- mocks
@dataclass(frozen=True)
class MockQuestion:
    section: str
    topic_id: Optional[str]
    topic_name: str
    attempted: bool
    correct: Optional[bool]
    time_sec: Optional[float] = None
    error_type: Optional[ErrorType] = None


@dataclass(frozen=True)
class MockSectionResult:
    name: str
    score: float
    attempted: int
    correct: int
    incorrect: int
    skipped: int


@dataclass(frozen=True)
class MockRecord:
    id: str
    name: str
    taken_on: date
    total_score: float
    sections: tuple[MockSectionResult, ...] = ()
    questions: tuple[MockQuestion, ...] = ()


def _acc(c: int, i: int) -> Optional[float]:
    return round(c / (c + i), 4) if c + i else None


class MockAnalyzer:
    def analyze(self, mocks: list[MockRecord]) -> dict:
        ms = sorted(mocks, key=lambda m: (m.taken_on, m.id))
        if not ms:
            return {"count": 0, "message": "No mock data yet. Complete your first mock to unlock analysis."}

        trajectory = []
        for m in ms:
            c = sum(s.correct for s in m.sections)
            i = sum(s.incorrect for s in m.sections)
            qt = [q.time_sec for q in m.questions if q.attempted and q.time_sec]
            trajectory.append({
                "mock_id": m.id, "name": m.name, "date": m.taken_on.isoformat(), "score": m.total_score,
                "attempted": sum(s.attempted for s in m.sections), "accuracy": _acc(c, i),
                "avg_time_sec": round(mean(qt), 1) if qt else None,
                "sections": {s.name: {"score": s.score, "accuracy": _acc(s.correct, s.incorrect),
                                      "attempted": s.attempted} for s in m.sections},
            })

        questions = [q for m in ms for q in m.questions]
        topic: dict[str, dict] = defaultdict(lambda: {"correct": 0, "incorrect": 0, "skipped": 0})
        errors: Counter = Counter()
        for q in questions:
            t = topic[q.topic_name]
            if not q.attempted:
                t["skipped"] += 1
            elif q.correct:
                t["correct"] += 1
            else:
                t["incorrect"] += 1
                errors[(q.error_type or ErrorType.UNKNOWN).value] += 1
        topic_acc = sorted(
            ({"topic": k, **v, "accuracy": _acc(v["correct"], v["incorrect"]),
              "n": v["correct"] + v["incorrect"]} for k, v in topic.items()),
            key=lambda x: (x["accuracy"] is None, x["accuracy"] or 0))

        result = {
            "count": len(ms), "trajectory": trajectory, "topic_accuracy": topic_acc,
            "error_distribution": dict(errors.most_common()),
            "selection": self._selection(questions), "summary": self._summary(trajectory),
        }
        return result

    @staticmethod
    def _selection(qs: list[MockQuestion]) -> dict:
        timed = [q for q in qs if q.attempted and q.time_sec]
        if len(timed) < 10:
            return {"sufficient": False, "message": "Log question times for at least 10 questions."}
        med = median(q.time_sec for q in timed)
        wrong = [q.time_sec for q in timed if not q.correct]
        right = [q.time_sec for q in timed if q.correct]
        sinks = [q for q in timed if not q.correct and q.time_sec >= 1.5 * med]
        return {
            "sufficient": True, "median_time_sec": round(med, 1),
            "avg_time_correct_sec": round(mean(right), 1) if right else None,
            "avg_time_incorrect_sec": round(mean(wrong), 1) if wrong else None,
            "time_sinks": len(sinks),
            "time_sink_minutes": round(sum(q.time_sec for q in sinks) / 60, 1),
            "skip_rate": round(sum(1 for q in qs if not q.attempted) / len(qs), 4),
        }

    @staticmethod
    def _summary(tr: list[dict]) -> list[str]:
        if len(tr) < 2:
            return ["One mock logged. Trends appear after the second."]
        last = tr[-5:]
        d = last[-1]["score"] - last[0]["score"]
        out = [f"Your last {len(last)} mock scores changed by {d:+g} ({last[0]['score']:g} to {last[-1]['score']:g})."]
        accs = [t["accuracy"] for t in last if t["accuracy"] is not None]
        if len(accs) >= 2:
            out.append(f"Accuracy moved from {round(accs[0]*100)}% to {round(accs[-1]*100)}% over the same mocks.")
        out.append(f"Based on {len(tr)} mocks. Small samples can swing widely; this is not a prediction.")
        return out


# ---------------------------------------------------------------- weekly
@dataclass(frozen=True)
class WeekTask:
    on: date
    exam: str
    subject: str
    planned_min: int
    actual_min: int
    status: str            # completed | partial | skipped | pending


@dataclass(frozen=True)
class WeekAttempt:
    on: date
    topic: str
    correct: Optional[bool]


@dataclass(frozen=True)
class RehabEntry:
    on: date
    program: str           # e.g. "Leg", "Wrist"
    status: str            # completed | partial | skipped


@dataclass
class WeeklyInput:
    week_start: date
    tasks: list[WeekTask] = field(default_factory=list)
    attempts: list[WeekAttempt] = field(default_factory=list)   # this + previous week
    rehab: list[RehabEntry] = field(default_factory=list)
    rehab_programs: list[str] = field(default_factory=list)
    ranking: list[Candidate] = field(default_factory=list)


MIN_WEEK_ATTEMPTS = 5


class WeeklyAnalyzer:
    def analyze(self, w: WeeklyInput) -> dict:
        end = w.week_start + timedelta(days=7)
        prev = w.week_start - timedelta(days=7)
        tasks = [t for t in w.tasks if w.week_start <= t.on < end]
        planned = sum(t.planned_min for t in tasks)
        done = sum(t.actual_min for t in tasks if t.status in ("completed", "partial"))
        completed_n = sum(1 for t in tasks if t.status == "completed")

        sessions: dict[str, Counter] = defaultdict(Counter)
        for t in tasks:
            if t.status in ("completed", "partial"):
                sessions[t.exam][t.subject] += 1

        def acc_by_topic(lo: date, hi: date) -> dict[str, tuple[float, int]]:
            agg: dict[str, list[int]] = defaultdict(lambda: [0, 0])
            for a in w.attempts:
                if lo <= a.on < hi and a.correct is not None:
                    agg[a.topic][0] += int(a.correct)
                    agg[a.topic][1] += 1
            return {k: (c / n, n) for k, (c, n) in agg.items() if n >= MIN_WEEK_ATTEMPTS}

        now, before = acc_by_topic(w.week_start, end), acc_by_topic(prev, w.week_start)
        changes = sorted(((k, before[k][0], now[k][0]) for k in now if k in before), key=lambda x: x[2] - x[1])
        improvement = problem = None
        if changes:
            k, a, b = changes[-1]
            if b - a > 0:
                improvement = f"{k} accuracy increased from {round(a*100)}% to {round(b*100)}%."
            k, a, b = changes[0]
            if b - a < 0:
                problem = f"{k} accuracy fell from {round(a*100)}% to {round(b*100)}%."
        if problem is None:
            weakest = min(now.items(), key=lambda kv: kv[1][0], default=None)
            if weakest and weakest[1][0] < 0.6:
                problem = f"{weakest[0]} accuracy is {round(weakest[1][0]*100)}% this week ({weakest[1][1]} questions)."

        rehab = {}
        for p in w.rehab_programs:
            entries = [r for r in w.rehab if r.program == p and w.week_start <= r.on < end]
            rehab[p] = {"completed": sum(1 for r in entries if r.status == "completed"),
                        "partial": sum(1 for r in entries if r.status == "partial"), "days": 7}

        focus, seen = [], set()
        for c in w.ranking:
            label = c.title.split(" — ")[0]
            if label not in seen:
                seen.add(label)
                focus.append({"title": c.title, "score": c.score, "why": c.reasons[:2]})
            if len(focus) == 5:
                break

        return {
            "week_start": w.week_start.isoformat(),
            "study": {"planned_min": planned, "completed_min": done,
                      "completion_rate": round(completed_n / len(tasks), 4) if tasks else None,
                      "tasks": len(tasks)},
            "sessions": {e: dict(s) for e, s in sessions.items()},
            "topic_changes": [{"topic": k, "from": round(a, 4), "to": round(b, 4)} for k, a, b in changes],
            "biggest_improvement": improvement or "Not enough comparable data across the last two weeks.",
            "biggest_problem": problem or "No topic stood out negatively with enough data.",
            "rehab": rehab, "next_week_focus": focus,
        }
