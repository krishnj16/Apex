import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ah, HttpError, notFound } from "../lib/http.js";
import { body } from "../middleware/validate.js";
import { uid } from "../middleware/auth.js";

const r = Router();
const minute = z.number().int().min(0).max(1440);

const PrefIn = z.object({ dayStartMin: minute, dayEndMin: minute, studyMinMin: z.number().int().min(0).max(960),
  studyMaxMin: z.number().int().min(30).max(960), rejuvenationMinMin: z.number().int().min(0).max(600),
  rejuvenationMaxMin: z.number().int().min(0).max(720), preferredBlockMin: z.number().int().min(20).max(180),
  maxBlockMin: z.number().int().min(20).max(240), breakMin: z.number().int().min(0).max(60),
  notifyRehab: z.boolean(), notifyWeeklyReview: z.boolean(), notifyMocks: z.boolean() }).partial();

r.get("/settings", ah(async (req, res) => {
  const userId = uid(req);
  const [preference, classes, commitments] = await Promise.all([
    prisma.userPreference.upsert({ where: { userId }, create: { userId }, update: {} }),
    prisma.classSession.findMany({ where: { userId }, orderBy: { startMin: "asc" } }),
    prisma.commitment.findMany({ where: { userId }, orderBy: { startMin: "asc" } }),
  ]);
  res.json({ preference, classes, commitments });
}));

r.patch("/settings", ah(async (req, res) => {
  const userId = uid(req);
  const b = body(req, PrefIn);
  const cur = await prisma.userPreference.upsert({ where: { userId }, create: { userId }, update: {} });
  const next = { ...cur, ...b };
  if (next.studyMinMin > next.studyMaxMin) throw new HttpError(400, "Minimum study time cannot exceed the maximum");
  if (next.dayStartMin >= next.dayEndMin) throw new HttpError(400, "The day must start before it ends");
  if (next.rejuvenationMinMin > next.rejuvenationMaxMin) throw new HttpError(400, "Rejuvenation minimum exceeds maximum");
  res.json(await prisma.userPreference.update({ where: { userId }, data: b }));
}));

const SlotIn = z.object({ title: z.string().min(1).max(80), startMin: minute, endMin: minute,
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  subject: z.string().max(80).nullable().optional(), location: z.string().max(120).nullable().optional() })
  .refine((x) => x.startMin < x.endMin, "Start must be before end")
  .refine((x) => x.weekdays.length > 0 || !!x.date, "Choose weekdays or a date");

const toDate = (d?: string | null) => (d ? new Date(`${d}T00:00:00.000Z`) : null);

r.post("/classes", ah(async (req, res) => {
  const b = body(req, SlotIn);
  res.status(201).json(await prisma.classSession.create({ data: { ...b, date: toDate(b.date), userId: uid(req) } }));
}));
r.delete("/classes/:id", ah(async (req, res) => {
  const c = await prisma.classSession.findFirst({ where: { id: req.params.id, userId: uid(req) } });
  if (!c) throw notFound("Class");
  await prisma.classSession.delete({ where: { id: c.id } });
  res.status(204).end();
}));
r.post("/commitments", ah(async (req, res) => {
  const { subject: _s, location: _l, ...b } = body(req, SlotIn);
  res.status(201).json(await prisma.commitment.create({ data: { ...b, date: toDate(b.date), userId: uid(req) } }));
}));
r.delete("/commitments/:id", ah(async (req, res) => {
  const c = await prisma.commitment.findFirst({ where: { id: req.params.id, userId: uid(req) } });
  if (!c) throw notFound("Commitment");
  await prisma.commitment.delete({ where: { id: c.id } });
  res.status(204).end();
}));

r.post("/onboarding/complete", ah(async (req, res) => {
  res.json(await prisma.user.update({ where: { id: uid(req) }, data: { onboardedAt: new Date() },
    select: { id: true, onboardedAt: true } }));
}));

export default r;
