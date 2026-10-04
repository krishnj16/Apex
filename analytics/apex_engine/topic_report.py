"""Per-topic performance report: the multi-dimensional topic model shown in the UI."""
from __future__ import annotations

from .diagnosis import diagnose
from .performance import PerformanceAnalyzer, TopicStats, mastery_estimate
from .serialization import to_json
from .types import PlanRequest


def topic_report(req: PlanRequest) -> list[dict]:
    stats = PerformanceAnalyzer().analyze(req.topics, req.attempts, req.practice_logs, req.today)
    subjects = {s.id: s for s in req.subjects}
    out = []
    for t in req.topics:
        s = stats.get(t.id) or TopicStats(topic_id=t.id)
        subj = subjects.get(t.subject_id)
        dx = diagnose(t, s, subj.kind) if subj else None
        out.append({
            "topic_id": t.id, "name": t.name, "subject_id": t.subject_id,
            "coverage": t.coverage, "mastery": round(mastery_estimate(t, s), 4),
            "sufficient": s.sufficient, "attempts": s.attempts, "correct": s.correct,
            "incorrect": s.incorrect, "skipped": s.skipped,
            "accuracy": None if s.raw_accuracy is None else round(s.raw_accuracy, 4),
            "speed_ratio": None if s.speed_ratio is None else round(s.speed_ratio, 3),
            "trend": s.trend, "trend_from": s.trend_from, "trend_to": s.trend_to,
            "last_practiced": s.last_practiced.isoformat() if s.last_practiced else None,
            "minutes_14d": s.minutes_14d,
            "error_counts": {k.value: round(v, 3) for k, v in s.error_counts.items()},
            "diagnosis": to_json(dx) if dx else None,
        })
    return out
