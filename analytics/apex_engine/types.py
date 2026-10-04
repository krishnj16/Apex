"""Domain types for the APEX engine.

The engine is a pure function of these inputs: no database, no clock, no randomness.
`today` is always passed in, so every plan is reproducible from stored data.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from enum import Enum
from typing import Optional


class ErrorType(str, Enum):
    KNOWLEDGE = "knowledge"
    CONCEPT_CONFUSION = "concept_confusion"
    APPLICATION = "application"
    CALCULATION = "calculation"
    CARELESS = "careless"
    TIME_MANAGEMENT = "time_management"
    QUESTION_SELECTION = "question_selection"
    INTERPRETATION = "interpretation"
    GUESSING = "guessing"
    UNKNOWN = "unknown"


class GapType(str, Enum):
    """The four weakness types from the spec, plus EXECUTION (calculation/careless),
    which needs a different intervention from APPLICATION and is kept separate."""
    KNOWLEDGE = "knowledge"
    APPLICATION = "application"
    EXECUTION = "execution"
    SPEED = "speed"
    SELECTION = "selection"
    NONE = "none"


# Which error types count as evidence for which gap.
ERROR_GAP_MAP: dict[ErrorType, GapType] = {
    ErrorType.KNOWLEDGE: GapType.KNOWLEDGE,
    ErrorType.CONCEPT_CONFUSION: GapType.KNOWLEDGE,
    ErrorType.APPLICATION: GapType.APPLICATION,
    ErrorType.INTERPRETATION: GapType.APPLICATION,
    ErrorType.CALCULATION: GapType.EXECUTION,
    ErrorType.CARELESS: GapType.EXECUTION,
    ErrorType.QUESTION_SELECTION: GapType.SELECTION,
    ErrorType.TIME_MANAGEMENT: GapType.SELECTION,
    ErrorType.GUESSING: GapType.SELECTION,
}


class TaskType(str, Enum):
    CONCEPT_LEARNING = "concept_learning"
    REVISION = "revision"
    PRACTICE = "practice"
    TIMED_PRACTICE = "timed_practice"
    SECTIONAL_TEST = "sectional_test"
    MOCK_TEST = "mock_test"
    MOCK_ANALYSIS = "mock_analysis"
    ERROR_LOG_REVIEW = "error_log_review"
    READING = "reading"
    CURRENT_AFFAIRS = "current_affairs"
    VOCABULARY = "vocabulary"
    FORMULA_REVISION = "formula_revision"
    QUESTION_SELECTION_PRACTICE = "question_selection_practice"
    MAINTENANCE_PRACTICE = "maintenance_practice"


# Cognitive load on a 1-3 scale. Configurable via ScoringConfig if needed later.
TASK_LOAD: dict[TaskType, int] = {
    TaskType.CONCEPT_LEARNING: 3,
    TaskType.PRACTICE: 3,
    TaskType.TIMED_PRACTICE: 3,
    TaskType.SECTIONAL_TEST: 3,
    TaskType.MOCK_TEST: 3,
    TaskType.QUESTION_SELECTION_PRACTICE: 3,
    TaskType.MOCK_ANALYSIS: 2,
    TaskType.REVISION: 2,
    TaskType.ERROR_LOG_REVIEW: 2,
    TaskType.READING: 2,
    TaskType.MAINTENANCE_PRACTICE: 2,
    TaskType.FORMULA_REVISION: 1,
    TaskType.CURRENT_AFFAIRS: 1,
    TaskType.VOCABULARY: 1,
}

TASK_LABEL: dict[TaskType, str] = {
    TaskType.CONCEPT_LEARNING: "Concept learning",
    TaskType.REVISION: "Revision",
    TaskType.PRACTICE: "Practice",
    TaskType.TIMED_PRACTICE: "Timed practice",
    TaskType.SECTIONAL_TEST: "Sectional test",
    TaskType.MOCK_TEST: "Mock test",
    TaskType.MOCK_ANALYSIS: "Mock analysis",
    TaskType.ERROR_LOG_REVIEW: "Error log review",
    TaskType.READING: "Reading",
    TaskType.CURRENT_AFFAIRS: "Current affairs",
    TaskType.VOCABULARY: "Vocabulary",
    TaskType.FORMULA_REVISION: "Formula revision",
    TaskType.QUESTION_SELECTION_PRACTICE: "Question-selection practice",
    TaskType.MAINTENANCE_PRACTICE: "Maintenance practice",
}


class SubjectKind(str, Enum):
    QUANTITATIVE = "quantitative"
    VERBAL = "verbal"
    REASONING = "reasoning"
    KNOWLEDGE = "knowledge"  # e.g. General Studies


@dataclass(frozen=True)
class Exam:
    id: str
    name: str
    exam_date: date
    user_priority: float = 1.0
    active: bool = True


@dataclass(frozen=True)
class Subject:
    id: str
    exam_id: str
    name: str
    kind: SubjectKind = SubjectKind.QUANTITATIVE
    importance: float = 1.0          # 0..1 relative weight within the exam
    user_priority: float = 1.0
    cadence_days: int = 3            # desired maximum gap between sessions


@dataclass(frozen=True)
class Topic:
    id: str
    subject_id: str
    name: str
    importance: int = 3              # 1..5
    coverage: float = 0.0            # 0..1 share of syllabus studied
    self_mastery: Optional[float] = None  # onboarding self-assessment 0..1
    prerequisite_ids: tuple[str, ...] = ()
    user_priority: float = 1.0
    active: bool = True


@dataclass(frozen=True)
class Attempt:
    """One question attempt, from a mock or from logged practice."""
    topic_id: str
    on: date
    correct: Optional[bool]          # None = skipped / not attempted
    time_sec: Optional[float] = None
    expected_time_sec: Optional[float] = None
    error_type: Optional[ErrorType] = None
    source_id: str = ""
    source_kind: str = "practice"    # "mock" | "practice"


@dataclass(frozen=True)
class PracticeLog:
    topic_id: str
    on: date
    minutes: int
    task_type: TaskType = TaskType.PRACTICE


@dataclass(frozen=True)
class SkippedTask:
    topic_id: str
    on: date
    reason: Optional[str] = None     # too_tired | not_enough_time | difficult | lost_focus | commitment | other


@dataclass(frozen=True)
class PendingMockAnalysis:
    mock_id: str
    exam_id: str
    name: str
    taken_on: date


@dataclass(frozen=True)
class FixedBlock:
    start: int                       # minutes since midnight
    end: int
    kind: str                        # class | rehab | commitment | pinned_study
    label: str = ""
    topic_id: Optional[str] = None   # for pinned_study blocks
    task_type: Optional[TaskType] = None


@dataclass(frozen=True)
class DayConstraints:
    day_start: int = 7 * 60
    day_end: int = 23 * 60
    fixed_blocks: tuple[FixedBlock, ...] = ()
    study_min: int = 300
    study_max: int = 420
    rejuvenation_min: int = 180
    preferred_block: int = 60
    max_block: int = 90
    break_minutes: int = 15
    available_study_minutes: Optional[int] = None  # user-entered cap for today


@dataclass(frozen=True)
class CheckIn:
    sleep_hours: Optional[float] = None
    sleep_quality: Optional[int] = None   # 1..5
    energy: Optional[int] = None          # 1..10
    stress: Optional[int] = None          # 1..10
    mental_fatigue: Optional[int] = None  # 1..10


@dataclass(frozen=True)
class PlanRequest:
    today: date
    exams: tuple[Exam, ...]
    subjects: tuple[Subject, ...]
    topics: tuple[Topic, ...]
    attempts: tuple[Attempt, ...] = ()
    practice_logs: tuple[PracticeLog, ...] = ()
    skipped: tuple[SkippedTask, ...] = ()
    pending_mock_analyses: tuple[PendingMockAnalysis, ...] = ()
    constraints: DayConstraints = field(default_factory=DayConstraints)
    checkin: Optional[CheckIn] = None
    duration_samples: tuple[tuple[int, int], ...] = ()  # (planned_min, actual_min)


@dataclass
class Candidate:
    """A scored study activity before scheduling."""
    key: str
    exam_id: str
    subject_id: Optional[str]
    topic_id: Optional[str]
    title: str
    task_type: TaskType
    duration: int
    cognitive_load: int
    score: float
    factors: dict[str, float]
    reasons: list[str]
    gap: GapType = GapType.NONE
    mock_id: Optional[str] = None


@dataclass
class PlanItem:
    start: int
    end: int
    exam_id: str
    subject_id: Optional[str]
    topic_id: Optional[str]
    title: str
    task_type: TaskType
    duration: int
    cognitive_load: int
    score: float
    priority: str                    # HIGH | MEDIUM | LOW
    reasons: list[str]
    factors: dict[str, float]
    gap: GapType
    mock_id: Optional[str] = None
    pinned: bool = False


@dataclass
class BudgetBreakdown:
    free_minutes: int
    fixed_minutes: int
    rejuvenation_reserved: int
    study_budget: int
    pinned_study_minutes: int
    estimation_ratio: float
    notes: list[str]


@dataclass
class PlanResult:
    today: date
    readiness: Optional[float]
    readiness_notes: list[str]
    budget: BudgetBreakdown
    items: list[PlanItem]
    alternatives: list[Candidate]
    warnings: list[str]
