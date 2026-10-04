"""JSON <-> engine types. Raises ValueError with a field path on invalid input.

Kept framework-free so the same validation runs in tests and behind FastAPI.
"""
from __future__ import annotations

from dataclasses import asdict, is_dataclass
from datetime import date
from enum import Enum
from typing import Any, Callable, Optional, TypeVar

from .reports import (MockQuestion, MockRecord, MockSectionResult, RehabEntry, WeekAttempt, WeeklyInput,
                      WeekTask)
from .types import (Attempt, CheckIn, DayConstraints, ErrorType, Exam, FixedBlock, PendingMockAnalysis,
                    PlanRequest, PracticeLog, SkippedTask, Subject, SubjectKind, TaskType, Topic)

T = TypeVar("T")


def _date(v: Any, path: str) -> date:
    try:
        return date.fromisoformat(str(v)[:10])
    except ValueError as e:
        raise ValueError(f"{path}: expected ISO date") from e


def _opt(d: dict, k: str, f: Callable[[Any], T], default: Optional[T] = None) -> Optional[T]:
    v = d.get(k)
    return default if v is None else f(v)


def _num(lo: float, hi: float, path: str) -> Callable[[Any], float]:
    def f(v: Any) -> float:
        x = float(v)
        if not lo <= x <= hi:
            raise ValueError(f"{path}: {x} outside [{lo}, {hi}]")
        return x
    return f


def _list(d: dict, k: str, f: Callable[[dict, str], T], path: str) -> tuple[T, ...]:
    items = d.get(k) or []
    if not isinstance(items, list):
        raise ValueError(f"{path}.{k}: expected list")
    return tuple(f(x, f"{path}.{k}[{i}]") for i, x in enumerate(items))


def _enum(e: type[Enum], path: str) -> Callable[[Any], Any]:
    def f(v: Any) -> Any:
        try:
            return e(v)
        except ValueError as ex:
            raise ValueError(f"{path}: '{v}' is not one of {[m.value for m in e]}") from ex
    return f


def parse_plan_request(d: dict) -> PlanRequest:
    p = "body"
    if not isinstance(d, dict):
        raise ValueError("body: expected object")
    exams = _list(d, "exams", lambda x, q: Exam(
        id=str(x["id"]), name=str(x["name"]), exam_date=_date(x["exam_date"], f"{q}.exam_date"),
        user_priority=_opt(x, "user_priority", _num(0.1, 3, f"{q}.user_priority"), 1.0),
        active=bool(x.get("active", True))), p)
    subjects = _list(d, "subjects", lambda x, q: Subject(
        id=str(x["id"]), exam_id=str(x["exam_id"]), name=str(x["name"]),
        kind=_opt(x, "kind", _enum(SubjectKind, f"{q}.kind"), SubjectKind.QUANTITATIVE),
        importance=_opt(x, "importance", _num(0, 1, f"{q}.importance"), 1.0),
        user_priority=_opt(x, "user_priority", _num(0.1, 3, f"{q}.user_priority"), 1.0),
        cadence_days=int(x.get("cadence_days", 3))), p)
    topics = _list(d, "topics", lambda x, q: Topic(
        id=str(x["id"]), subject_id=str(x["subject_id"]), name=str(x["name"]),
        importance=int(_num(1, 5, f"{q}.importance")(x.get("importance", 3))),
        coverage=_num(0, 1, f"{q}.coverage")(x.get("coverage", 0)),
        self_mastery=_opt(x, "self_mastery", _num(0, 1, f"{q}.self_mastery")),
        prerequisite_ids=tuple(str(i) for i in x.get("prerequisite_ids", [])),
        user_priority=_opt(x, "user_priority", _num(0.1, 3, f"{q}.user_priority"), 1.0),
        active=bool(x.get("active", True))), p)
    attempts = _list(d, "attempts", lambda x, q: Attempt(
        topic_id=str(x["topic_id"]), on=_date(x["on"], f"{q}.on"), correct=x.get("correct"),
        time_sec=_opt(x, "time_sec", float), expected_time_sec=_opt(x, "expected_time_sec", float),
        error_type=_opt(x, "error_type", _enum(ErrorType, f"{q}.error_type")),
        source_id=str(x.get("source_id", "")), source_kind=str(x.get("source_kind", "practice"))), p)
    logs = _list(d, "practice_logs", lambda x, q: PracticeLog(
        topic_id=str(x["topic_id"]), on=_date(x["on"], f"{q}.on"), minutes=int(x["minutes"]),
        task_type=_opt(x, "task_type", _enum(TaskType, f"{q}.task_type"), TaskType.PRACTICE)), p)
    skipped = _list(d, "skipped", lambda x, q: SkippedTask(
        topic_id=str(x["topic_id"]), on=_date(x["on"], f"{q}.on"), reason=x.get("reason")), p)
    mocks = _list(d, "pending_mock_analyses", lambda x, q: PendingMockAnalysis(
        mock_id=str(x["mock_id"]), exam_id=str(x["exam_id"]), name=str(x["name"]),
        taken_on=_date(x["taken_on"], f"{q}.taken_on")), p)

    cd = d.get("constraints") or {}
    blocks = _list(cd, "fixed_blocks", lambda x, q: _block(x, q), f"{p}.constraints")
    defaults = DayConstraints()
    constraints = DayConstraints(
        day_start=int(cd.get("day_start", defaults.day_start)), day_end=int(cd.get("day_end", defaults.day_end)),
        fixed_blocks=blocks, study_min=int(cd.get("study_min", defaults.study_min)),
        study_max=int(cd.get("study_max", defaults.study_max)),
        rejuvenation_min=int(cd.get("rejuvenation_min", defaults.rejuvenation_min)),
        preferred_block=int(cd.get("preferred_block", defaults.preferred_block)),
        max_block=int(cd.get("max_block", defaults.max_block)),
        break_minutes=int(cd.get("break_minutes", defaults.break_minutes)),
        available_study_minutes=_opt(cd, "available_study_minutes", int))
    if not 0 <= constraints.day_start < constraints.day_end <= 24 * 60:
        raise ValueError("body.constraints: day_start/day_end must satisfy 0 <= start < end <= 1440")
    if constraints.study_min > constraints.study_max:
        raise ValueError("body.constraints: study_min cannot exceed study_max")

    ci = d.get("checkin")
    checkin = None if ci is None else CheckIn(
        sleep_hours=_opt(ci, "sleep_hours", _num(0, 24, "checkin.sleep_hours")),
        sleep_quality=_opt(ci, "sleep_quality", lambda v: int(_num(1, 5, "checkin.sleep_quality")(v))),
        energy=_opt(ci, "energy", lambda v: int(_num(1, 10, "checkin.energy")(v))),
        stress=_opt(ci, "stress", lambda v: int(_num(1, 10, "checkin.stress")(v))),
        mental_fatigue=_opt(ci, "mental_fatigue", lambda v: int(_num(1, 10, "checkin.mental_fatigue")(v))))
    samples = tuple((int(a), int(b)) for a, b in d.get("duration_samples", []))
    return PlanRequest(today=_date(d.get("today"), "body.today"), exams=exams, subjects=subjects, topics=topics,
                       attempts=attempts, practice_logs=logs, skipped=skipped, pending_mock_analyses=mocks,
                       constraints=constraints, checkin=checkin, duration_samples=samples)


def _block(x: dict, q: str) -> FixedBlock:
    s, e = int(x["start"]), int(x["end"])
    if not 0 <= s < e <= 24 * 60:
        raise ValueError(f"{q}: start must be before end, within the day")
    return FixedBlock(start=s, end=e, kind=str(x["kind"]), label=str(x.get("label", "")),
                      topic_id=x.get("topic_id"), task_type=_opt(x, "task_type", _enum(TaskType, f"{q}.task_type")))


def parse_mocks(items: list) -> list[MockRecord]:
    out = []
    for i, m in enumerate(items or []):
        q = f"mocks[{i}]"
        out.append(MockRecord(
            id=str(m["id"]), name=str(m["name"]), taken_on=_date(m["taken_on"], f"{q}.taken_on"),
            total_score=float(m["total_score"]),
            sections=tuple(MockSectionResult(name=str(s["name"]), score=float(s["score"]),
                                             attempted=int(s.get("attempted", 0)), correct=int(s.get("correct", 0)),
                                             incorrect=int(s.get("incorrect", 0)), skipped=int(s.get("skipped", 0)))
                           for s in m.get("sections", [])),
            questions=tuple(MockQuestion(
                section=str(x.get("section", "")), topic_id=x.get("topic_id"),
                topic_name=str(x.get("topic_name", "Untagged")), attempted=bool(x.get("attempted", True)),
                correct=x.get("correct"), time_sec=_opt(x, "time_sec", float),
                error_type=_opt(x, "error_type", _enum(ErrorType, f"{q}.error_type")))
                for x in m.get("questions", []))))
    return out


def parse_weekly(d: dict) -> WeeklyInput:
    return WeeklyInput(
        week_start=_date(d["week_start"], "week_start"),
        tasks=[WeekTask(on=_date(t["on"], "tasks.on"), exam=str(t["exam"]), subject=str(t["subject"]),
                        planned_min=int(t["planned_min"]), actual_min=int(t.get("actual_min", 0)),
                        status=str(t["status"])) for t in d.get("tasks", [])],
        attempts=[WeekAttempt(on=_date(a["on"], "attempts.on"), topic=str(a["topic"]), correct=a.get("correct"))
                  for a in d.get("attempts", [])],
        rehab=[RehabEntry(on=_date(r["on"], "rehab.on"), program=str(r["program"]), status=str(r["status"]))
               for r in d.get("rehab", [])],
        rehab_programs=[str(p) for p in d.get("rehab_programs", [])])


def to_json(obj: Any) -> Any:
    if is_dataclass(obj):
        return {k: to_json(v) for k, v in asdict(obj).items()}
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, date):
        return obj.isoformat()
    if isinstance(obj, dict):
        return {(k.value if isinstance(k, Enum) else k): to_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [to_json(v) for v in obj]
    return obj
