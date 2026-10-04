import { Router } from "express";
import { z } from "zod";
import { ah, HttpError } from "../lib/http.js";
import { query } from "../middleware/validate.js";
import { uid } from "../middleware/auth.js";
import { addDays, daysBetween, isoDate } from "../lib/dates.js";
import { prisma } from "../lib/prisma.js";
import { fixedBlocksDetailed } from "../services/planInput.js";
import { latestPlansBetween } from "../services/weekService.js";

export const calendarRouter = Router();

/** Events for a date range: fixed blocks are expanded per day; study blocks come from the latest plan. */
calendarRouter.get("/calendar", ah(async (req, res) => {
  const userId = uid(req);
  const q = query(req, z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }));
  const span = daysBetween(q.from, q.to);
  if (span < 0 || span > 42) throw new HttpError(400, "Range must be 0 to 42 days");
  const [plans, mocks] = await Promise.all([
    latestPlansBetween(userId, q.from, q.to),
    prisma.mock.findMany({ where: { userId, takenOn: { gte: new Date(`${q.from}T00:00:00Z`), lte: new Date(`${q.to}T00:00:00Z`) } },
      select: { id: true, name: true, takenOn: true } }),
  ]);
  const byDate = new Map(plans.map((p) => [isoDate(p.date), p]));
  const days = [];
  for (let i = 0; i <= span; i++) {
    const date = addDays(q.from, i);
    const fixed = await fixedBlocksDetailed(userId, date, true);
    const plan = byDate.get(date);
    days.push({
      date,
      events: [
        ...fixed.map((b) => ({ kind: b.kind, title: b.label ?? b.kind, start: b.start, end: b.end,
          source: b.source, refId: b.refId, programId: b.programId, overridden: b.overridden, cancelled: b.cancelled })),
        ...(plan?.items ?? []).map((it) => ({
          kind: "study", id: it.id, title: it.title, start: it.startMin, end: it.endMin, status: it.status, priority: it.priority,
        })),
      ].sort((a, b) => a.start - b.start),
      mocks: mocks.filter((m) => isoDate(m.takenOn) === date).map((m) => ({ id: m.id, name: m.name })),
    });
  }
  res.json(days);
}));
