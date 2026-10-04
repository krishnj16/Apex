"""PerformanceAnalyzer: turns raw question attempts into per-topic statistics.

Every number here is derived from stored attempts; nothing is invented. When there is
too little data, fields are None and `sufficient` is False.
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date
from statistics import median
from typing import Iterable, Optional

from .types import Attempt, ErrorType, PracticeLog, Topic

MIN_ATTEMPTS = 5          # below this, accuracy is reported but not trusted
HALF_LIFE_DAYS = 21.0     # recency weighting for accuracy and error mix
PRIOR_STRENGTH = 6.0      # pseudo-attempts for Bayesian shrinkage toward the prior


@dataclass
class TopicStats:
    topic_id: str
    attempts: int = 0
    correct: int = 0
    incorrect: int = 0
    skipped: int = 0
    raw_accuracy: Optional[float] = None       # correct / answered
    weighted_accuracy: Optional[float] = None  # recency-weighted, shrunk toward prior
    speed_ratio: Optional[float] = None        # median(time / expected) on correct answers
    last_practiced: Optional[date] = None
    minutes_14d: int = 0
    error_counts: dict[ErrorType, float] = field(default_factory=dict)  # recency-weighted
    recent_errors: list[ErrorType] = field(default_factory=list)       # newest first, max 10
    trend: Optional[str] = None                 # improving | declining | flat
    trend_from: Optional[float] = None
    trend_to: Optional[float] = None
    trend_groups: int = 0
    trend_source: str = ""                      # "mocks" | "sessions"

    @property
    def sufficient(self) -> bool:
        return (self.correct + self.incorrect) >= MIN_ATTEMPTS


def _weight(age_days: int) -> float:
    return 0.5 ** (max(age_days, 0) / HALF_LIFE_DAYS)


def prior_for(topic: Topic) -> float:
    """Prior accuracy before any data: the self-assessment, else a coverage-based guess."""
    if topic.self_mastery is not None:
        return min(max(topic.self_mastery, 0.0), 1.0)
    return 0.15 + 0.55 * min(max(topic.coverage, 0.0), 1.0)


def _trend(attempts: list[Attempt]) -> tuple[Optional[str], Optional[float], Optional[float], int, str]:
    """Accuracy per source (mock or session), compared across the last three sources."""
    mocks = [a for a in attempts if a.source_kind == "mock" and a.correct is not None]
    pool, label = (mocks, "mocks") if len({a.source_id for a in mocks}) >= 3 else (
        [a for a in attempts if a.correct is not None], "sessions")
    groups: dict[str, list[Attempt]] = defaultdict(list)
    for a in pool:
        groups[a.source_id or a.on.isoformat()].append(a)
    ordered = sorted(groups.values(), key=lambda g: min(x.on for x in g))
    ordered = [g for g in ordered if len(g) >= 2][-3:]
    if len(ordered) < 3:
        return None, None, None, len(ordered), label
    accs = [sum(1 for a in g if a.correct) / len(g) for g in ordered]
    delta = accs[-1] - accs[0]
    direction = "declining" if delta <= -0.05 else "improving" if delta >= 0.05 else "flat"
    return direction, accs[0], accs[-1], len(ordered), label


class PerformanceAnalyzer:
    def analyze(
        self,
        topics: Iterable[Topic],
        attempts: Iterable[Attempt],
        logs: Iterable[PracticeLog],
        today: date,
    ) -> dict[str, TopicStats]:
        by_topic: dict[str, list[Attempt]] = defaultdict(list)
        for a in attempts:
            if a.on <= today:
                by_topic[a.topic_id].append(a)
        logs_by_topic: dict[str, list[PracticeLog]] = defaultdict(list)
        for log in logs:
            if log.on <= today:
                logs_by_topic[log.topic_id].append(log)

        result: dict[str, TopicStats] = {}
        for topic in topics:
            result[topic.id] = self._topic(topic, by_topic[topic.id], logs_by_topic[topic.id], today)
        return result

    def _topic(self, topic: Topic, atts: list[Attempt], logs: list[PracticeLog], today: date) -> TopicStats:
        s = TopicStats(topic_id=topic.id, attempts=len(atts))
        w_correct = w_answered = 0.0
        errors: Counter = Counter()
        ratios: list[float] = []
        for a in sorted(atts, key=lambda x: x.on, reverse=True):
            w = _weight((today - a.on).days)
            if a.correct is None:
                s.skipped += 1
                continue
            w_answered += w
            if a.correct:
                s.correct += 1
                w_correct += w
                if a.time_sec and a.expected_time_sec:
                    ratios.append(a.time_sec / a.expected_time_sec)
            else:
                s.incorrect += 1
                et = a.error_type or ErrorType.UNKNOWN
                errors[et] += w
                if len(s.recent_errors) < 10:
                    s.recent_errors.append(et)

        answered = s.correct + s.incorrect
        if answered:
            s.raw_accuracy = s.correct / answered
        prior = prior_for(topic)
        s.weighted_accuracy = (w_correct + PRIOR_STRENGTH * prior) / (w_answered + PRIOR_STRENGTH)
        if len(ratios) >= 3:
            s.speed_ratio = median(ratios)
        s.error_counts = dict(errors)

        dates = [a.on for a in atts] + [l.on for l in logs]
        s.last_practiced = max(dates) if dates else None
        s.minutes_14d = sum(l.minutes for l in logs if (today - l.on).days < 14)
        s.trend, s.trend_from, s.trend_to, s.trend_groups, s.trend_source = _trend(atts)
        return s


def mastery_estimate(topic: Topic, stats: TopicStats) -> float:
    """Blend of performance and coverage. Coverage alone never counts as mastery."""
    acc = stats.weighted_accuracy if stats.weighted_accuracy is not None else prior_for(topic)
    # Coverage can lift mastery only up to (accuracy + 0.2): high coverage != high performance.
    return min(max(0.7 * acc + 0.3 * min(topic.coverage, acc + 0.2), 0.0), 1.0)


def days_since(d: Optional[date], today: date) -> Optional[int]:
    return None if d is None else max((today - d).days, 0)


def pct(x: Optional[float]) -> str:
    return "n/a" if x is None or math.isnan(x) else f"{round(x * 100)}%"
