import { prisma } from "../lib/prisma.js";
import { addDays, isoDate, toDateOnly } from "../lib/dates.js";

/** Latest plan version per day in [from, to]; earlier versions are superseded drafts. */
export async function latestPlansBetween(userId: string, from: string, to: string) {
  const plans = await prisma.dailyPlan.findMany({
    where: { userId, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
    include: { items: { where: { status: { not: "removed" } } } },
    orderBy: [{ date: "asc" }, { version: "desc" }],
  });
  const seen = new Set<string>();
  return plans.filter((p) => {
    const k = isoDate(p.date);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function plannedVsDone(userId: string, from: string, days: number) {
  const plans = await latestPlansBetween(userId, from, addDays(from, days - 1));
  let planned = 0, done = 0;
  for (const p of plans) for (const i of p.items) {
    planned += i.plannedMin;
    if (i.status === "completed" || i.status === "partial") done += i.actualMin ?? 0;
  }
  return { plannedMin: planned, completedMin: done, daysWithPlan: plans.length };
}
