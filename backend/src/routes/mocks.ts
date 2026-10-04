import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ah, HttpError, notFound } from "../lib/http.js";
import { body, query } from "../middleware/validate.js";
import { uid } from "../middleware/auth.js";
import { isoDate, toDateOnly } from "../lib/dates.js";
import { analytics } from "../services/analyticsClient.js";

export const mocksRouter = Router();

const section = z.object({
  name: z.string().trim().min(1).max(40), score: z.number(),
  attempted: z.number().int().min(0).default(0), correct: z.number().int().min(0).default(0),
  incorrect: z.number().int().min(0).default(0), skipped: z.number().int().min(0).default(0),
  timeMin: z.number().int().min(0).max(600).optional(),
}).refine((s) => s.correct + s.incorrect <= s.attempted || s.attempted === 0, "correct + incorrect cannot exceed attempted");

const mockInput = z.object({
  examId: z.string(), name: z.string().trim().min(1).max(80), takenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalScore: z.number(), maxScore: z.number().positive().optional(), totalMin: z.number().int().min(0).max(600).optional(),
  sections: z.array(section).max(10).default([]),
});

const question = z.object({
  section: z.string().trim().min(1).max(40), number: z.number().int().min(1).max(500),
  topicId: z.string().nullable().optional(), subtopic: z.string().max(120).optional(),
  attempted: z.boolean(), correct: z.boolean().nullable().optional(),
  timeSec: z.number().int().min(0).max(7200).optional(), expectedSec: z.number().int().min(1).max(7200).optional(),
  errorType: z.enum(["knowledge", "concept_confusion", "application", "calculation", "careless", "time_management",
    "question_selection", "interpretation", "guessing", "unknown"]).nullable().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().optional(),
  confidence: z.number().int().min(1).max(5).nullable().optional(), notes: z.string().max(1000).optional(),
});

const ownMock = async (userId: string, id: string) => {
  const m = await prisma.mock.findFirst({ where: { id, userId } });
  if (!m) throw notFound("Mock");
  return m;
};

mocksRouter.get("/mocks", ah(async (req, res) => {
  const q = query(req, z.object({ examId: z.string().optional() }));
  const mocks = await prisma.mock.findMany({
    where: { userId: uid(req), examId: q.examId }, orderBy: { takenOn: "desc" },
    include: { sections: true, exam: { select: { name: true } }, _count: { select: { questions: true } } },
  });
  res.json(mocks.map((m) => ({ ...m, takenOn: isoDate(m.takenOn) })));
}));

/** Descriptive analytics only: trajectories, topic accuracy, errors, selection. No predictions. */
mocksRouter.get("/mocks/analytics", ah(async (req, res) => {
  const q = query(req, z.object({ examId: z.string() }));
  const mocks = await prisma.mock.findMany({
    where: { userId: uid(req), examId: q.examId }, orderBy: { takenOn: "asc" },
    include: { sections: true, questions: { include: { topic: { select: { name: true } } } } },
  });
  res.json(await analytics.mocks(mocks.map((m) => ({
    id: m.id, name: m.name, taken_on: isoDate(m.takenOn), total_score: m.totalScore,
    sections: m.sections.map((s) => ({ name: s.name, score: s.score, attempted: s.attempted, correct: s.correct,
      incorrect: s.incorrect, skipped: s.skipped })),
    questions: m.questions.map((x) => ({ section: x.section, topic_id: x.topicId, topic_name: x.topic?.name ?? "Untagged",
      attempted: x.attempted, correct: x.attempted ? x.correct : null, time_sec: x.timeSec, error_type: x.errorType })),
  }))));
}));

mocksRouter.post("/mocks", ah(async (req, res) => {
  const userId = uid(req);
  const i = body(req, mockInput);
  const exam = await prisma.exam.findFirst({ where: { id: i.examId, userId } });
  if (!exam) throw notFound("Exam");
  const m = await prisma.mock.create({
    data: { userId, examId: i.examId, name: i.name, takenOn: toDateOnly(i.takenOn), totalScore: i.totalScore,
      maxScore: i.maxScore, totalMin: i.totalMin, sections: { create: i.sections } },
    include: { sections: true },
  });
  res.status(201).json({ ...m, takenOn: isoDate(m.takenOn) });
}));

mocksRouter.get("/mocks/:id", ah(async (req, res) => {
  const m = await prisma.mock.findFirst({
    where: { id: req.params.id, userId: uid(req) },
    include: { sections: true, questions: { orderBy: [{ section: "asc" }, { number: "asc" }] } },
  });
  if (!m) throw notFound("Mock");
  res.json({ ...m, takenOn: isoDate(m.takenOn) });
}));

mocksRouter.delete("/mocks/:id", ah(async (req, res) => {
  await ownMock(uid(req), req.params.id!);
  await prisma.mock.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

/** Upserts question-level rows. Topic ids must belong to the mock's exam. */
mocksRouter.post("/mocks/:id/questions", ah(async (req, res) => {
  const userId = uid(req);
  const mock = await ownMock(userId, req.params.id!);
  const i = body(req, z.object({ questions: z.array(question).min(1).max(300) }));
  const topicIds = [...new Set(i.questions.map((q) => q.topicId).filter((t): t is string => !!t))];
  if (topicIds.length) {
    const ok = await prisma.topic.count({ where: { id: { in: topicIds }, subject: { examId: mock.examId } } });
    if (ok !== topicIds.length) throw new HttpError(400, "Every topic must belong to this mock's exam");
  }
  await prisma.$transaction(i.questions.map((q) => {
    const data = { ...q, correct: q.attempted ? q.correct ?? null : null };
    return prisma.mockQuestion.upsert({
      where: { mockId_section_number: { mockId: mock.id, section: q.section, number: q.number } },
      create: { ...data, mockId: mock.id }, update: data,
    });
  }));
  res.status(201).json({ saved: i.questions.length });
}));

mocksRouter.post("/mocks/:id/analysed", ah(async (req, res) => {
  await ownMock(uid(req), req.params.id!);
  res.json(await prisma.mock.update({ where: { id: req.params.id }, data: { analysedAt: new Date() } }));
}));
