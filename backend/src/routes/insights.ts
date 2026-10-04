/** Performance, calendar, weekly review, and exports. */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ah } from "../lib/http.js";
import { addDays, isoDate, todayIn, toDateOnly, weekStart } from "../lib/dates.js";
import { query } from "../middleware/validate.js";
import { uid } from "../middleware/auth.js";
import { examProgress, topicReports } from "../services/progressService.js";
import { analytics } from "../services/analyticsClient.js";
import { buildPlanRequest, fixedBlocksFor } from "../services/planInput.js";

const r = Router();
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function today(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return todayIn(u?.timezone ?? "Asia/Kolkata");
}

r.get("/performance", ah(async (req, res) => {
  const userId = uid(req);
  const date = await today(userId);
  const sessions = await prisma.studySession.findMany({ where: { userId, startedAt: { gte: toDateOnly(addDays(date, -55)) } },
    select: { startedAt: true, activeMin: true } });
  const byDay = new Map<string, number>();
  for (const s of sessions) byDay.set(isoDate(s.startedAt), (byDay.get(isoDate(s.startedAt)) ?? 0) + s.activeMin);
  res.json({ date, exams: await examProgress(userId, date),
    studyByDay: [...byDay.entries()].sort().map(([d, m]) => ({ date: d, minutes: m })) });
}));

r.get("/performance/topics", ah(async (req, res) => {
  const userId = uid(req);
  res.json(await topicReports(userId, await today(userId)));
}));

r.get("/calendar", ah(async (req, res) => {
  const userId = uid(req);
  const q = query(req, z.object({ from: iso, to: iso }));
  const plans = await prisma.dailyPlan.findMany({ where: { userId, date: { gte: toDateOnly(q.from), lte: toDateOnly(q.to) } },
    orderBy: [{ date: "asc" }, { version: "desc" }], include: { items: true } });
  const latest = new Map<string, (typeof plans)[number]>();
  for (const p of plans) if (!latest.has(isoDate(p.date))) latest.set(isoDate(p.date), p);
  const mocks = await prisma.mock.findMany({ where: { userId, takenOn: { gte: toDateOnly(q.from), lte: toDateOnly(q.to) } },
    select: { id: true, name: true, takenOn: true } });
  const days = [];
  for (let d = q.from; d <= q.to && days.length < 62; d = addDays(d, 1)) {
    days.push({ date: d, fixed: await fixedBlocksFor(userId, d), items: latest.get(d)?.items ?? [],
      mocks: mocks.filter((m) => isoDate(m.takenOn) === d) });
  }
  res.json(days);
}));

r.get("/weekly-review", ah(async (req, res) => {
  const userId = uid(req);
  const q = query(req, z.object({ weekStart: iso.optional() }));
  const ws = q.weekStart ?? weekStart(addDays(await today(userId), -7));
  const from = toDateOnly(addDays(ws, -7));
  const to = toDateOnly(addDays(ws, 7));
  const [items, attempts, mockQs, rehab, programs] = await Promise.all([
    prisma.dailyPlanItem.findMany({ where: { plan: { userId, date: { gte: toDateOnly(ws), lt: to } } },
      include: { plan: { select: { date: true, version: true } } } }),
    prisma.questionAttempt.findMany({ where: { userId, on: { gte: from, lt: to } }, include: { topic: { select: { name: true } } } }),
    prisma.mockQuestion.findMany({ where: { mock: { userId, takenOn: { gte: from, lt: to } }, attempted: true },
      include: { topic: { select: { name: true } }, mock: { select: { takenOn: true } } } }),
    prisma.rehabSession.findMany({ where: { userId, date: { gte: toDateOnly(ws), lt: to } }, include: { program: true } }),
    prisma.rehabProgram.findMany({ where: { userId, active: true } }),
  ]);
  const latest = new Map<string, number>();
  for (const i of items) latest.set(isoDate(i.plan.date), Math.max(latest.get(isoDate(i.plan.date)) ?? 0, i.plan.version));
  const exams = await prisma.exam.findMany({ where: { userId }, include: { subjects: true } });
  const subjectName = new Map(exams.flatMap((e) => e.subjects.map((s) => [s.id, [e.name, s.name] as const])));

  const data = await analytics.weekly({
    week_start: ws,
    tasks: items.filter((i) => latest.get(isoDate(i.plan.date)) === i.plan.version).map((i) => ({
      on: isoDate(i.plan.date), exam: subjectName.get(i.subjectId ?? "")?.[0] ?? "Mock analysis",
      subject: subjectName.get(i.subjectId ?? "")?.[1] ?? i.title, planned_min: i.plannedMin,
      actual_min: i.actualMin ?? 0, status: i.status })),
    attempts: [
      ...attempts.map((a) => ({ on: isoDate(a.on), topic: a.topic.name, correct: a.correct })),
      ...mockQs.filter((q) => q.topic).map((q) => ({ on: isoDate(q.mock.takenOn), topic: q.topic!.name, correct: q.correct })),
    ],
    rehab: rehab.map((s) => ({ on: isoDate(s.date), program: s.program.name, status: s.status })),
    rehab_programs: programs.map((p) => p.name),
    plan_request: await buildPlanRequest(userId, addDays(ws, 7)),
  });
  const saved = await prisma.weeklyReview.upsert({ where: { userId_weekStart: { userId, weekStart: toDateOnly(ws) } },
    create: { userId, weekStart: toDateOnly(ws), data: data as object }, update: { data: data as object } });
  res.json(saved);
}));

const csv = (rows: Array<Record<string, unknown>>) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]!);
  const esc = (v: unknown) => {
    const s = v == null ? "" : v instanceof Date ? isoDate(v) : String(v);
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s; // neutralise spreadsheet formulas
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
};

r.get("/export/:kind.csv", ah(async (req, res) => {
  const userId = uid(req);
  let rows: Array<Record<string, unknown>> = [];
  switch (req.params.kind) {
    case "mocks":
      rows = (await prisma.mock.findMany({ where: { userId }, include: { exam: true }, orderBy: { takenOn: "asc" } }))
        .map((m) => ({ exam: m.exam.name, name: m.name, date: m.takenOn, score: m.totalScore, max: m.maxScore }));
      break;
    case "study":
      rows = (await prisma.studySession.findMany({ where: { userId }, include: { topic: true }, orderBy: { startedAt: "asc" } }))
        .map((s) => ({ date: s.startedAt, topic: s.topic?.name, type: s.taskType, minutes: s.activeMin, planned: s.plannedMin }));
      break;
    case "rehab":
      rows = (await prisma.rehabSession.findMany({ where: { userId }, include: { program: true }, orderBy: { date: "asc" } }))
        .map((s) => ({ date: s.date, program: s.program.name, status: s.status, painBefore: s.painBefore,
          painAfter: s.painAfter, notes: s.notes }));
      break;
    default:
      res.status(404).json({ error: "Unknown export" });
      return;
  }
  res.type("text/csv").attachment(`apex-${req.params.kind}.csv`).send(csv(rows));
}));

export default r;
