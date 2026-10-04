"""RecommendationEngine: assess -> score -> select -> schedule -> explain.

`RecommendationEngine` is an interface; `UnifiedRecommendationEngine` is the V1
deterministic implementation. A future ML ranker can implement the same interface.
"""
from __future__ import annotations

import math
from abc import ABC, abstractmethod
from collections import defaultdict
from datetime import date
from typing import Optional

from .constraints import ConstraintSolver
from .diagnosis import adapt_for_readiness, diagnose
from .performance import PerformanceAnalyzer, TopicStats
from .readiness import NEUTRAL_READINESS, compute_readiness, estimation_ratio
from .scoring import PriorityScorer, ScoringConfig, clamp, exam_urgency
from .types import (TASK_LABEL, TASK_LOAD, BudgetBreakdown, Candidate, GapType, PlanItem, PlanRequest,
                    PlanResult, Subject, TaskType)

BASE_DURATION = {
    TaskType.CONCEPT_LEARNING: 60, TaskType.PRACTICE: 50, TaskType.TIMED_PRACTICE: 45,
    TaskType.QUESTION_SELECTION_PRACTICE: 45, TaskType.REVISION: 40, TaskType.READING: 40,
    TaskType.MOCK_ANALYSIS: 60, TaskType.ERROR_LOG_REVIEW: 30, TaskType.MAINTENANCE_PRACTICE: 30,
}
MAINTENANCE_DURATION = 25
LOW_READINESS_MAX_BLOCK = 45


class RecommendationEngine(ABC):
    @abstractmethod
    def generate(self, req: PlanRequest) -> PlanResult: ...

    @abstractmethod
    def rank(self, req: PlanRequest) -> list[Candidate]:
        """All candidates scored, ignoring today's time constraints."""


class UnifiedRecommendationEngine(RecommendationEngine):
    def __init__(self, config: ScoringConfig | None = None):
        self.cfg = config or ScoringConfig()
        self.scorer = PriorityScorer(self.cfg)
        self.perf = PerformanceAnalyzer()
        self.solver = ConstraintSolver()

    # ------------------------------------------------------------------
    def rank(self, req: PlanRequest, readiness: Optional[float] = None,
             ratio: float = 1.0, max_block: Optional[int] = None) -> list[Candidate]:
        today = req.today
        r = NEUTRAL_READINESS if readiness is None else readiness
        max_block = max_block or req.constraints.max_block
        exams = {e.id: e for e in req.exams}
        urg = {eid: u for eid, e in exams.items() if (u := exam_urgency(e, today, self.cfg)) is not None}
        if not urg:
            return []
        top = max(urg.values())
        subjects = {s.id: s for s in req.subjects if s.exam_id in urg}
        topics = {t.id: t for t in req.topics if t.active and t.subject_id in subjects}
        stats = self.perf.analyze(req.topics, req.attempts, req.practice_logs, today)
        for t in req.topics:
            stats.setdefault(t.id, TopicStats(topic_id=t.id))

        dependents: dict[str, int] = defaultdict(int)
        for t in topics.values():
            for p in t.prerequisite_ids:
                dependents[p] += 1
        last_subject_day: dict[str, date] = {}
        for t in topics.values():
            lp = stats[t.id].last_practiced
            if lp and (t.subject_id not in last_subject_day or lp > last_subject_day[t.subject_id]):
                last_subject_day[t.subject_id] = lp

        cands: list[Candidate] = []
        for t in topics.values():
            subj = subjects[t.subject_id]
            exam = exams[subj.exam_id]
            ts = self.scorer.score_topic(
                topic=t, subject=subj, exam=exam, urgency=urg[exam.id], top_urgency=top, stats=stats[t.id],
                all_topics=topics, all_stats=stats, dependents=dependents,
                last_subject_day=last_subject_day.get(subj.id), skipped=list(req.skipped), today=today)
            dx = diagnose(t, stats[t.id], subj.kind)
            skip = next((s for s in sorted(req.skipped, key=lambda s: s.on, reverse=True)
                         if s.topic_id == t.id and 0 < (today - s.on).days <= 3), None)
            if skip and skip.reason == "difficult" and dx.task_type != TaskType.CONCEPT_LEARNING:
                dx.task_type, dx.detail = TaskType.REVISION, "Revisit concepts before more questions"
                dx.reasons.append("You marked the last attempt as difficult, so concepts come first.")
            dx = adapt_for_readiness(dx, r)

            load = TASK_LOAD[dx.task_type]
            fit = 1 - 0.5 * max(0.0, (load - 1) / 2 - (r + 0.3))  # mild unless readiness is low
            duration = MAINTENANCE_DURATION if ts.maintenance_mode else BASE_DURATION.get(dx.task_type, 45)
            duration = min(max_block, int(round(duration * ratio / 5) * 5))
            factors = dict(ts.factors, readiness_fit=round(fit, 4), maintenance=1.0 if ts.maintenance_mode else 0.0)
            title = f"{t.name} — {dx.detail}"
            cands.append(Candidate(
                key=f"topic:{t.id}", exam_id=exam.id, subject_id=subj.id, topic_id=t.id, title=title,
                task_type=dx.task_type, duration=duration, cognitive_load=load, score=round(ts.score * fit, 2),
                factors=factors, reasons=dx.reasons + ts.reasons, gap=dx.gap))

        cands.extend(self._mock_analysis_candidates(req, urg, top, ratio, max_block))
        cands.sort(key=lambda c: (-c.score, c.key))   # key tiebreak keeps output deterministic
        return cands

    def _mock_analysis_candidates(self, req: PlanRequest, urg: dict[str, float], top: float,
                                  ratio: float, max_block: int) -> list[Candidate]:
        out = []
        for m in req.pending_mock_analyses:
            if m.exam_id not in urg:
                continue
            age = (req.today - m.taken_on).days
            if age < 0 or age > 14:
                continue
            freshness = clamp(math.exp(-age / 5), 0.2)
            factors = {"urgency": urg[m.exam_id], "importance": 1.0, "need": 0.95,
                       "recency": freshness, "benefit": 0.9, "prerequisite": 1.0}
            w = self.cfg.weights
            base = math.exp(sum(w[k] * math.log(clamp(v)) for k, v in factors.items()) / sum(w.values()))
            out.append(Candidate(
                key=f"mock:{m.mock_id}", exam_id=m.exam_id, subject_id=None, topic_id=None,
                title=f"{m.name} — Mock analysis", task_type=TaskType.MOCK_ANALYSIS,
                duration=min(max_block, int(round(BASE_DURATION[TaskType.MOCK_ANALYSIS] * ratio / 5) * 5)),
                cognitive_load=TASK_LOAD[TaskType.MOCK_ANALYSIS], score=round(100 * base, 2),
                factors={k: round(v, 4) for k, v in factors.items()},
                reasons=[f"{m.name} was taken {age} day{'s' if age != 1 else ''} ago and is not analysed yet.",
                         "Question-level analysis feeds every future recommendation."],
                mock_id=m.mock_id))
        return out

    # ------------------------------------------------------------------
    def generate(self, req: PlanRequest) -> PlanResult:
        c = req.constraints
        rd = compute_readiness(req.checkin)
        r = NEUTRAL_READINESS if rd.score is None else rd.score
        low = rd.score is not None and rd.score < 0.4
        ratio, ratio_note = estimation_ratio(req.duration_samples)
        max_block = min(c.max_block, LOW_READINESS_MAX_BLOCK) if low else c.max_block
        block_len = min(c.preferred_block, max_block)

        b = self.solver.budget(c, block_len, ratio, low)
        notes = b.notes + [ratio_note]
        warnings: list[str] = []

        ranked = self.rank(req, rd.score, ratio, max_block)
        pinned_topics = {blk.topic_id for blk in c.fixed_blocks if blk.kind == "pinned_study" and blk.topic_id}
        ranked = [x for x in ranked if x.topic_id not in pinned_topics]
        if not ranked:
            warnings.append("No active exams with topics. Add an exam and its syllabus to get a plan.")

        chosen = self._select(ranked, b.study_budget, block_len, r)
        placed, dropped = self.solver.place(chosen, c, b.study_budget)
        for d in dropped:
            warnings.append(f"'{d.title}' did not fit into today's free slots.")

        items = [self._to_item(cand, s, e) for cand, s, e in placed]
        items += self._pinned_items(req, ranked)
        items.sort(key=lambda i: i.start)
        self._label_priorities(items)

        chosen_keys = {cand.key for cand, _, _ in placed}
        alternatives = [x for x in ranked if x.key not in chosen_keys][:5]
        return PlanResult(
            today=req.today, readiness=rd.score, readiness_notes=rd.notes,
            budget=BudgetBreakdown(free_minutes=b.free_minutes, fixed_minutes=b.fixed_minutes,
                                   rejuvenation_reserved=c.rejuvenation_min,
                                   study_budget=b.study_budget + b.pinned_study,
                                   pinned_study_minutes=b.pinned_study, estimation_ratio=ratio, notes=notes),
            items=items, alternatives=alternatives, warnings=warnings)

    def _select(self, ranked: list[Candidate], budget: int, block_len: int, r: float) -> list[Candidate]:
        """Greedy by score with same-subject diminishing returns and a cognitive-load ceiling."""
        capacity = budget * (2.0 + 1.5 * r)   # load-minutes: avg load 2.9 at neutral, 3 (all heavy) from r>=0.67
        maintenance_keys = {x.key for x in ranked if x.factors.get("maintenance")}
        chosen: list[Candidate] = []
        used = load_used = 0
        per_subject: dict[str, int] = defaultdict(int)
        pool = list(ranked)
        while pool and budget - used >= 20:
            def eff(x: Candidate) -> float:
                n = per_subject[x.subject_id] if x.subject_id else 0
                if n and x.key in maintenance_keys:
                    return 0.0       # maintenance subjects get at most one block a day
                return x.score * (self.cfg.subject_repeat_decay ** n)
            pool.sort(key=lambda x: (-eff(x), x.key))
            pick = None
            for x in pool:
                if eff(x) <= 0:
                    continue
                dur = min(x.duration, budget - used)
                if dur < 20:
                    continue
                if load_used + x.cognitive_load * dur <= capacity:
                    pick = x
                    break
                if x.cognitive_load == 3 and load_used + 2 * dur <= capacity:
                    # Keep the topic, lighten the format, instead of leaving study time unused.
                    x.task_type = TaskType.REVISION if x.task_type == TaskType.CONCEPT_LEARNING else TaskType.ERROR_LOG_REVIEW \
                        if x.task_type == TaskType.QUESTION_SELECTION_PRACTICE else TaskType.REVISION
                    x.cognitive_load = 2
                    x.title = f"{x.title.split(' — ')[0]} — {TASK_LABEL[x.task_type]}"
                    x.reasons.append("Switched to a lighter format to keep today's total cognitive load sustainable.")
                    pick = x
                    break
            if pick is None:
                break
            pool.remove(pick)
            n = per_subject[pick.subject_id] if pick.subject_id else 0
            if n:
                pick.reasons.append(f"Another block from this subject is already planned; score discounted "
                                    f"to {eff(pick):.1f} for variety and it still ranked next.")
                pick.score = round(eff(pick), 2)
            pick.duration = min(pick.duration, budget - used)
            chosen.append(pick)
            used += pick.duration
            load_used += pick.cognitive_load * pick.duration
            if pick.subject_id:
                per_subject[pick.subject_id] += 1
        return chosen

    def _to_item(self, c: Candidate, start: int, end: int) -> PlanItem:
        return PlanItem(start=start, end=end, exam_id=c.exam_id, subject_id=c.subject_id, topic_id=c.topic_id,
                        title=c.title, task_type=c.task_type, duration=end - start,
                        cognitive_load=c.cognitive_load, score=c.score, priority="", reasons=c.reasons,
                        factors=c.factors, gap=c.gap, mock_id=c.mock_id)

    def _pinned_items(self, req: PlanRequest, ranked: list[Candidate]) -> list[PlanItem]:
        topics = {t.id: t for t in req.topics}
        subj = {s.id: s for s in req.subjects}
        out = []
        for blk in req.constraints.fixed_blocks:
            if blk.kind != "pinned_study":
                continue
            t = topics.get(blk.topic_id or "")
            tt = blk.task_type or TaskType.PRACTICE
            out.append(PlanItem(
                start=blk.start, end=blk.end, exam_id=subj[t.subject_id].exam_id if t else "",
                subject_id=t.subject_id if t else None, topic_id=t.id if t else None,
                title=blk.label or (f"{t.name} — {TASK_LABEL[tt]}" if t else "Study block"), task_type=tt,
                duration=blk.end - blk.start, cognitive_load=TASK_LOAD[tt], score=0.0, priority="",
                reasons=["You placed this block manually; the rest of the day was planned around it."],
                factors={}, gap=GapType.NONE, pinned=True))
        return out

    @staticmethod
    def _label_priorities(items: list[PlanItem]) -> None:
        scored = [i.score for i in items if not i.pinned]
        top = max(scored) if scored else 0
        for i in items:
            if i.pinned:
                i.priority = "PINNED"
            elif i.score >= 0.75 * top:
                i.priority = "HIGH"
            elif i.score >= 0.45 * top:
                i.priority = "MEDIUM"
            else:
                i.priority = "LOW"
