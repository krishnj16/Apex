import type { Prisma, SkipReason, TaskStatus, TaskType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HttpError, notFound } from "../lib/http.js";
import { isoDate, toDateOnly } from "../lib/dates.js";
import { analytics, ENGINE_VERSION, type FixedBlockDTO } from "./analyticsClient.js";
import { buildPlanRequest, fixedBlocksFor } from "./planInput.js";

const KEEP = new Set(["completed", "partial", "in_progress"]);

/** The plan as the user sees it: tasks they removed are hidden. */
export async function latestPlan(userId: string, date: string) {
  return prisma.dailyPlan.findFirst({
    where: { userId, date: toDateOnly(date) },
    orderBy: { version: "desc" },
    include: { items: { where: { status: { not: "removed" } }, orderBy: { startMin: "asc" } } },
  });
}

/** Includes removed tasks; only used to carry the user's removals into the next version. */
async function latestPlanRaw(userId: string, date: string) {
  return prisma.dailyPlan.findFirst({
    where: { userId, date: toDateOnly(date) },
    orderBy: { version: "desc" },
    include: { items: { orderBy: { startMin: "asc" } } },
  });
}

/**
 * Generates (or regenerates) the plan for a date. Work already done, in progress, or
 * manually placed is kept as pinned blocks; everything else is re-planned from scratch.
 */
export async function generatePlan(userId: string, date: string) {
  const current = await latestPlanRaw(userId, date);
  const removed = (current?.items ?? []).filter((i) => i.status === "removed");
  const exclude = {
    topicIds: new Set(removed.map((i) => i.topicId).filter((t): t is string => !!t)),
    mockIds: new Set(removed.map((i) => i.mockId).filter((m): m is string => !!m)),
  };
  const kept = (current?.items ?? []).filter((i) => i.status !== "removed" && (i.pinned || KEEP.has(i.status)));
  const pinned: FixedBlockDTO[] = kept.map((i) => ({
    start: i.startMin, end: i.endMin, kind: "pinned_study", label: i.title, topic_id: i.topicId, task_type: i.taskType,
  }));

  const request = await buildPlanRequest(userId, date, pinned, exclude);
  if (request.exams.length === 0) throw new HttpError(409, "Add an exam and its syllabus before generating a plan.");
  const result = await analytics.dailyPlan(request);

  const keptByKey = new Map(kept.map((i) => [`${i.startMin}-${i.endMin}-${i.topicId ?? ""}`, i]));

  const fresh = result.items.map((it) => {
    const prev = it.pinned ? keptByKey.get(`${it.start}-${it.end}-${it.topic_id ?? ""}`) : undefined;
    return {
      topicId: it.topic_id, examId: it.exam_id || prev?.examId || "", subjectId: it.subject_id,
      mockId: it.mock_id, title: it.title, taskType: it.task_type as TaskType,
      startMin: it.start, endMin: it.end, plannedMin: it.duration, cognitiveLoad: it.cognitive_load,
      score: it.score, priority: it.priority, gap: it.gap,
      reasons: prev ? prev.reasons : it.reasons,
      factors: (prev ? prev.factors : it.factors) as Prisma.InputJsonValue,
      pinned: it.pinned,
      status: (prev?.status ?? "planned") as TaskStatus, actualMin: prev?.actualMin, completionPct: prev?.completionPct,
      completedAt: prev?.completedAt,
    };
  });
  // The user's removals are carried into the new version so they stay removed.
  const carried = removed.map((r) => ({
    topicId: r.topicId, examId: r.examId, subjectId: r.subjectId, mockId: r.mockId, title: r.title,
    taskType: r.taskType, startMin: r.startMin, endMin: r.endMin, plannedMin: r.plannedMin,
    cognitiveLoad: r.cognitiveLoad, score: r.score, priority: r.priority, gap: r.gap, reasons: r.reasons,
    factors: r.factors as Prisma.InputJsonValue, pinned: false, status: "removed" as TaskStatus,
  }));

  await prisma.dailyPlan.create({
    data: {
      userId,
      date: toDateOnly(date),
      version: (current?.version ?? 0) + 1,
      readiness: result.readiness,
      budget: result.budget as Prisma.InputJsonValue,
      warnings: result.warnings,
      alternatives: result.alternatives as unknown as Prisma.InputJsonValue,
      engineVersion: ENGINE_VERSION,
      items: { create: [...fresh, ...carried] },
    },
  });
  return latestPlan(userId, date);
}

async function ownedItem(userId: string, id: string) {
  const item = await prisma.dailyPlanItem.findFirst({ where: { id, plan: { userId } }, include: { plan: true } });
  if (!item) throw notFound("Task");
  return item;
}

export async function completeItem(userId: string, id: string, input: { actualMin?: number; completionPct?: number }) {
  const item = await ownedItem(userId, id);
  const pct = input.completionPct ?? 100;
  const status = pct >= 100 ? "completed" : "partial";
  const actual = input.actualMin ?? Math.round((item.plannedMin * pct) / 100);
  const timerLogged = await prisma.studySession.count({ where: { planItemId: id } });

  return prisma.$transaction(async (tx) => {
    // A completion without a timer still counts as practice, so recency stays truthful.
    if (!timerLogged && actual > 0) {
      const startedAt = new Date(item.plan.date.getTime() + item.startMin * 60_000);
      await tx.studySession.create({
        data: {
          userId, topicId: item.topicId, planItemId: id, taskType: item.taskType, startedAt,
          endedAt: new Date(startedAt.getTime() + actual * 60_000), activeMin: actual,
          plannedMin: input.actualMin !== undefined ? item.plannedMin : null, // only real measurements calibrate
        },
      });
    }
    if (item.mockId && item.taskType === "mock_analysis" && status === "completed") {
      await tx.mock.updateMany({ where: { id: item.mockId, userId }, data: { analysedAt: new Date() } });
    }
    return tx.dailyPlanItem.update({
      where: { id },
      data: { status, actualMin: actual, completionPct: pct, completedAt: new Date() },
    });
  });
}

export async function skipItem(userId: string, id: string, input: { reason?: SkipReason; note?: string }) {
  await ownedItem(userId, id);
  return prisma.dailyPlanItem.update({
    where: { id },
    data: { status: "skipped", skipReason: input.reason, skipNote: input.note },
  });
}

/** Moving a block pins it; the remaining unfinished blocks are re-planned around it. */
export async function moveItem(userId: string, id: string, startMin: number) {
  const item = await ownedItem(userId, id);
  const len = item.endMin - item.startMin;
  if (startMin < 0 || startMin + len > 24 * 60) throw new HttpError(400, "Block must stay within the day");
  await prisma.dailyPlanItem.update({ where: { id }, data: { startMin, endMin: startMin + len, pinned: true } });
  const iso = isoDate(item.plan.date);
  // If the user has built the day by hand (nothing auto-suggested is left), do not refill it.
  const suggested = await prisma.dailyPlanItem.count({
    where: { planId: item.planId, id: { not: id }, status: "planned", pinned: false },
  });
  return suggested > 0 ? generatePlan(userId, iso) : latestPlan(userId, iso);
}

export async function startItem(userId: string, id: string) {
  await ownedItem(userId, id);
  return prisma.dailyPlanItem.update({ where: { id }, data: { status: "in_progress" } });
}

/** Takes a task off the day. Its topic is not suggested again today; this is not a missed task. */
export async function removeItem(userId: string, id: string) {
  const item = await ownedItem(userId, id);
  if (item.status !== "planned" && item.status !== "skipped") {
    throw new HttpError(409, "You have already worked on this task, so it can't be removed. Finish or skip it instead.");
  }
  await prisma.dailyPlanItem.update({ where: { id }, data: { status: "removed" } });
  return latestPlan(userId, isoDate(item.plan.date));
}

/** Removes every task not yet started, leaving the day empty for you to build. */
export async function clearSuggestions(userId: string, date: string) {
  const current = await latestPlanRaw(userId, date);
  if (!current) return null;
  await prisma.dailyPlanItem.updateMany({ where: { planId: current.id, status: "planned" }, data: { status: "removed" } });
  return latestPlan(userId, date);
}

const LOAD: Partial<Record<TaskType, number>> = {
  concept_learning: 3, timed_practice: 3, sectional_test: 3, mock_test: 3,
  practice: 2, question_selection_practice: 2, mock_analysis: 2, error_log_review: 2, revision: 2,
};
const LABEL: Record<string, string> = {
  concept_learning: "Learn concepts", revision: "Revision", practice: "Practice", timed_practice: "Timed practice",
  sectional_test: "Sectional test", mock_test: "Mock test", mock_analysis: "Mock analysis", error_log_review: "Error log review",
  reading: "Reading", current_affairs: "Current affairs", vocabulary: "Vocabulary", formula_revision: "Formula revision",
  question_selection_practice: "Question selection", maintenance_practice: "Maintenance practice",
};
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** A task you place yourself. It is pinned, so later re-plans work around it and never move it. */
export async function addItem(userId: string, date: string, input: {
  topicId?: string; title?: string; taskType: TaskType; startMin: number; durationMin: number;
}) {
  const endMin = input.startMin + input.durationMin;
  if (endMin > 24 * 60) throw new HttpError(400, "The task must finish before midnight");

  let topic: { id: string; name: string; subjectId: string; subject: { examId: string } } | null = null;
  if (input.topicId) {
    topic = await prisma.topic.findFirst({
      where: { id: input.topicId, subject: { exam: { userId } } },
      select: { id: true, name: true, subjectId: true, subject: { select: { examId: true } } },
    });
    if (!topic) throw notFound("Topic");
  }
  const title = input.title?.trim() || `${topic!.name} — ${LABEL[input.taskType] ?? input.taskType}`;

  const current = await latestPlanRaw(userId, date);
  const busy = [
    ...(await fixedBlocksFor(userId, date)).map((b) => ({ s: b.start, e: b.end, label: b.label ?? b.kind })),
    ...(current?.items ?? []).filter((i) => i.status !== "removed" && i.status !== "skipped")
      .map((i) => ({ s: i.startMin, e: i.endMin, label: i.title })),
  ];
  const clash = busy.find((b) => input.startMin < b.e && endMin > b.s);
  if (clash) {
    throw new HttpError(409, `That overlaps ${clash.label} (${clock(clash.s)}–${clock(clash.e)}). Pick another time or remove that first.`);
  }

  const plan = current ?? await prisma.dailyPlan.create({
    data: {
      userId, date: toDateOnly(date), version: 1, warnings: [], alternatives: [], engineVersion: ENGINE_VERSION,
      budget: { free_minutes: 0, fixed_minutes: 0, rejuvenation_reserved: 0, study_budget: 0, pinned_study_minutes: 0,
        estimation_ratio: 1, notes: ["You planned this day yourself. Use Re-plan if you want suggestions added around your tasks."] },
    },
  });
  await prisma.dailyPlanItem.create({
    data: {
      planId: plan.id, topicId: topic?.id ?? null, examId: topic?.subject.examId ?? "", subjectId: topic?.subjectId ?? null,
      title, taskType: input.taskType, startMin: input.startMin, endMin, plannedMin: input.durationMin,
      cognitiveLoad: LOAD[input.taskType] ?? 1, score: 0, priority: "PINNED", gap: "none",
      reasons: ["Added by you."], factors: {}, pinned: true,
    },
  });
  return latestPlan(userId, date);
}
