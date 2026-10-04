import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ah } from "../lib/http.js";
import { query } from "../middleware/validate.js";
import { uid } from "../middleware/auth.js";
import { addDays, isoDate, toDateOnly, weekStart } from "../lib/dates.js";
import { userToday } from "../lib/user.js";
import { analytics } from "../services/analyticsClient.js";
import { buildPlanRequest } from "../services/planInput.js";
import { latestPlansBetween } from "../services/weekService.js";

export const reviewRouter = Router();

/** Builds the weekly review from stored facts and caches it. Pass week=YYYY-MM-DD (any day in the week). */
reviewRouter.get("/weekly-review", ah(async (req, res) => {
  const userId = uid(req);
  const { today } = await userToday(userId);
  const q = query(req, z.object({ week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), refresh: z.enum(["1"]).optional() }));
  const start = weekStart(q.week ?? today);
  const end = addDays(start, 6);
  const cached = await prisma.weeklyReview.findUnique({ where: { userId_weekStart: { userId, weekStart: toDateOnly(start) } } });
  // Past weeks are immutable once generated; the current week is rebuilt on request.
  if (cached && !q.refresh && end < today) return res.json(cached.data);

  const prevStart = addDays(start, -7);
  const [plans, exams, attempts, mockQs, rehab, programs] = await Promise.all([
    latestPlansBetween(userId, start, end),
    prisma.exam.findMany({ where: { userId }, include: { subjects: { include: { topics: { select: { id: true, name: true } } } } } }),
    prisma.questionAttempt.findMany({ where: { userId, on: { gte: toDateOnly(prevStart), lte: toDateOnly(end) } } }),
    prisma.mockQuestion.findMany({
      where: { topicId: { not: null }, mock: { userId, takenOn: { gte: toDateOnly(prevStart), lte: toDateOnly(end) } } },
      include: { mock: { select: { takenOn: true } } },
    }),
    prisma.rehabSession.findMany({ where: { userId, date: { gte: toDateOnly(start), lte: toDateOnly(end) } }, include: { program: true } }),
    prisma.rehabProgram.findMany({ where: { userId, active: true } }),
  ]);
  const examName = new Map(exams.map((e) => [e.id, e.name]));
  const subjectName = new Map(exams.flatMap((e) => e.subjects.map((s) => [s.id, s.name] as const)));
  const topicLabel = new Map(exams.flatMap((e) => e.subjects.flatMap((s) => s.topics.map((t) => [t.id, `${t.name} (${e.name})`] as const))));

  const payload = {
    week_start: start,
    tasks: plans.flatMap((p) => p.items.map((i) => ({
      on: isoDate(p.date), exam: examName.get(i.examId) ?? "Other", subject: (i.subjectId && subjectName.get(i.subjectId)) || "Mock analysis",
      planned_min: i.plannedMin, actual_min: i.actualMin ?? 0,
      status: i.status === "planned" || i.status === "in_progress" ? "pending" : i.status,
    }))),
    attempts: [
      ...attempts.map((a) => ({ on: isoDate(a.on), topic: topicLabel.get(a.topicId) ?? a.topicId, correct: a.correct })),
      ...mockQs.map((m) => ({ on: isoDate(m.mock.takenOn), topic: topicLabel.get(m.topicId!) ?? "Untagged",
        correct: m.attempted ? m.correct : null })),
    ],
    rehab: rehab.map((r) => ({ on: isoDate(r.date), program: r.program.name, status: r.status })),
    rehab_programs: programs.map((p) => p.name),
    plan_request: end >= today ? await buildPlanRequest(userId, today) : null,
  };
  if (!payload.plan_request?.topics.length) payload.plan_request = null;
  const data = await analytics.weekly(payload);
  await prisma.weeklyReview.upsert({
    where: { userId_weekStart: { userId, weekStart: toDateOnly(start) } },
    create: { userId, weekStart: toDateOnly(start), data: data as Prisma.InputJsonValue },
    update: { data: data as Prisma.InputJsonValue },
  });
  res.json(data);
}));
