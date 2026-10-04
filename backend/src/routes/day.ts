import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ah } from "../lib/http.js";
import { body } from "../middleware/validate.js";
import { uid } from "../middleware/auth.js";
import { isoDate, toDateOnly, weekStart } from "../lib/dates.js";
import { userToday } from "../lib/user.js";
import { analytics } from "../services/analyticsClient.js";
import { fixedBlocksFor } from "../services/planInput.js";
import { generatePlan, latestPlan } from "../services/planService.js";
import { examProgress, topicReports } from "../services/progressService.js";
import { plannedVsDone } from "../services/weekService.js";

export const dayRouter = Router();

const scale = (lo: number, hi: number) => z.number().int().min(lo).max(hi).nullable().optional();
const checkinInput = z.object({
  sleepHours: z.number().min(0).max(24).nullable().optional(),
  sleepQuality: scale(1, 5), energy: scale(1, 10), stress: scale(1, 10), mentalFatigue: scale(1, 10),
  physicalDiscomfort: scale(0, 10), legDiscomfort: scale(0, 10), wristDiscomfort: scale(0, 10),
  availableStudyMin: z.number().int().min(0).max(960).nullable().optional(),
});

dayRouter.get("/checkins/today", ah(async (req, res) => {
  const userId = uid(req);
  const { today } = await userToday(userId);
  res.json(await prisma.dailyCheckIn.findUnique({ where: { userId_date: { userId, date: toDateOnly(today) } } }));
}));

/** Saves today's check-in, then re-plans the day around it (finished work is kept). */
dayRouter.post("/checkins", ah(async (req, res) => {
  const userId = uid(req);
  const { today } = await userToday(userId);
  const i = body(req, checkinInput);
  const r = await analytics.readiness({
    sleep_hours: i.sleepHours, sleep_quality: i.sleepQuality, energy: i.energy, stress: i.stress, mental_fatigue: i.mentalFatigue,
  });
  const data = { ...i, readiness: r.score, readinessDetail: { components: r.components, notes: r.notes } };
  const checkin = await prisma.dailyCheckIn.upsert({
    where: { userId_date: { userId, date: toDateOnly(today) } },
    create: { ...data, userId, date: toDateOnly(today) }, update: data,
  });
  const hasExams = (await prisma.exam.count({ where: { userId, active: true } })) > 0;
  const plan = hasExams ? await generatePlan(userId, today) : null;
  res.status(201).json({ checkin, plan });
}));

dayRouter.get("/today", ah(async (req, res) => {
  const userId = uid(req);
  const { today } = await userToday(userId);
  const [plan, blocks, checkin] = await Promise.all([
    latestPlan(userId, today), fixedBlocksFor(userId, today),
    prisma.dailyCheckIn.findUnique({ where: { userId_date: { userId, date: toDateOnly(today) } } }),
  ]);
  res.json({ date: today, plan, fixedBlocks: blocks, checkin });
}));

dayRouter.post("/generate-plan", ah(async (req, res) => {
  const userId = uid(req);
  const { today } = await userToday(userId);
  res.status(201).json(await generatePlan(userId, today));
}));

dayRouter.get("/dashboard", ah(async (req, res) => {
  const userId = uid(req);
  const { today, name, isDemo } = await userToday(userId);
  const [plan, blocks, checkin, prefs, exams, reports, rehabPrograms, week] = await Promise.all([
    latestPlan(userId, today),
    fixedBlocksFor(userId, today),
    prisma.dailyCheckIn.findUnique({ where: { userId_date: { userId, date: toDateOnly(today) } } }),
    prisma.userPreference.findUnique({ where: { userId } }),
    examProgress(userId, today),
    topicReports(userId, today).catch(() => null), // dashboard still renders if analytics is down
    prisma.rehabProgram.findMany({
      where: { userId, active: true },
      include: { sessions: { where: { date: toDateOnly(today) } } },
    }),
    plannedVsDone(userId, weekStart(today), 7),
  ]);

  const minutes = (kind: string) => blocks.filter((b) => b.kind === kind).reduce((a, b) => a + (b.end - b.start), 0);
  const items = plan?.items ?? [];
  const completedMin = items
    .filter((i) => i.status === "completed" || i.status === "partial")
    .reduce((a, i) => a + (i.actualMin ?? 0), 0);
  const budget = (plan?.budget ?? null) as { study_budget?: number; free_minutes?: number } | null;

  const health = (reports ?? [])
    .filter((r) => r.sufficient && r.accuracy !== null)
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0))
    .slice(0, 6);

  res.json({
    date: today, name, isDemo,
    time: {
      classesMin: minutes("class"), rehabMin: minutes("rehab"), commitmentsMin: minutes("commitment"),
      rejuvenationTargetMin: prefs?.rejuvenationMinMin ?? 180,
      freeMin: budget?.free_minutes ?? null,
      studyTargetMin: budget?.study_budget ?? null,
      completedStudyMin: completedMin,
    },
    checkin: checkin && {
      sleepHours: checkin.sleepHours, energy: checkin.energy, stress: checkin.stress,
      readiness: checkin.readiness, detail: checkin.readinessDetail,
    },
    exams,
    plan,
    topicHealth: reports === null ? null : health,
    rehab: rehabPrograms.map((p) => ({ id: p.id, name: p.name, dailyMin: p.dailyMin, today: p.sessions[0]?.status ?? null })),
    week: { start: weekStart(today), ...week },
  });
}));
