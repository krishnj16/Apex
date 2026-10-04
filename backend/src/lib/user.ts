import { prisma } from "./prisma.js";
import { notFound } from "./http.js";
import { todayIn } from "./dates.js";

export async function userToday(userId: string): Promise<{ today: string; timezone: string; isDemo: boolean; name: string }> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, isDemo: true, name: true } });
  if (!u) throw notFound("User");
  return { today: todayIn(u.timezone), timezone: u.timezone, isDemo: u.isDemo, name: u.name };
}

export const isoDateParam = /^\d{4}-\d{2}-\d{2}$/;
