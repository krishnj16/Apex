/** Tracking and scheduling for an existing rehab routine. APEX does not prescribe or diagnose. */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ah, notFound } from "../lib/http.js";
import { body } from "../middleware/validate.js";
import { uid } from "../middleware/auth.js";
import { addDays, isoDate, toDateOnly, weekday } from "../lib/dates.js";
import { userToday } from "../lib/user.js";

export const rehabRouter = Router();

const minuteOfDay = z.number().int().min(0).max(1439);
const exerciseInput = z.object({
  name: z.string().trim().min(1).max(120), bodyArea: z.string().trim().min(1).max(60),
  sets: z.number().int().min(1).max(20),
  repsMin: z.number().int().min(1).max(200).nullable().optional(), repsMax: z.number().int().min(1).max(200).nullable().optional(),
  secMin: z.number().int().min(1).max(600).nullable().optional(), secMax: z.number().int().min(1).max(600).nullable().optional(),
  notes: z.string().max(500).nullable().optional(), active: z.boolean().optional(), order: z.number().int().min(0).optional(),
});

const ownProgram = async (userId: string, id: string) => {
  const p = await prisma.rehabProgram.findFirst({ where: { id, userId } });
  if (!p) throw notFound("Rehab program");
  return p;
};

rehabRouter.get("/rehab", ah(async (req, res) => {
  const userId = uid(req);
  const { today } = await userToday(userId);
  const since30 = addDays(today, -29);
  const programs = await prisma.rehabProgram.findMany({
    where: { userId }, orderBy: { name: "asc" },
    include: {
      exercises: { orderBy: { order: "asc" } },
      sessions: { where: { date: { gte: toDateOnly(since30) } }, orderBy: { date: "desc" } },
    },
  });
  res.json(programs.map((p) => {
    const inWindow = (days: number) => p.sessions.filter((s) => isoDate(s.date) >= addDays(today, -(days - 1)));
    const adherence = (days: number) => {
      const s = inWindow(days);
      return { completed: s.filter((x) => x.status === "completed").length,
        partial: s.filter((x) => x.status === "partial").length,
        skipped: s.filter((x) => x.status === "skipped").length,
        // Only days the programme is scheduled count as possible; unlogged scheduled days are "missed".
        scheduled: Array.from({ length: days }, (_, k) => weekday(addDays(today, -k))).filter((d) => p.weekdays.includes(d)).length,
        missed: Math.max(0, Array.from({ length: days }, (_, k) => weekday(addDays(today, -k))).filter((d) => p.weekdays.includes(d)).length - s.length),
        days };
    };
    return {
      ...p, sessions: p.sessions.map((s) => ({ ...s, date: isoDate(s.date) })),
      today: p.sessions.find((s) => isoDate(s.date) === today) ?? null,
      week: adherence(7), month: adherence(30),
    };
  }));
}));

rehabRouter.post("/rehab/session", ah(async (req, res) => {
  const userId = uid(req);
  const { today } = await userToday(userId);
  const scale = z.number().int().min(0).max(10).nullable().optional();
  const i = body(req, z.object({
    programId: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(["completed", "partial", "skipped"]),
    painBefore: scale, painAfter: scale, difficulty: z.number().int().min(1).max(10).nullable().optional(),
    notes: z.string().max(1000).optional(),
  }));
  await ownProgram(userId, i.programId);
  const date = toDateOnly(i.date ?? today);
  const { programId, date: _d, ...data } = i;
  const s = await prisma.rehabSession.upsert({
    where: { programId_date: { programId, date } },
    create: { ...data, programId, userId, date }, update: data,
  });
  res.status(201).json({ ...s, date: isoDate(s.date) });
}));

rehabRouter.post("/rehab/programs", ah(async (req, res) => {
  const i = body(req, z.object({ name: z.string().trim().min(1).max(60), dailyMin: z.number().int().min(5).max(240),
    preferredStartMin: minuteOfDay.nullable().optional() }));
  res.status(201).json(await prisma.rehabProgram.create({ data: { ...i, userId: uid(req) } }));
}));

rehabRouter.patch("/rehab/programs/:id", ah(async (req, res) => {
  await ownProgram(uid(req), req.params.id!);
  const i = body(req, z.object({ name: z.string().trim().min(1).max(60).optional(),
    dailyMin: z.number().int().min(5).max(240).optional(), preferredStartMin: minuteOfDay.nullable().optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(), active: z.boolean().optional() }));
  res.json(await prisma.rehabProgram.update({ where: { id: req.params.id }, data: i }));
}));

rehabRouter.post("/rehab/programs/:id/exercises", ah(async (req, res) => {
  await ownProgram(uid(req), req.params.id!);
  const i = body(req, exerciseInput);
  const order = i.order ?? (await prisma.rehabExercise.count({ where: { programId: req.params.id } }));
  res.status(201).json(await prisma.rehabExercise.create({ data: { ...i, order, programId: req.params.id! } }));
}));

rehabRouter.patch("/rehab/exercises/:id", ah(async (req, res) => {
  const ex = await prisma.rehabExercise.findFirst({ where: { id: req.params.id, program: { userId: uid(req) } } });
  if (!ex) throw notFound("Exercise");
  res.json(await prisma.rehabExercise.update({ where: { id: ex.id }, data: body(req, exerciseInput.partial()) }));
}));

rehabRouter.delete("/rehab/exercises/:id", ah(async (req, res) => {
  const ex = await prisma.rehabExercise.findFirst({ where: { id: req.params.id, program: { userId: uid(req) } } });
  if (!ex) throw notFound("Exercise");
  await prisma.rehabExercise.delete({ where: { id: ex.id } });
  res.status(204).end();
}));

/** Change one day only: another start time, a shorter or longer session, or skip it that day. */
rehabRouter.put("/rehab/overrides", ah(async (req, res) => {
  const userId = uid(req);
  const i = body(req, z.object({
    programId: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startMin: minuteOfDay.nullable().optional(), durationMin: z.number().int().min(5).max(240).nullable().optional(),
    skip: z.boolean().default(false),
  }));
  await ownProgram(userId, i.programId);
  const { programId, date, ...data } = i;
  const o = await prisma.rehabDayOverride.upsert({
    where: { programId_date: { programId, date: toDateOnly(date) } },
    create: { ...data, programId, date: toDateOnly(date) }, update: data,
  });
  res.json({ ...o, date: isoDate(o.date) });
}));

/** Back to the programme's normal schedule for that day. */
rehabRouter.delete("/rehab/overrides/:programId/:date", ah(async (req, res) => {
  await ownProgram(uid(req), req.params.programId!);
  await prisma.rehabDayOverride.deleteMany({ where: { programId: req.params.programId, date: toDateOnly(req.params.date!) } });
  res.status(204).end();
}));
