import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ah, HttpError, notFound } from "../lib/http.js";
import { body } from "../middleware/validate.js";
import { uid } from "../middleware/auth.js";
import { addItem, clearSuggestions, completeItem, moveItem, removeItem, skipItem, startItem } from "../services/planService.js";
import { userToday } from "../lib/user.js";

export const tasksRouter = Router();

const TASK_TYPES = ["concept_learning", "revision", "practice", "timed_practice", "sectional_test", "mock_test",
  "mock_analysis", "error_log_review", "reading", "current_affairs", "vocabulary", "formula_revision",
  "question_selection_practice", "maintenance_practice"] as const;

/** Add a task of your own to a day (today or later). Returns the updated plan. */
tasksRouter.post("/tasks", ah(async (req, res) => {
  const userId = uid(req);
  const i = body(req, z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    topicId: z.string().optional(), title: z.string().trim().min(1).max(120).optional(),
    taskType: z.enum(TASK_TYPES).default("practice"),
    startMin: z.number().int().min(0).max(1439), durationMin: z.number().int().min(10).max(300),
  }).refine((x) => !!x.topicId || !!x.title, "Pick a topic or give the task a name"));
  const { today } = await userToday(userId);
  const date = i.date ?? today;
  if (date < today) throw new HttpError(400, "You can't add tasks to a past day");
  res.status(201).json(await addItem(userId, date, { topicId: i.topicId, title: i.title, taskType: i.taskType,
    startMin: i.startMin, durationMin: i.durationMin }));
}));

/** Take a task off the day. */
tasksRouter.delete("/tasks/:id", ah(async (req, res) => {
  res.json(await removeItem(uid(req), req.params.id!));
}));

/** Remove everything not yet started from a day, so you can build it yourself. */
tasksRouter.post("/plan/clear", ah(async (req, res) => {
  const userId = uid(req);
  const i = body(req, z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }));
  const { today } = await userToday(userId);
  res.json(await clearSuggestions(userId, i.date ?? today));
}));

tasksRouter.post("/tasks/:id/start", ah(async (req, res) => {
  res.json(await startItem(uid(req), req.params.id!));
}));

tasksRouter.post("/tasks/:id/complete", ah(async (req, res) => {
  const i = body(req, z.object({
    actualMin: z.number().int().min(0).max(600).optional(),
    completionPct: z.number().int().min(1).max(100).optional(),
  }));
  res.json(await completeItem(uid(req), req.params.id!, i));
}));

tasksRouter.post("/tasks/:id/skip", ah(async (req, res) => {
  const i = body(req, z.object({
    reason: z.enum(["too_tired", "not_enough_time", "difficult", "lost_focus", "commitment", "other"]).optional(),
    note: z.string().max(500).optional(),
  }));
  res.json(await skipItem(uid(req), req.params.id!, i));
}));

/** Moving a block pins it and re-plans the rest of the day. Returns the new plan. */
tasksRouter.patch("/tasks/:id", ah(async (req, res) => {
  const i = body(req, z.object({ startMin: z.number().int().min(0).max(1439) }));
  res.json(await moveItem(uid(req), req.params.id!, i.startMin));
}));

/** Study timer: one finished session. activeMin excludes pauses and feeds calibration. */
tasksRouter.post("/sessions", ah(async (req, res) => {
  const userId = uid(req);
  const i = body(req, z.object({
    planItemId: z.string().optional(), topicId: z.string().optional(),
    taskType: z.enum(["concept_learning", "revision", "practice", "timed_practice", "sectional_test", "mock_test",
      "mock_analysis", "error_log_review", "reading", "current_affairs", "vocabulary", "formula_revision",
      "question_selection_practice", "maintenance_practice"]).default("practice"),
    startedAt: z.string().datetime(), endedAt: z.string().datetime(),
    activeMin: z.number().int().min(1).max(600),
  }));
  let plannedMin: number | null = null;
  let topicId = i.topicId ?? null;
  let taskType = i.taskType;
  if (i.planItemId) {
    const item = await prisma.dailyPlanItem.findFirst({ where: { id: i.planItemId, plan: { userId } } });
    if (!item) throw notFound("Task");
    plannedMin = item.plannedMin;
    topicId = item.topicId;
    taskType = item.taskType;
  } else if (topicId) {
    const t = await prisma.topic.findFirst({ where: { id: topicId, subject: { exam: { userId } } } });
    if (!t) throw notFound("Topic");
  }
  const session = await prisma.studySession.create({
    data: { userId, planItemId: i.planItemId, topicId, taskType, startedAt: new Date(i.startedAt),
      endedAt: new Date(i.endedAt), activeMin: i.activeMin, plannedMin },
  });
  res.status(201).json(session);
}));

/** Practice questions logged outside mocks (drills, sectionals). */
tasksRouter.post("/attempts", ah(async (req, res) => {
  const userId = uid(req);
  const i = body(req, z.object({
    topicId: z.string(), on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), sourceId: z.string().min(1).max(100),
    attempts: z.array(z.object({
      correct: z.boolean().nullable(), timeSec: z.number().int().min(0).max(7200).optional(),
      expectedSec: z.number().int().min(1).max(7200).optional(),
      errorType: z.enum(["knowledge", "concept_confusion", "application", "calculation", "careless",
        "time_management", "question_selection", "interpretation", "guessing", "unknown"]).optional(),
      difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    })).min(1).max(200),
  }));
  const t = await prisma.topic.findFirst({ where: { id: i.topicId, subject: { exam: { userId } } } });
  if (!t) throw notFound("Topic");
  const r = await prisma.questionAttempt.createMany({
    data: i.attempts.map((a) => ({ ...a, userId, topicId: i.topicId, sourceId: i.sourceId, on: new Date(`${i.on}T00:00:00Z`) })),
  });
  res.status(201).json({ created: r.count });
}));
