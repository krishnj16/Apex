"""Weakness diagnosis: decides WHAT KIND of work a topic needs.

Knowledge gap  -> concept learning / revision
Application    -> mixed application practice
Execution      -> timed accuracy drill (calculation / careless errors)
Speed          -> timed drill
Selection      -> question-selection practice
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

from .performance import TopicStats, pct
from .types import ERROR_GAP_MAP, ErrorType, GapType, SubjectKind, TaskType, Topic

DOMINANT_SHARE = 0.4
MIN_ERRORS_FOR_MIX = 3
SLOW_RATIO = 1.25

ERROR_LABEL = {
    ErrorType.KNOWLEDGE: "knowledge", ErrorType.CONCEPT_CONFUSION: "concept-confusion",
    ErrorType.APPLICATION: "application", ErrorType.INTERPRETATION: "interpretation",
    ErrorType.CALCULATION: "calculation", ErrorType.CARELESS: "careless",
    ErrorType.QUESTION_SELECTION: "question-selection", ErrorType.TIME_MANAGEMENT: "time-management",
    ErrorType.GUESSING: "guessing", ErrorType.UNKNOWN: "unclassified",
}
GAP_LABEL = {
    GapType.KNOWLEDGE: "knowledge/concept", GapType.APPLICATION: "application",
    GapType.EXECUTION: "calculation/careless", GapType.SELECTION: "selection/time-management",
}


@dataclass
class Diagnosis:
    gap: GapType
    task_type: TaskType
    detail: str                      # short descriptor used in the task title
    reasons: list[str] = field(default_factory=list)


def _gap_mix(stats: TopicStats) -> tuple[Counter, int]:
    mix: Counter = Counter()
    for et in stats.recent_errors:
        gap = ERROR_GAP_MAP.get(et)
        if gap:
            mix[gap] += 1
    return mix, sum(mix.values())


def _for_kind(kind: SubjectKind, task: TaskType) -> tuple[TaskType, str]:
    """Translate a generic intervention into the natural task for the subject type."""
    if kind == SubjectKind.KNOWLEDGE:
        if task in (TaskType.CONCEPT_LEARNING, TaskType.REVISION):
            return TaskType.READING, "Read & make notes"
        if task == TaskType.MAINTENANCE_PRACTICE:
            return TaskType.MAINTENANCE_PRACTICE, "PYQ recall set"
        return TaskType.PRACTICE, "PYQ practice"
    return task, ""


def diagnose(topic: Topic, stats: TopicStats, kind: SubjectKind) -> Diagnosis:
    reasons: list[str] = []
    answered = stats.correct + stats.incorrect

    if topic.coverage < 0.5:
        reasons.append(f"Syllabus coverage is {pct(topic.coverage)}, so new concepts come first.")
        t, d = _for_kind(kind, TaskType.CONCEPT_LEARNING)
        return Diagnosis(GapType.KNOWLEDGE, t, d or "Learn concepts", reasons)

    if not stats.sufficient:
        reasons.append("No question data logged yet; this set gives APEX a baseline." if answered == 0 else
                       f"Only {answered} answered questions logged; this set also builds a baseline.")
        t, d = _for_kind(kind, TaskType.PRACTICE)
        return Diagnosis(GapType.NONE, t, d or "Mixed practice set", reasons)

    mix, total = _gap_mix(stats)
    if total >= MIN_ERRORS_FOR_MIX:
        gap, count = mix.most_common(1)[0]
        if count / total >= DOMINANT_SHARE:
            reasons.append(f"{count} of your last {total} classified errors were {GAP_LABEL[gap]} errors.")
            if gap == GapType.KNOWLEDGE:
                t, d = _for_kind(kind, TaskType.REVISION)
                return Diagnosis(gap, t, d or "Revise concepts + basic questions", reasons)
            if gap == GapType.APPLICATION:
                t, d = _for_kind(kind, TaskType.PRACTICE)
                return Diagnosis(gap, t, d or "Application question set", reasons)
            if gap == GapType.EXECUTION:
                t, d = _for_kind(kind, TaskType.TIMED_PRACTICE)
                return Diagnosis(gap, t, d or "Timed accuracy drill", reasons)
            t, d = _for_kind(kind, TaskType.QUESTION_SELECTION_PRACTICE)
            return Diagnosis(gap, t, d or "Question-selection drill", reasons)

    acc = stats.raw_accuracy or 0.0
    if stats.speed_ratio is not None and stats.speed_ratio >= SLOW_RATIO and acc >= 0.65:
        reasons.append(
            f"Accuracy is {pct(acc)}, but correct answers take {stats.speed_ratio:.2f}x the target time.")
        t, d = _for_kind(kind, TaskType.TIMED_PRACTICE)
        return Diagnosis(GapType.SPEED, t, d or "Timed speed drill", reasons)

    if stats.attempts and stats.skipped / stats.attempts >= 0.35:
        reasons.append(f"{stats.skipped} of {stats.attempts} questions in this topic were left unattempted.")
        t, d = _for_kind(kind, TaskType.QUESTION_SELECTION_PRACTICE)
        return Diagnosis(GapType.SELECTION, t, d or "Question-selection drill", reasons)

    if acc >= 0.8:
        reasons.append(f"Accuracy is {pct(acc)} over {answered} questions; keeping it warm.")
        t, d = _for_kind(kind, TaskType.MAINTENANCE_PRACTICE)
        return Diagnosis(GapType.NONE, t, d or "Mixed maintenance set", reasons)

    reasons.append(f"Accuracy is {pct(acc)} over {answered} questions with no single dominant error type.")
    t, d = _for_kind(kind, TaskType.PRACTICE)
    return Diagnosis(GapType.APPLICATION, t, d or "Mixed practice set", reasons)


LOW_READINESS_SWAP = {
    TaskType.CONCEPT_LEARNING: (TaskType.REVISION, "Light concept revision"),
    TaskType.PRACTICE: (TaskType.REVISION, "Revise notes + easy questions"),
    TaskType.TIMED_PRACTICE: (TaskType.PRACTICE, "Untimed accuracy set"),
    TaskType.QUESTION_SELECTION_PRACTICE: (TaskType.ERROR_LOG_REVIEW, "Review selection mistakes"),
}


def adapt_for_readiness(dx: Diagnosis, readiness: float) -> Diagnosis:
    """Low readiness changes the TYPE of work, not whether the user studies."""
    if readiness >= 0.4 or dx.task_type not in LOW_READINESS_SWAP:
        return dx
    new_type, detail = LOW_READINESS_SWAP[dx.task_type]
    return Diagnosis(dx.gap, new_type, detail, dx.reasons + [
        f"Readiness is {pct(readiness)} today, so this was switched to lighter {new_type.value.replace('_', ' ')}."])
