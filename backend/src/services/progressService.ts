/**
 * Multi-dimensional progress. Each metric returns its value, the formula, and its sample;
 * metrics without enough data return null with a reason instead of a made-up number.
 */
import { prisma } from "../lib/prisma.js";
import { addDays, daysBetween, isoDate, toDateOnly } from "../lib/dates.js";
import { analytics } from "./analyticsClient.js";
import { buildPlanRequest } from "./planInput.js";

export interface Metric {
  value: number | null;
  formula: string;
  sample: string;
}

type TopicReport = {
  topic_id: string; subject_id: string; name: string; coverage: number; mastery: number; accuracy: number | null;
  correct: number; incorrect: number; sufficient: boolean; trend: string | null; last_practiced: string | null;
  speed_ratio: number | null; diagnosis: { gap: string } | null;
};

const MIN_ANSWERED = 20;

export async function topicReports(userId: string, date: string): Promise<TopicReport[]> {
  const req = await buildPlanRequest(userId, date);
  if (!req.topics.length) return [];
  return (await analytics.topics(req)) as unknown as TopicReport[];
}

export async function examProgress(userId: string, date: string) {
  const [exams, reports, sessions] = await Promise.all([
    prisma.exam.findMany({ where: { userId }, include: { subjects: { include: { topics: true } } } }),
    topicReports(userId, date),
    prisma.studySession.findMany({
      where: { userId, startedAt: { gte: toDateOnly(addDays(date, -13)) }, topicId: { not: null } },
      select: { startedAt: true, topic: { select: { subject: { select: { examId: true } } } } },
    }),
  ]);
  const byTopic = new Map(reports.map((r) => [r.topic_id, r]));

  return exams.map((exam) => {
    const topics = exam.subjects.flatMap((s) => s.topics.filter((t) => t.active));
    const w = topics.reduce((a, t) => a + t.importance, 0) || 1;
    const rs = topics.map((t) => ({ t, r: byTopic.get(t.id) }));
    const answered = rs.reduce((a, { r }) => a + (r ? r.correct + r.incorrect : 0), 0);
    const correct = rs.reduce((a, { r }) => a + (r?.correct ?? 0), 0);
    const studyDays = new Set(
      sessions.filter((s) => s.topic?.subject.examId === exam.id).map((s) => isoDate(s.startedAt))).size;

    const metrics: Record<string, Metric> = {
      coverage: {
        value: topics.length ? rs.reduce((a, { t }) => a + t.coverage * t.importance, 0) / w : null,
        formula: "Importance-weighted average of topic coverage",
        sample: `${topics.length} topics`,
      },
      mastery: {
        value: topics.length ? rs.reduce((a, { t, r }) => a + (r?.mastery ?? 0) * t.importance, 0) / w : null,
        formula: "Importance-weighted mastery: 70% recency-weighted accuracy (shrunk toward your self-assessment) + 30% coverage, capped by accuracy",
        sample: `${answered} answered questions`,
      },
      performance: {
        value: answered >= MIN_ANSWERED ? correct / answered : null,
        formula: "Correct ÷ answered across mocks and logged practice (last 120 days)",
        sample: answered >= MIN_ANSWERED ? `${answered} answered questions` : `Not enough data yet (${answered}/${MIN_ANSWERED})`,
      },
      consistency: {
        value: studyDays / 14,
        formula: "Days with at least one logged session for this exam in the last 14 days ÷ 14",
        sample: `${studyDays} of 14 days`,
      },
    };
    return {
      id: exam.id, name: exam.name, examDate: isoDate(exam.examDate), active: exam.active,
      daysLeft: daysBetween(date, isoDate(exam.examDate)), metrics,
      subjects: exam.subjects.map((s) => {
        const st = s.topics.filter((t) => t.active);
        const sw = st.reduce((a, t) => a + t.importance, 0) || 1;
        return {
          id: s.id, name: s.name,
          coverage: st.length ? st.reduce((a, t) => a + t.coverage * t.importance, 0) / sw : null,
        };
      }),
    };
  });
}
