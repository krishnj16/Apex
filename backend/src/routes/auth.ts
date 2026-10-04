import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ah, HttpError } from "../lib/http.js";
import { body } from "../middleware/validate.js";
import { clearSession, issueSession, requireAuth, uid } from "../middleware/auth.js";

export const authRouter = Router();

const credentials = z.object({
  email: z.string().email().max(200).transform((e) => e.toLowerCase().trim()),
  password: z.string().min(10, "Use at least 10 characters").max(200),
});

authRouter.post("/register", ah(async (req, res) => {
  const input = body(req, credentials.extend({
    name: z.string().trim().min(1).max(80),
    timezone: z.string().max(64).default("Asia/Kolkata"),
  }));
  try {
    Intl.DateTimeFormat(undefined, { timeZone: input.timezone });
  } catch {
    throw new HttpError(400, "Unknown timezone");
  }
  const user = await prisma.user.create({
    data: {
      email: input.email, name: input.name, timezone: input.timezone,
      passwordHash: await bcrypt.hash(input.password, 12),
      preference: { create: {} },
    },
  });
  issueSession(res, user.id);
  res.status(201).json({ id: user.id, name: user.name, email: user.email, onboarded: false, isDemo: false });
}));

authRouter.post("/login", ah(async (req, res) => {
  const input = body(req, credentials.extend({ password: z.string().min(1).max(200) }));
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  // Same error and similar timing for unknown email and wrong password.
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
  if (!user || !ok) throw new HttpError(401, "Email or password is incorrect");
  issueSession(res, user.id);
  res.json({ id: user.id, name: user.name, email: user.email, onboarded: !!user.onboardedAt, isDemo: user.isDemo });
}));

authRouter.post("/logout", (_req, res) => {
  clearSession(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, ah(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: uid(req) },
    select: { id: true, name: true, email: true, timezone: true, isDemo: true, onboardedAt: true },
  });
  if (!user) throw new HttpError(401, "Sign in to continue");
  res.json({ ...user, onboarded: !!user.onboardedAt });
}));
