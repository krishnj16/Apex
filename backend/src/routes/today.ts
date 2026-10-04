import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ah, HttpError } from "../lib/http.js";
import { addDays, isoDate, todayIn, toDateOnly, weekStart } from "../lib/dates.js";
import { body, query } from "../middleware/validate.js";
import { uid } from "../middleware/auth.js";
import { generatePlan, latestPlan } from "../services/planService.js";
import { fixedBlocksFor } from "../services/planInput.js";
import { examProgress, topicReports } from "../services/progressService.js";
import { analytics } from "../services/analyticsClient.js";

const r = Router();
const DateQ = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

async function userDate(userId: string, date?: string) {
  if (date) return date;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return todayIn(u?.timezone ?? "Asia/Kolkata");
}

r.get("/today", ah(async (req, res) => {
  const userId = uid(req);
  const date = await userDate(userId, query(req, DateQ).date);
  const [plan, checkin, blocks, prefs] = await Promise.all([
    latestPlan(userId, date),
    prisma.dailyCheckIn.findUnique({ where: { userId_date: { userId, date: toDateOnly(date) } } }),
    fixedBlocksFor(userId, date),
    prisma.userPreference.findUnique({ where: { userId } }),
  ]);
  res.json({ date, plan, checkin, fixedBlocks: blocks, preferences: prefs });
}));

r.post("/generate-plan", ah(async (req, res) => {
  const userId = uid(req);
  const date = await userDate(userId, body(req, DateQ).date);
  res.status(201).json(await generatePlan(userId, date));
}));

const CheckInIn = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sleepHours: z.number().min(0).max(24).nullish(),
  sleepQuality: z.number().int().min(1).max(5).nullish(),
  energy: z.number().int().min(1).max(10).nullish(),
  stress: z.number().int().min(1).max(10).nullish(),
  mentalFatigue: z.number().int().min(1).max(10).nullish(),
  physicalDiscomfort: z.number().int().min(0).max(10).nullish(),
  legDiscomfort: z.number().int().min(0).max(10).nullish(),
  wristDiscomfort: z.number().int().min(0).max(10).nullish(),
  availableStudyMin: z.number().int().min(0).max(1200).nullish(),
});

r.post("/checkins", ah(async (req, res) => {
  const userId = uid(req);
  const { date: d, ...b } = body(req, CheckInIn);
  const date = await userDate(userId, d);
  const rd = await analytics.readiness({ sleep_hours: b.sleepHours, sleep_quality: b.sleepQuality, energy: b.energy,
    stress: b.stress, mental_fatigue: b.mentalFatigue });
  const data = { ...b, readiness: rd.score, readinessDetail: rd };
  const saved = await prisma.dailyCheckIn.upsert({
    where: { userId_date: { userId, date: toDateOnly(date) } },
    create: { ...data, userId, date: toDateOnly(date) }, update: data,
  });
  res.status(201).json(saved);
}));

r.get("/dashboard", ah(async (req, res) => {
  const userId = uid(req);
  const date = await userDate(userId, query(req, DateQ).date);
  const ws = weekStart(date);
  const [plan, checkin, blocks, progress, topics, weekItems, rehab, programs] = await Promise.all([
    latestPlan(userId, date),
    prisma.dailyCheckIn.findUnique({ where: { userId_date: { userId, date: toDateOnly(date) } } }),
    fixedBlocksFor(userId, date),
    examProgress(userId, date),
    topicReports(userId, date),
    prisma.dailyPlanItem.findMany({
      where: { plan: { userId, date: { gte: toDateOnly(ws), lt: toDateOnly(addDays(ws, 7)) } } },
      include: { plan: { select: { date: true, version: true } } },
    }),
    prisma.rehabSession.findMany({ where: { userId, date: { gte: toDateOnly(ws), lte: toDateOnly(date) } } }),
    prisma.rehabProgram.findMany({ where: { userId, active: true } }),
  ]);
  if (!progress.length) throw new HttpError(409, "Finish onboarding to see your dashboard.");

  // Only the latest plan version of each day counts toward the week.
  const latestVersion = new Map<string, number>();
  for (const i of weekItems) {
    const k = isoDate(i.plan.date);
    latestVersion.set(k, Math.max(latestVersion.get(k) ?? 0, i.plan.version));
  }
  const week = weekItems.filter((i) => latestVersion.get(isoDate(i.plan.date)) === i.plan.version);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const minutesOf = (kind: string) => sum(blocks.filter((b) => b.kind === kind).map((b) => b.end - b.start));
  const daysSoFar = Math.min(7, Math.round((toDateOnly(date).getTime() - toDateOnly(ws).getTime()) / 86_400_000) + 1);

  res.json({
    date, checkin, plan,
    day: {
      classMin: minutesOf("class"), rehabMin: minutesOf("rehab"), commitmentMin: minutesOf("commitment"),
      plannedStudyMin: sum(plan?.items.map((i) => i.plannedMin) ?? []),
      completedStudyMin: sum(plan?.items.filter((i) => ["completed", "partial"].includes(i.status))
        .map((i) => i.actualMin ?? 0) ?? []),
      budget: plan?.budget ?? null,
    },
    exams: progress,
    topicHealth: topics.filter((t) => t.sufficient)
      .sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1)).slice(0, 6),
    rehab: programs.map((p) => ({
      program: p.name, completed: rehab.filter((s) => s.programId === p.id && s.status === "completed").length,
      days: daysSoFar,
    })),
    week: {
      plannedMin: sum(week.map((i) => i.plannedMin)),
      completedMin: sum(week.filter((i) => ["completed", "partial"].includes(i.status)).map((i) => i.actualMin ?? 0)),
    },
  });
}));

export default r;
