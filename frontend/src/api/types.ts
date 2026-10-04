export type TaskStatus = "planned" | "in_progress" | "completed" | "partial" | "skipped";
export type Priority = "HIGH" | "MEDIUM" | "LOW" | "PINNED";

export interface Me { id: string; name: string; email: string; onboarded: boolean; isDemo: boolean }

export interface PlanItem {
  id: string; title: string; taskType: string; examId: string; subjectId: string | null; topicId: string | null;
  mockId: string | null; startMin: number; endMin: number; plannedMin: number; cognitiveLoad: number;
  score: number; priority: Priority; gap: string; reasons: string[]; factors: Record<string, number>;
  pinned: boolean; status: TaskStatus; actualMin: number | null; completionPct: number | null; skipReason: string | null;
}

export interface Budget {
  free_minutes: number; fixed_minutes: number; rejuvenation_reserved: number; study_budget: number;
  pinned_study_minutes: number; estimation_ratio: number; notes: string[];
}

export interface Plan {
  id: string; date: string; version: number; readiness: number | null; budget: Budget; warnings: string[];
  alternatives: Array<{ title: string; score: number; reasons: string[]; duration: number }>; items: PlanItem[];
}

export interface FixedBlock { start: number; end: number; kind: "class" | "rehab" | "commitment" | "pinned_study"; label?: string }

export interface Metric { value: number | null; formula: string; sample: string }

export interface ExamProgress {
  id: string; name: string; examDate: string; active: boolean; daysLeft: number;
  metrics: Record<"coverage" | "mastery" | "performance" | "consistency", Metric>;
  subjects: Array<{ id: string; name: string; coverage: number | null }>;
}

export interface TopicReport {
  topic_id: string; subject_id: string; name: string; coverage: number; mastery: number; sufficient: boolean;
  attempts: number; correct: number; incorrect: number; skipped: number; accuracy: number | null;
  speed_ratio: number | null; trend: "improving" | "declining" | "flat" | null; trend_from: number | null;
  trend_to: number | null; last_practiced: string | null; minutes_14d: number;
  error_counts: Record<string, number>; diagnosis: { gap: string; task_type: string; detail: string; reasons: string[] } | null;
}

export interface CheckIn {
  sleepHours: number | null; sleepQuality: number | null; energy: number | null; stress: number | null;
  mentalFatigue: number | null; legDiscomfort: number | null; wristDiscomfort: number | null;
  physicalDiscomfort: number | null; availableStudyMin: number | null; readiness: number | null;
  readinessDetail: { components: Record<string, number>; notes: string[] } | null;
}

export interface Dashboard {
  date: string; name: string; isDemo: boolean;
  time: { classesMin: number; rehabMin: number; commitmentsMin: number; rejuvenationTargetMin: number;
    freeMin: number | null; studyTargetMin: number | null; completedStudyMin: number };
  checkin: { sleepHours: number | null; energy: number | null; stress: number | null; readiness: number | null } | null;
  exams: ExamProgress[]; plan: Plan | null; topicHealth: TopicReport[] | null;
  rehab: Array<{ id: string; name: string; dailyMin: number; today: string | null }>;
  week: { start: string; plannedMin: number; completedMin: number; daysWithPlan: number };
}

export interface Topic { id: string; name: string; importance: number; coverage: number; status: string; userPriority: number; active: boolean }
export interface Subject { id: string; name: string; kind: string; userPriority: number; cadenceDays: number; topics: Topic[] }
export interface Exam { id: string; name: string; examDate: string; userPriority: number; active: boolean; subjects: Subject[] }
