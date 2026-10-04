/** Exam -> Subject -> Topic -> Subtopic. Generic: nothing here knows about CAT or CDS. */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ah, notFound } from "../lib/http.js";
import { body } from "../middleware/validate.js";
import { uid } from "../middleware/auth.js";
import { isoDate, toDateOnly } from "../lib/dates.js";

export const syllabusRouter = Router();

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const priority = z.number().min(0.1).max(3);
const examInput = z.object({ name: z.string().trim().min(1).max(80), examDate: isoDay, userPriority: priority.default(1), active: z.boolean().default(true) });
const subjectInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(["quantitative", "verbal", "reasoning", "knowledge"]).default("quantitative"),
  importance: z.number().min(0).max(1).default(1), userPriority: priority.default(1),
  cadenceDays: z.number().int().min(1).max(30).default(3),
});
const topicInput = z.object({
  name: z.string().trim().min(1).max(120), importance: z.number().int().min(1).max(5).default(3),
  coverage: z.number().min(0).max(1).default(0),
  status: z.enum(["not_started", "learning", "familiar", "strong"]).default("not_started"),
  userPriority: priority.default(1), active: z.boolean().default(true),
});

const ownExam = async (userId: string, id: string) => {
  const e = await prisma.exam.findFirst({ where: { id, userId } });
  if (!e) throw notFound("Exam");
  return e;
};
const ownSubject = async (userId: string, id: string) => {
  const s = await prisma.subject.findFirst({ where: { id, exam: { userId } } });
  if (!s) throw notFound("Subject");
  return s;
};
const ownTopic = async (userId: string, id: string) => {
  const t = await prisma.topic.findFirst({ where: { id, subject: { exam: { userId } } } });
  if (!t) throw notFound("Topic");
  return t;
};

syllabusRouter.get("/exams", ah(async (req, res) => {
  const exams = await prisma.exam.findMany({
    where: { userId: uid(req) }, orderBy: { examDate: "asc" },
    include: { subjects: { orderBy: { order: "asc" }, include: { topics: { orderBy: { order: "asc" }, include: { subtopics: true } } } } },
  });
  res.json(exams.map((e) => ({ ...e, examDate: isoDate(e.examDate) })));
}));

syllabusRouter.post("/exams", ah(async (req, res) => {
  const i = body(req, examInput);
  const e = await prisma.exam.create({ data: { ...i, examDate: toDateOnly(i.examDate), userId: uid(req) } });
  res.status(201).json({ ...e, examDate: isoDate(e.examDate) });
}));

syllabusRouter.patch("/exams/:id", ah(async (req, res) => {
  await ownExam(uid(req), req.params.id!);
  const i = body(req, examInput.partial());
  const e = await prisma.exam.update({
    where: { id: req.params.id },
    data: { ...i, examDate: i.examDate ? toDateOnly(i.examDate) : undefined,
      archivedAt: i.active === false ? new Date() : i.active === true ? null : undefined },
  });
  res.json({ ...e, examDate: isoDate(e.examDate) });
}));

syllabusRouter.delete("/exams/:id", ah(async (req, res) => {
  await ownExam(uid(req), req.params.id!);
  await prisma.exam.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

syllabusRouter.get("/subjects", ah(async (req, res) => {
  res.json(await prisma.subject.findMany({ where: { exam: { userId: uid(req) } }, orderBy: [{ examId: "asc" }, { order: "asc" }] }));
}));

syllabusRouter.post("/exams/:id/subjects", ah(async (req, res) => {
  await ownExam(uid(req), req.params.id!);
  const i = body(req, subjectInput);
  const order = await prisma.subject.count({ where: { examId: req.params.id } });
  res.status(201).json(await prisma.subject.create({ data: { ...i, examId: req.params.id!, order } }));
}));

syllabusRouter.patch("/subjects/:id", ah(async (req, res) => {
  await ownSubject(uid(req), req.params.id!);
  res.json(await prisma.subject.update({ where: { id: req.params.id }, data: body(req, subjectInput.partial()) }));
}));

syllabusRouter.delete("/subjects/:id", ah(async (req, res) => {
  await ownSubject(uid(req), req.params.id!);
  await prisma.subject.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

syllabusRouter.get("/topics", ah(async (req, res) => {
  res.json(await prisma.topic.findMany({
    where: { subject: { exam: { userId: uid(req) } } },
    include: { subject: { select: { name: true, exam: { select: { id: true, name: true } } } } },
    orderBy: [{ subjectId: "asc" }, { order: "asc" }],
  }));
}));

syllabusRouter.post("/subjects/:id/topics", ah(async (req, res) => {
  await ownSubject(uid(req), req.params.id!);
  const i = body(req, topicInput);
  const order = await prisma.topic.count({ where: { subjectId: req.params.id } });
  res.status(201).json(await prisma.topic.create({ data: { ...i, subjectId: req.params.id!, order } }));
}));

syllabusRouter.patch("/topics/:id", ah(async (req, res) => {
  await ownTopic(uid(req), req.params.id!);
  res.json(await prisma.topic.update({ where: { id: req.params.id }, data: body(req, topicInput.partial()) }));
}));

syllabusRouter.delete("/topics/:id", ah(async (req, res) => {
  await ownTopic(uid(req), req.params.id!);
  await prisma.topic.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

syllabusRouter.post("/topics/:id/subtopics", ah(async (req, res) => {
  await ownTopic(uid(req), req.params.id!);
  const i = body(req, z.object({ name: z.string().trim().min(1).max(120) }));
  res.status(201).json(await prisma.subtopic.create({ data: { name: i.name, topicId: req.params.id! } }));
}));
