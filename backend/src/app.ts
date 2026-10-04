import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler } from "./middleware/error.js";
import { requireApexHeader, requireAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { syllabusRouter } from "./routes/syllabus.js";
import { dayRouter } from "./routes/day.js";
import { tasksRouter } from "./routes/tasks.js";
import { mocksRouter } from "./routes/mocks.js";
import { performanceRouter } from "./routes/performance.js";
import { rehabRouter } from "./routes/rehab.js";
import { scheduleRouter } from "./routes/schedule.js";
import { calendarRouter } from "./routes/calendar.js";
import { reviewRouter } from "./routes/review.js";
import { exportRouter } from "./routes/export.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN.split(","), credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
  app.use("/api", requireApexHeader);

  app.get("/api/health", (_req, res) => { res.json({ ok: true }); });
  app.use("/api/auth", rateLimit({ windowMs: 15 * 60_000, limit: 60 }), authRouter);
  app.use("/api", requireAuth, onboardingRouter, syllabusRouter, dayRouter, tasksRouter, mocksRouter,
    performanceRouter, rehabRouter, scheduleRouter, calendarRouter, reviewRouter, exportRouter);
  app.use("/api", (_req, res) => { res.status(404).json({ error: "Unknown endpoint" }); });
  app.use(errorHandler);
  return app;
}
