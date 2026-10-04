"""Recommendation-engine tests. Run: python -m unittest discover -s tests  (or: pytest)"""
from __future__ import annotations

import unittest
from dataclasses import replace
from datetime import date, timedelta

from apex_engine import MockAnalyzer, UnifiedRecommendationEngine, WeeklyAnalyzer, compute_readiness
from apex_engine.constraints import free_intervals
from apex_engine.readiness import estimation_ratio
from apex_engine.reports import MockQuestion, MockRecord, MockSectionResult, RehabEntry, WeekAttempt, WeeklyInput, WeekTask
from apex_engine.serialization import parse_plan_request, to_json
from apex_engine.types import (Attempt, CheckIn, DayConstraints, ErrorType, Exam, FixedBlock, GapType,
                               PendingMockAnalysis, PlanRequest, PracticeLog, SkippedTask, Subject, SubjectKind,
                               TaskType, Topic)

TODAY = date(2026, 10, 3)
E = UnifiedRecommendationEngine()


def H(h: float) -> int:
    return int(h * 60)


def world(cat_days: int = 57, cds_days: int = 190, **over) -> PlanRequest:
    exams = (Exam("cat", "CAT 2026", TODAY + timedelta(days=cat_days)),
             Exam("cds", "CDS 2027", TODAY + timedelta(days=cds_days)))
    subjects = (
        Subject("qa", "cat", "Quant", SubjectKind.QUANTITATIVE, 1.0, cadence_days=2),
        Subject("varc", "cat", "VARC", SubjectKind.VERBAL, 1.0, cadence_days=2),
        Subject("lrdi", "cat", "LRDI", SubjectKind.REASONING, 1.0, cadence_days=2),
        Subject("cds_en", "cds", "CDS English", SubjectKind.VERBAL, 1.0, cadence_days=2),
        Subject("cds_gs", "cds", "CDS General Studies", SubjectKind.KNOWLEDGE, 1.0, cadence_days=2),
        Subject("cds_ma", "cds", "CDS Mathematics", SubjectKind.QUANTITATIVE, 1.0, cadence_days=4),
    )
    topics = (
        Topic("alg", "qa", "Algebra", 5, 0.85, 0.7),
        Topic("ari", "qa", "Arithmetic", 5, 0.9, 0.75),
        Topic("geo", "qa", "Geometry", 4, 0.85, 0.7),
        Topic("rc", "varc", "Reading Comprehension", 5, 0.7, 0.6),
        Topic("pj", "varc", "Para Jumbles", 3, 0.6, 0.5),
        Topic("arr", "lrdi", "Arrangements", 4, 0.6, 0.5),
        Topic("tab", "lrdi", "Tables", 4, 0.6, 0.55),
        Topic("gram", "cds_en", "Grammar", 3, 0.3, 0.4),
        Topic("vocab", "cds_en", "Vocabulary", 3, 0.3, 0.4),
        Topic("hist", "cds_gs", "History", 3, 0.1, 0.2),
        Topic("poly", "cds_gs", "Polity", 3, 0.1, 0.2),
        Topic("cmath", "cds_ma", "CDS Trigonometry", 3, 0.2, 0.3),
    )
    base = dict(today=TODAY, exams=exams, subjects=subjects, topics=topics,
                constraints=DayConstraints(day_start=H(7), day_end=H(23)))
    base.update(over)
    return PlanRequest(**base)


def attempts(topic: str, n: int, correct: int, days_ago: int, *, source: str = "", kind: str = "practice",
             error: ErrorType | None = None, time: float | None = None, expected: float | None = None):
    return [Attempt(topic, TODAY - timedelta(days=days_ago), i < correct, time, expected,
                    None if i < correct else error, source or f"s{topic}{days_ago}", kind) for i in range(n)]


def study_minutes(plan) -> int:
    return sum(i.duration for i in plan.items)


class TimeConstraints(unittest.TestCase):
    def test_plan_never_exceeds_user_available_time(self):
        req = world(constraints=DayConstraints(day_start=H(7), day_end=H(23), available_study_minutes=300))
        plan = E.generate(req)
        self.assertLessEqual(study_minutes(plan), 300)
        self.assertGreater(study_minutes(plan), 200)

    def test_plan_capped_at_study_max(self):
        plan = E.generate(world(constraints=DayConstraints(day_start=H(6), day_end=H(23), study_max=420)))
        self.assertLessEqual(study_minutes(plan), 420)

    def test_blocks_avoid_fixed_commitments(self):
        blocks = (FixedBlock(H(9), H(10.5), "class", "Lecture"), FixedBlock(H(17), H(18.5), "rehab", "Leg + wrist"))
        plan = E.generate(world(constraints=DayConstraints(day_start=H(7), day_end=H(23), fixed_blocks=blocks)))
        for item in plan.items:
            for b in blocks:
                self.assertTrue(item.end <= b.start or item.start >= b.end, f"{item.title} overlaps {b.label}")

    def test_rejuvenation_is_protected(self):
        c = DayConstraints(day_start=H(8), day_end=H(20), rejuvenation_min=240, study_max=600,
                           fixed_blocks=(FixedBlock(H(12), H(13.5), "rehab"),))
        plan = E.generate(world(constraints=c))
        free = sum(e - s for s, e in free_intervals(c))
        used = study_minutes(plan) + c.break_minutes * len(plan.items)
        self.assertGreaterEqual(free - used, 240)

    def test_short_day_produces_feasible_plan_and_warns(self):
        c = DayConstraints(day_start=H(18), day_end=H(23), rejuvenation_min=180)
        plan = E.generate(world(constraints=c))
        self.assertLessEqual(study_minutes(plan), 120)
        self.assertTrue(any("below your" in n for n in plan.budget.notes))

    def test_pinned_block_is_kept_and_rest_planned_around_it(self):
        pin = FixedBlock(H(8), H(9), "pinned_study", topic_id="geo", task_type=TaskType.PRACTICE)
        plan = E.generate(world(constraints=DayConstraints(day_start=H(7), day_end=H(23), fixed_blocks=(pin,))))
        pinned = [i for i in plan.items if i.pinned]
        self.assertEqual(len(pinned), 1)
        self.assertEqual(sum(1 for i in plan.items if i.topic_id == "geo"), 1)
        for i in plan.items:
            if not i.pinned:
                self.assertTrue(i.end <= pin.start or i.start >= pin.end)
        self.assertLessEqual(study_minutes(plan), 420)


class Urgency(unittest.TestCase):
    def test_closer_exam_scores_higher_for_identical_topics(self):
        req = world(cat_days=30, cds_days=150)
        ranked = {c.topic_id: c.score for c in E.rank(req)}
        # CDS Mathematics topic made identical to a CAT topic except for the exam
        twin = replace(req.topics[0], id="alg2", subject_id="cds_ma", name="CDS Algebra")
        ranked = {c.topic_id: c.score for c in E.rank(replace(req, topics=req.topics + (twin,)))}
        self.assertGreater(ranked["alg"], ranked["alg2"])

    def test_cat_dominates_before_cat_but_cds_keeps_maintenance(self):
        plan = E.generate(world())
        cat = sum(i.duration for i in plan.items if i.exam_id == "cat")
        cds = sum(i.duration for i in plan.items if i.exam_id == "cds")
        self.assertGreater(cat, 2 * cds)
        self.assertGreater(cds, 0, "CDS maintenance should not disappear before CAT")
        for i in plan.items:
            if i.exam_id == "cds":
                self.assertLessEqual(i.duration, 30)

    def test_after_cat_passes_plan_shifts_to_cds(self):
        req = world(cat_days=-1, cds_days=120)
        plan = E.generate(req)
        self.assertTrue(plan.items)
        self.assertTrue(all(i.exam_id == "cds" for i in plan.items))
        self.assertTrue(any(i.duration > 30 for i in plan.items), "CDS leaves maintenance mode")


class Weakness(unittest.TestCase):
    def test_falling_accuracy_raises_priority(self):
        stable = attempts("alg", 10, 7, 20, source="m1", kind="mock") + \
            attempts("alg", 10, 7, 12, source="m2", kind="mock") + attempts("alg", 10, 7, 4, source="m3", kind="mock")
        falling = attempts("alg", 10, 8, 20, source="m1", kind="mock", error=ErrorType.APPLICATION) + \
            attempts("alg", 10, 6, 12, source="m2", kind="mock", error=ErrorType.APPLICATION) + \
            attempts("alg", 10, 5, 4, source="m3", kind="mock", error=ErrorType.APPLICATION)
        s1 = {c.topic_id: c for c in E.rank(world(attempts=tuple(stable)))}["alg"]
        s2 = {c.topic_id: c for c in E.rank(world(attempts=tuple(falling)))}["alg"]
        self.assertGreater(s2.score, s1.score)
        self.assertTrue(any("across your last 3 mocks" in r for r in s2.reasons))

    def test_strong_but_slow_gets_timed_practice(self):
        a = attempts("alg", 20, 17, 3, error=ErrorType.UNKNOWN, time=180, expected=120)
        c = {c.topic_id: c for c in E.rank(world(attempts=tuple(a)))}["alg"]
        self.assertEqual(c.task_type, TaskType.TIMED_PRACTICE)
        self.assertEqual(c.gap, GapType.SPEED)

    def test_calculation_errors_get_timed_accuracy_drill(self):
        a = attempts("alg", 20, 12, 3, error=ErrorType.CALCULATION)
        c = {c.topic_id: c for c in E.rank(world(attempts=tuple(a)))}["alg"]
        self.assertEqual((c.gap, c.task_type), (GapType.EXECUTION, TaskType.TIMED_PRACTICE))

    def test_conceptual_errors_get_revision(self):
        a = attempts("alg", 20, 10, 3, error=ErrorType.KNOWLEDGE)
        c = {c.topic_id: c for c in E.rank(world(attempts=tuple(a)))}["alg"]
        self.assertEqual((c.gap, c.task_type), (GapType.KNOWLEDGE, TaskType.REVISION))

    def test_application_errors_get_application_practice(self):
        a = attempts("alg", 20, 11, 3, error=ErrorType.APPLICATION)
        c = {c.topic_id: c for c in E.rank(world(attempts=tuple(a)))}["alg"]
        self.assertEqual((c.gap, c.task_type), (GapType.APPLICATION, TaskType.PRACTICE))
        self.assertTrue(any("of your last" in r and "application" in r for r in c.reasons))

    def test_low_coverage_means_concept_learning_and_gs_means_reading(self):
        ranked = {c.topic_id: c for c in E.rank(world())}
        self.assertEqual(ranked["cmath"].task_type, TaskType.CONCEPT_LEARNING)
        self.assertEqual(ranked["hist"].task_type, TaskType.READING)

    def test_recency_raises_priority(self):
        fresh = world(practice_logs=(PracticeLog("geo", TODAY - timedelta(days=1), 60),))
        stale = world(practice_logs=(PracticeLog("geo", TODAY - timedelta(days=9), 60),))
        f = {c.topic_id: c.score for c in E.rank(fresh)}["geo"]
        s = {c.topic_id: c.score for c in E.rank(stale)}["geo"]
        self.assertGreater(s, f)


class Rescheduling(unittest.TestCase):
    def test_missed_task_is_reevaluated_not_duplicated(self):
        skip = (SkippedTask("pj", TODAY - timedelta(days=1), "not_enough_time"),)
        base = {c.topic_id: c.score for c in E.rank(world())}
        after = {c.topic_id: c for c in E.rank(world(skipped=skip))}
        self.assertGreater(after["pj"].score, base["pj"])
        self.assertTrue(any("re-evaluated" in r for r in after["pj"].reasons))

    def test_too_tired_skip_does_not_boost(self):
        skip = (SkippedTask("pj", TODAY - timedelta(days=1), "too_tired"),)
        base = {c.topic_id: c.score for c in E.rank(world())}["pj"]
        after = {c.topic_id: c.score for c in E.rank(world(skipped=skip))}["pj"]
        self.assertAlmostEqual(base, after, places=2)

    def test_difficult_skip_switches_to_revision(self):
        a = attempts("alg", 20, 11, 3, error=ErrorType.APPLICATION)
        skip = (SkippedTask("alg", TODAY - timedelta(days=1), "difficult"),)
        c = {c.topic_id: c for c in E.rank(world(attempts=tuple(a), skipped=skip))}["alg"]
        self.assertEqual(c.task_type, TaskType.REVISION)

    def test_pending_mock_analysis_is_scheduled(self):
        req = world(pending_mock_analyses=(PendingMockAnalysis("mk7", "cat", "CAT Mock 7", TODAY - timedelta(days=1)),))
        plan = E.generate(req)
        self.assertTrue(any(i.task_type == TaskType.MOCK_ANALYSIS for i in plan.items))


class Readiness(unittest.TestCase):
    def test_low_readiness_changes_work_type_not_total(self):
        low = CheckIn(sleep_hours=4.5, sleep_quality=1, energy=2, stress=9, mental_fatigue=9)
        plan = E.generate(world(checkin=low))
        self.assertLess(plan.readiness, 0.4)
        self.assertTrue(all(i.task_type != TaskType.CONCEPT_LEARNING for i in plan.items))
        self.assertTrue(all(i.duration <= 45 for i in plan.items))
        self.assertGreaterEqual(study_minutes(plan), 300 - 45)

    def test_partial_checkin(self):
        r = compute_readiness(CheckIn(energy=10, stress=1))
        self.assertAlmostEqual(r.score, 1.0)
        self.assertIsNone(compute_readiness(None).score)

    def test_calibration_requires_history(self):
        self.assertEqual(estimation_ratio(((60, 75),) * 5)[0], 1.0)
        ratio, _ = estimation_ratio(((60, 75),) * 20)
        self.assertGreater(ratio, 1.1)
        self.assertLess(ratio, 1.25)


class Determinism(unittest.TestCase):
    def test_same_input_same_plan(self):
        req = world(attempts=tuple(attempts("alg", 12, 6, 2, error=ErrorType.APPLICATION)))
        self.assertEqual(to_json(E.generate(req)), to_json(E.generate(req)))

    def test_every_item_explains_itself(self):
        for i in E.generate(world()).items:
            self.assertTrue(i.reasons, i.title)
            self.assertIn(i.priority, {"HIGH", "MEDIUM", "LOW", "PINNED"})


class Reports(unittest.TestCase):
    def test_mock_empty_state(self):
        self.assertEqual(MockAnalyzer().analyze([])["count"], 0)

    def test_mock_trajectory_is_descriptive(self):
        mocks = [MockRecord(f"m{i}", f"Mock {i}", TODAY - timedelta(days=30 - 7 * i), s,
                            (MockSectionResult("QA", s / 3, 20, 12, 8, 2),),
                            tuple(MockQuestion("QA", "alg", "Algebra", True, k % 2 == 0, 90 + k * 10,
                                               ErrorType.APPLICATION) for k in range(6)))
                 for i, s in enumerate([18, 24, 27, 31, 35])]
        out = MockAnalyzer().analyze(mocks)
        self.assertEqual([t["score"] for t in out["trajectory"]], [18, 24, 27, 31, 35])
        self.assertIn("+17", out["summary"][0])
        self.assertTrue(any("not a prediction" in s for s in out["summary"]))
        self.assertTrue(out["selection"]["sufficient"])

    def test_weekly_review_from_real_data(self):
        ws = TODAY - timedelta(days=6)
        tasks = [WeekTask(ws + timedelta(days=d), "CAT", "Quant", 60, 55 if d % 3 else 0,
                          "completed" if d % 3 else "skipped") for d in range(7)]
        att = [WeekAttempt(ws - timedelta(days=3), "Arithmetic", i < 6) for i in range(10)] + \
              [WeekAttempt(ws + timedelta(days=2), "Arithmetic", i < 8) for i in range(10)]
        rehab = [RehabEntry(ws + timedelta(days=d), "Leg", "completed") for d in range(6)]
        out = WeeklyAnalyzer().analyze(WeeklyInput(ws, tasks, att, rehab, ["Leg", "Wrist"], E.rank(world())))
        self.assertEqual(out["study"]["planned_min"], 420)
        self.assertIn("60% to 80%", out["biggest_improvement"])
        self.assertEqual(out["rehab"]["Leg"]["completed"], 6)
        self.assertEqual(out["rehab"]["Wrist"]["completed"], 0)
        self.assertEqual(len(out["next_week_focus"]), 5)


class Validation(unittest.TestCase):
    def test_rejects_bad_ranges(self):
        with self.assertRaises(ValueError):
            parse_plan_request({"today": "2026-10-03", "topics": [
                {"id": "t", "subject_id": "s", "name": "x", "coverage": 1.4}]})
        with self.assertRaises(ValueError):
            parse_plan_request({"today": "2026-10-03", "constraints": {"study_min": 500, "study_max": 300}})

    def test_round_trip(self):
        body = {"today": "2026-10-03",
                "exams": [{"id": "cat", "name": "CAT", "exam_date": "2026-11-29"}],
                "subjects": [{"id": "qa", "exam_id": "cat", "name": "Quant"}],
                "topics": [{"id": "alg", "subject_id": "qa", "name": "Algebra", "coverage": 0.8,
                            "self_mastery": 0.6}],
                "constraints": {"available_study_minutes": 120}}
        out = to_json(E.generate(parse_plan_request(body)))
        self.assertLessEqual(sum(i["duration"] for i in out["items"]), 120)
        self.assertEqual(out["items"][0]["task_type"], "practice")


if __name__ == "__main__":
    unittest.main()


class Invariants(unittest.TestCase):
    """Seeded randomised days: hard constraints must hold for every one."""

    def test_random_days_respect_all_hard_constraints(self):
        import random
        rng = random.Random(42)
        for _ in range(300):
            start = rng.randint(H(5), H(10))
            end = rng.randint(H(18), H(24))
            blocks = []
            for _ in range(rng.randint(0, 4)):
                s = rng.randint(start, end - 30)
                blocks.append(FixedBlock(s, min(end, s + rng.choice([30, 60, 90, 120])), rng.choice(["class", "rehab"])))
            c = DayConstraints(day_start=start, day_end=end, fixed_blocks=tuple(blocks),
                               study_min=rng.choice([180, 300]), study_max=rng.choice([300, 420, 480]),
                               rejuvenation_min=rng.choice([120, 180, 240]),
                               available_study_minutes=rng.choice([None, 150, 300, 600]))
            ci = rng.choice([None, CheckIn(rng.uniform(4, 9), rng.randint(1, 5), rng.randint(1, 10),
                                           rng.randint(1, 10), rng.randint(1, 10))])
            plan = E.generate(world(cat_days=rng.randint(-5, 120), constraints=c, checkin=ci))
            total = study_minutes(plan)
            self.assertLessEqual(total, c.study_max)
            if c.available_study_minutes is not None:
                self.assertLessEqual(total, c.available_study_minutes)
            free = sum(e - s for s, e in free_intervals(c))
            self.assertGreaterEqual(free - total - c.break_minutes * len(plan.items), c.rejuvenation_min - 0)
            spans = sorted((i.start, i.end) for i in plan.items)
            for (s1, e1), (s2, _) in zip(spans, spans[1:]):
                self.assertLessEqual(e1, s2)
            for i in plan.items:
                self.assertGreaterEqual(i.start, start)
                self.assertLessEqual(i.end, end)
                for b in blocks:
                    self.assertTrue(i.end <= b.start or i.start >= b.end)
