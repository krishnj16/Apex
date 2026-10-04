import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ah, HttpError } from "../lib/http.js";
import { body } from "../middleware/validate.js";
import { uid } from "../middleware/auth.js";
import { applyStarterProfile, STARTER_EXAMS } from "../services/starterProfile.js";

export const onboardingRouter = Router();

/** The starter profile is shown to the user for review before anything is written. */
onboardingRouter.get("/onboarding/starter", (_req, res) => {
  res.json({ exams: STARTER_EXAMS.map((e) => ({ name: e.name, examDate: e.examDate, subjects: e.subjects })) });
});

onboardingRouter.post("/onboarding/starter", ah(async (req, res) => {
  const userId = uid(req);
  const input = body(req, z.object({ examDates: z.record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default({}) }));
  if (await prisma.exam.count({ where: { userId } })) throw new HttpError(409, "You already have exams set up");
  await applyStarterProfile(userId, input.examDates);
  res.status(201).json({ ok: true });
}));

onboardingRouter.post("/onboarding/complete", ah(async (req, res) => {
  await prisma.user.update({ where: { id: uid(req) }, data: { onboardedAt: new Date() } });
  res.json({ ok: true });
}));
