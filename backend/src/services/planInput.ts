/**
 * Builds the analytics PlanRequest for one user and one date, from stored facts only.
 * This is data assembly; all scoring happens in the analytics service.
 */
import type { TopicStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { addDays, isoDate, toDateOnly, weekday } from "../lib/dates.js";
import type { FixedBlockDTO, PlanRequestDTO } from "./analyticsClient.js";

/** Onboarding self-assessment -> prior accuracy used only until real data exists. */
export const STATUS_PRIOR: Record<TopicStatus, number> = {
  not_started: 0.1,
  learning: 0.35,
  familiar: 0.6,
  strong: 0.8,
};

const HISTORY_DAYS = 120;

/** A fixed block plus where it came from, so the calendar can edit it. The planner only sees the plain fields. */
export interface FixedBlockDetail extends FixedBlockDTO {
  source: "class" | "commitment" | "rehab";
  refId: string;
  /** Rehab only: this day differs from the programme's normal schedule. */
  overridden?: boolean;
  programId?: string;
  /** Class only: cancelled for this date. Only returned when asked for; the planner never sees these. */
  cancelled?: boolean;
}

export async function fixedBlocksDetailed(userId: string, date: string, includeCancelled = false): Promise<FixedBlockDetail[]> {
  const day = toDateOnly(date);
  const wd = weekday(date);
  const [classes, commitments, programs, prefs] = await Promise.all([
    prisma.classSession.findMany({ where: { userId }, include: { cancellations: { where: { date: day } } } }),
    prisma.commitment.findMany({ where: { userId } }),
    prisma.rehabProgram.findMany({ where: { userId, active: true }, include: { overrides: { where: { date: day } } } }),
    prisma.userPreference.findUnique({ where: { userId } }),
  ]);
  const onDay = (x: { weekdays: number[]; date: Date | null }) =>
    x.date ? isoDate(x.date) === date : x.weekdays.includes(wd);
  const blocks: FixedBlockDetail[] = [];
  for (const c of classes) {
    const inRange = (!c.validFrom || c.validFrom <= day) && (!c.validTo || c.validTo >= day);
    if (!onDay(c) || !inRange) continue;
    const cancelled = c.cancellations.length > 0;
    if (cancelled && !includeCancelled) continue;
    blocks.push({ start: c.startMin, end: c.endMin, kind: "class", label: c.title, source: "class", refId: c.id, cancelled });
  }
  for (const c of commitments) {
    if (onDay(c)) blocks.push({ start: c.startMin, end: c.endMin, kind: "commitment", label: c.title, source: "commitment", refId: c.id });
  }
  // Rehab is a fixed commitment. Order of precedence: this date's override, then the programme's
  // weekly schedule and usual start. With no start anywhere it goes at the end of the day.
  let tail = prefs?.dayEndMin ?? 1380;
  for (const p of programs) {
    const o = p.overrides[0];
    if (o?.skip) continue;
    if (!o && !p.weekdays.includes(wd)) continue;
    const duration = o?.durationMin ?? p.dailyMin;
    const start = o?.startMin ?? p.preferredStartMin ?? (tail -= duration);
    blocks.push({ start, end: start + duration, kind: "rehab", label: `${p.name} rehab`, source: "rehab", refId: p.id,
      programId: p.id, overridden: !!o });
  }
  return blocks;
}

export async function fixedBlocksFor(userId: string, date: string): Promise<FixedBlockDTO[]> {
  return (await fixedBlocksDetailed(userId, date)).map(({ start, end, kind, label }) => ({ start, end, kind, label }));
}

/** Things the user removed from this day. The planner treats them as unavailable for the day. */
export interface DayExclusions { topicIds: Set<string>; mockIds: Set<string> }

export async function buildPlanRequest(
  userId: string, date: string, pinned: FixedBlockDTO[] = [], exclude?: DayExclusions,
): Promise<PlanRequestDTO> {
  const since = toDateOnly(addDays(date, -HISTORY_DAYS));
  const day = toDateOnly(date);

  const [exams, attempts, mockQs, sessions, skipped, pendingMocks, prefs, checkin, samples, blocks] = await Promise.all([
    prisma.exam.findMany({
      where: { userId },
      include: { subjects: { include: { topics: { include: { prerequisites: true } } } } },
    }),
    prisma.questionAttempt.findMany({ where: { userId, on: { gte: since, lte: day } } }),
    prisma.mockQuestion.findMany({
      where: { mock: { userId, takenOn: { gte: since, lte: day } }, topicId: { not: null } },
      include: { mock: { select: { id: true, takenOn: true } } },
    }),
    prisma.studySession.findMany({
      where: { userId, topicId: { not: null }, startedAt: { gte: since } },
      select: { topicId: true, startedAt: true, activeMin: true, taskType: true },
    }),
    prisma.dailyPlanItem.findMany({
      where: { status: "skipped", topicId: { not: null }, plan: { userId, date: { gte: toDateOnly(addDays(date, -3)), lt: day } } },
      include: { plan: { select: { date: true } } },
    }),
    prisma.mock.findMany({ where: { userId, analysedAt: null, takenOn: { gte: toDateOnly(addDays(date, -14)), lte: day } } }),
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.dailyCheckIn.findUnique({ where: { userId_date: { userId, date: day } } }),
    prisma.studySession.findMany({
      where: { userId, plannedMin: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 60,
      select: { plannedMin: true, activeMin: true },
    }),
    fixedBlocksFor(userId, date),
  ]);

  const subjects = exams.flatMap((e) => e.subjects);
  const topics = subjects.flatMap((s) => s.topics);

  return {
    today: date,
    exams: exams.map((e) => ({
      id: e.id, name: e.name, exam_date: isoDate(e.examDate), user_priority: e.userPriority, active: e.active,
    })),
    subjects: subjects.map((s) => ({
      id: s.id, exam_id: s.examId, name: s.name, kind: s.kind, importance: s.importance,
      user_priority: s.userPriority, cadence_days: s.cadenceDays,
    })),
    topics: topics.map((t) => ({
      id: t.id, subject_id: t.subjectId, name: t.name, importance: t.importance, coverage: t.coverage,
      self_mastery: STATUS_PRIOR[t.status], prerequisite_ids: t.prerequisites.map((p) => p.prerequisiteId),
      user_priority: t.userPriority, active: t.active && !exclude?.topicIds.has(t.id),
    })),
    attempts: [
      ...attempts.map((a) => ({
        topic_id: a.topicId, on: isoDate(a.on), correct: a.correct, time_sec: a.timeSec,
        expected_time_sec: a.expectedSec, error_type: a.errorType, source_id: a.sourceId, source_kind: "practice",
      })),
      ...mockQs.map((q) => ({
        topic_id: q.topicId as string, on: isoDate(q.mock.takenOn), correct: q.attempted ? q.correct : null,
        time_sec: q.timeSec, expected_time_sec: q.expectedSec, error_type: q.errorType,
        source_id: q.mock.id, source_kind: "mock",
      })),
    ],
    practice_logs: sessions.map((s) => ({
      topic_id: s.topicId as string, on: isoDate(s.startedAt), minutes: s.activeMin, task_type: s.taskType,
    })),
    skipped: skipped.map((s) => ({ topic_id: s.topicId as string, on: isoDate(s.plan.date), reason: s.skipReason })),
    pending_mock_analyses: pendingMocks.filter((m) => !exclude?.mockIds.has(m.id)).map((m) => ({
      mock_id: m.id, exam_id: m.examId, name: m.name, taken_on: isoDate(m.takenOn),
    })),
    constraints: {
      day_start: prefs?.dayStartMin, day_end: prefs?.dayEndMin, study_min: prefs?.studyMinMin,
      study_max: prefs?.studyMaxMin, rejuvenation_min: prefs?.rejuvenationMinMin,
      preferred_block: prefs?.preferredBlockMin, max_block: prefs?.maxBlockMin, break_minutes: prefs?.breakMin,
      available_study_minutes: checkin?.availableStudyMin ?? null,
      fixed_blocks: [...blocks, ...pinned],
    },
    checkin: checkin && {
      sleep_hours: checkin.sleepHours, sleep_quality: checkin.sleepQuality, energy: checkin.energy,
      stress: checkin.stress, mental_fatigue: checkin.mentalFatigue,
    },
    duration_samples: samples.map((s) => [s.plannedMin as number, s.activeMin] as [number, number]),
  };
}
