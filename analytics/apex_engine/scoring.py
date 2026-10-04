"""PriorityScorer: one unified score for every candidate activity across all exams.

score = 100 * weighted_geometric_mean(value factors)
            * user_priority * consistency_boost * readiness_fit * carryover

A weighted geometric mean keeps the multiplicative intent of the spec ("urgency x
importance x weakness ...") while staying tunable: a factor's weight is its exponent.
Every factor lies in [FLOOR, 1], so no single factor can zero a score.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from .performance import TopicStats, days_since, mastery_estimate, pct
from .types import Exam, SkippedTask, Subject, Topic

FLOOR = 0.05
NO_HISTORY_RECENCY = 0.6


@dataclass(frozen=True)
class ScoringConfig:
    weights: dict[str, float] = field(default_factory=lambda: {
        "urgency": 2.0, "importance": 1.0, "need": 2.0,
        "recency": 1.0, "benefit": 1.0, "prerequisite": 0.5,
    })
    urgency_tau_days: float = 75.0      # urgency = exp(-days / tau)
    crunch_days: int = 7                # urgency = 1 inside this window
    maintenance_share: float = 0.35     # exam urgency below this share of the top exam -> maintenance mode
    consistency_max_boost: float = 0.6
    carryover_boost: float = 0.1
    subject_repeat_decay: float = 0.75  # per extra task from the same subject in one day


def clamp(x: float, lo: float = FLOOR, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def exam_urgency(exam: Exam, today: date, cfg: ScoringConfig) -> Optional[float]:
    days = (exam.exam_date - today).days
    if days < 0 or not exam.active:
        return None
    if days <= cfg.crunch_days:
        return 1.0
    return clamp(math.exp(-days / cfg.urgency_tau_days), 0.08)


@dataclass
class TopicScore:
    score: float
    factors: dict[str, float]
    reasons: list[str]
    maintenance_mode: bool


class PriorityScorer:
    def __init__(self, cfg: ScoringConfig | None = None):
        self.cfg = cfg or ScoringConfig()

    # --- individual factors -------------------------------------------------
    def importance(self, topic: Topic, subject: Subject) -> float:
        return clamp(topic.importance / 5 * subject.importance)

    def need(self, topic: Topic, stats: TopicStats) -> tuple[float, list[str]]:
        reasons: list[str] = []
        m = mastery_estimate(topic, stats)
        need = 1 - m
        answered = stats.correct + stats.incorrect
        if stats.sufficient:
            reasons.append(f"Recent accuracy {pct(stats.raw_accuracy)} over {answered} answered questions.")
        if stats.trend == "declining":
            need += min(0.25, abs((stats.trend_to or 0) - (stats.trend_from or 0)))
            reasons.append(f"Accuracy moved from {pct(stats.trend_from)} to {pct(stats.trend_to)} "
                           f"across your last {stats.trend_groups} {stats.trend_source}.")
        elif stats.trend == "improving":
            need -= 0.05
        if stats.speed_ratio is not None and stats.speed_ratio >= 1.25:
            need += 0.1
        return clamp(need), reasons

    def recency(self, topic: Topic, stats: TopicStats, today: date) -> tuple[float, list[str]]:
        d = days_since(stats.last_practiced, today)
        if d is None:
            # No history in APEX is "unknown", not "maximally overdue".
            return NO_HISTORY_RECENCY, []
        m = mastery_estimate(topic, stats)
        interval = 1 + 6 * m         # stronger topics tolerate longer gaps
        r = clamp(1 - math.exp(-d / interval), 0.1)
        msg = [f"Last practised {d} day{'s' if d != 1 else ''} ago."] if d >= 3 else []
        return r, msg

    def benefit(self, topic: Topic, stats: TopicStats) -> float:
        m = mastery_estimate(topic, stats)
        practice = 0.4 + 0.6 * 4 * m * (1 - m)       # mid-mastery topics move fastest
        learn = 0.5 + 0.4 * (1 - topic.coverage) if topic.coverage < 0.8 else 0.0
        return clamp(max(practice, learn))

    def prerequisite(self, topic: Topic, topics: dict[str, Topic], stats: dict[str, TopicStats],
                     dependents: dict[str, int]) -> tuple[float, list[str]]:
        f, reasons = 1.0, []
        prereqs = [topics[p] for p in topic.prerequisite_ids if p in topics]
        if prereqs:
            weakest = min(prereqs, key=lambda p: mastery_estimate(p, stats[p.id]))
            pm = mastery_estimate(weakest, stats[weakest.id])
            f = 0.5 + 0.5 * pm
            if pm < 0.5:
                reasons.append(f"Prerequisite {weakest.name} is still weak; it may be the better first step.")
        if dependents.get(topic.id):
            f = min(1.0, f * 1.1)
        return clamp(f), reasons

    def consistency(self, subject: Subject, last_subject_day: Optional[date], today: date,
                    maintenance: bool) -> tuple[float, list[str]]:
        d = days_since(last_subject_day, today)
        if d is None:
            gap = 1.0                # never logged: moderate pull, not maximal
        else:
            gap = max(0.0, d / max(subject.cadence_days, 1) - 1)
        boost = 1 + self.cfg.consistency_max_boost * min(gap, 2.0) / 2
        if boost <= 1.0:
            return 1.0, []
        if d is None:
            msg = f"No {subject.name} session logged yet; target is every {subject.cadence_days} days."
        else:
            msg = f"No {subject.name} session in {d} days; target is every {subject.cadence_days} days."
        return boost, ([msg] if maintenance or gap >= 1 else [])

    # --- combined -----------------------------------------------------------
    def score_topic(self, *, topic: Topic, subject: Subject, exam: Exam, urgency: float, top_urgency: float,
                    stats: TopicStats, all_topics: dict[str, Topic], all_stats: dict[str, TopicStats],
                    dependents: dict[str, int], last_subject_day: Optional[date],
                    skipped: list[SkippedTask], today: date) -> TopicScore:
        cfg = self.cfg
        maintenance = urgency < cfg.maintenance_share * top_urgency
        need, need_r = self.need(topic, stats)
        rec, rec_r = self.recency(topic, stats, today)
        prereq, pre_r = self.prerequisite(topic, all_topics, all_stats, dependents)
        factors = {
            "urgency": urgency,
            "importance": self.importance(topic, subject),
            "need": need,
            "recency": rec,
            "benefit": self.benefit(topic, stats),
            "prerequisite": prereq,
        }
        w = cfg.weights
        log_sum = sum(w[k] * math.log(clamp(v)) for k, v in factors.items())
        base = math.exp(log_sum / sum(w[k] for k in factors))

        user = max(0.3, min(2.0, topic.user_priority * subject.user_priority * exam.user_priority))
        cons, cons_r = self.consistency(subject, last_subject_day, today, maintenance)
        carry, carry_r = 1.0, []
        recent_skips = [s for s in skipped if s.topic_id == topic.id and 0 < (today - s.on).days <= 3]
        if recent_skips:
            s = max(recent_skips, key=lambda x: x.on)
            if s.reason != "too_tired":
                carry = 1 + cfg.carryover_boost
            why = f" ({s.reason.replace('_', ' ')})" if s.reason else ""
            carry_r.append(f"Skipped on {s.on.strftime('%d %b')}{why}; re-evaluated rather than copied forward.")

        factors.update({"user_priority": user, "consistency": cons, "carryover": carry})
        score = 100 * base * user * cons * carry

        days_left = (exam.exam_date - today).days
        if maintenance:
            urg_r = [f"{exam.name} is {days_left} days away, so {subject.name} stays at maintenance level."]
        elif urgency >= top_urgency:
            urg_r = [f"{exam.name} is your most urgent exam ({days_left} days)."]
        else:
            urg_r = [f"{exam.name} is {days_left} days away."]

        reasons = need_r + rec_r + cons_r + pre_r + carry_r + urg_r
        return TopicScore(score, {k: round(v, 4) for k, v in factors.items()}, reasons, maintenance)
