/** Fixed constraints (classes, commitments) and planner preferences. */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ah, HttpError, notFound } from "../lib/http.js";
import { body } from "../middleware/validate.js";
import { uid } from "../middleware/auth.js";
import { toDateOnly } from "../lib/dates.js";

export const scheduleRouter = Router();

const minute = z.number().int().min(0).max(1440);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timed = <T extends z.ZodRawShape>(shape: T) => z.object({
  ...shape, startMin: minute, endMin: minute,
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]), date: day.nullable().optional(),
}).refine((x) => x.startMin < x.endMin, "Start must be before end")
  .refine((x) => x.weekdays.length > 0 || !!x.date, "Choose weekdays for a recurring entry or a date for a one-off");

const classInput = timed({
  title: z.string().trim().min(1).max(120), subject: z.string().max(80).nullable().optional(),
  location: z.string().max(120).nullable().optional(), validFrom: day.nullable().optional(), validTo: day.nullable().optional(),
});
const commitmentInput = timed({ title: z.string().trim().min(1).max(120) });
const d = (v?: string | null) => (v ? toDateOnly(v) : v === null ? null : undefined);

scheduleRouter.get("/classes", ah(async (req, res) => {
  res.json(await prisma.classSession.findMany({ where: { userId: uid(req) }, orderBy: { startMin: "asc" } }));
}));

scheduleRouter.post("/classes", ah(async (req, res) => {
  const i = body(req, classInput);
  res.status(201).json(await prisma.classSession.create({
    data: { ...i, userId: uid(req), date: d(i.date), validFrom: d(i.validFrom), validTo: d(i.validTo) },
  }));
}));

scheduleRouter.put("/classes/:id", ah(async (req, res) => {
  const userId = uid(req);
  if (!(await prisma.classSession.findFirst({ where: { id: req.params.id, userId } }))) throw notFound("Class");
  const i = body(req, classInput);
  res.json(await prisma.classSession.update({
    where: { id: req.params.id }, data: { ...i, date: d(i.date), validFrom: d(i.validFrom), validTo: d(i.validTo) },
  }));
}));

scheduleRouter.delete("/classes/:id", ah(async (req, res) => {
  const r = await prisma.classSession.deleteMany({ where: { id: req.params.id, userId: uid(req) } });
  if (!r.count) throw notFound("Class");
  res.status(204).end();
}));

/** Cancel one class on one date. The class stays in your timetable for every other day. */
scheduleRouter.put("/classes/:id/cancel", ah(async (req, res) => {
  const userId = uid(req);
  const i = body(req, z.object({ date: day }));
  if (!(await prisma.classSession.findFirst({ where: { id: req.params.id, userId } }))) throw notFound("Class");
  const date = toDateOnly(i.date);
  await prisma.classCancellation.upsert({
    where: { classId_date: { classId: req.params.id!, date } }, create: { classId: req.params.id!, date }, update: {},
  });
  res.json({ classId: req.params.id, date: i.date, cancelled: true });
}));

/** Bring the class back for that date. */
scheduleRouter.delete("/classes/:id/cancel/:date", ah(async (req, res) => {
  const userId = uid(req);
  if (!(await prisma.classSession.findFirst({ where: { id: req.params.id, userId } }))) throw notFound("Class");
  await prisma.classCancellation.deleteMany({ where: { classId: req.params.id, date: toDateOnly(req.params.date!) } });
  res.status(204).end();
}));

scheduleRouter.get("/commitments", ah(async (req, res) => {
  res.json(await prisma.commitment.findMany({ where: { userId: uid(req) }, orderBy: { startMin: "asc" } }));
}));

scheduleRouter.post("/commitments", ah(async (req, res) => {
  const i = body(req, commitmentInput);
  res.status(201).json(await prisma.commitment.create({ data: { ...i, userId: uid(req), date: d(i.date) } }));
}));

scheduleRouter.delete("/commitments/:id", ah(async (req, res) => {
  const r = await prisma.commitment.deleteMany({ where: { id: req.params.id, userId: uid(req) } });
  if (!r.count) throw notFound("Commitment");
  res.status(204).end();
}));

const prefInput = z.object({
  dayStartMin: minute, dayEndMin: minute, studyMinMin: z.number().int().min(0).max(900),
  studyMaxMin: z.number().int().min(30).max(900), rejuvenationMinMin: z.number().int().min(0).max(600),
  rejuvenationMaxMin: z.number().int().min(0).max(720), preferredBlockMin: z.number().int().min(20).max(180),
  maxBlockMin: z.number().int().min(20).max(240), breakMin: z.number().int().min(0).max(60),
  notifyRehab: z.boolean(), notifyWeeklyReview: z.boolean(), notifyMocks: z.boolean(),
}).partial();

scheduleRouter.get("/preferences", ah(async (req, res) => {
  const userId = uid(req);
  res.json(await prisma.userPreference.upsert({ where: { userId }, create: { userId }, update: {} }));
}));

scheduleRouter.patch("/preferences", ah(async (req, res) => {
  const userId = uid(req);
  const i = body(req, prefInput);
  const cur = await prisma.userPreference.upsert({ where: { userId }, create: { userId }, update: {} });
  const next = { ...cur, ...i };
  if (next.dayStartMin >= next.dayEndMin) throw new HttpError(400, "Day start must be before day end");
  if (next.studyMinMin > next.studyMaxMin) throw new HttpError(400, "Minimum study cannot exceed maximum study");
  if (next.rejuvenationMinMin > next.rejuvenationMaxMin) throw new HttpError(400, "Minimum rejuvenation cannot exceed maximum");
  if (next.preferredBlockMin > next.maxBlockMin) throw new HttpError(400, "Preferred block cannot exceed the maximum block");
  res.json(await prisma.userPreference.update({ where: { userId }, data: i }));
}));
