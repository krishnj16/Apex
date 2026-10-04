import { Router } from "express";
import { ah } from "../lib/http.js";
import { uid } from "../middleware/auth.js";
import { userToday } from "../lib/user.js";
import { examProgress, topicReports } from "../services/progressService.js";
import { analytics } from "../services/analyticsClient.js";
import { buildPlanRequest } from "../services/planInput.js";

export const performanceRouter = Router();

performanceRouter.get("/performance", ah(async (req, res) => {
  const userId = uid(req);
  const { today } = await userToday(userId);
  res.json({ date: today, exams: await examProgress(userId, today) });
}));

performanceRouter.get("/performance/topics", ah(async (req, res) => {
  const userId = uid(req);
  const { today } = await userToday(userId);
  res.json(await topicReports(userId, today));
}));

/** Full ranking without today's time limits: "what matters most right now". */
performanceRouter.get("/performance/priorities", ah(async (req, res) => {
  const userId = uid(req);
  const { today } = await userToday(userId);
  const r = await buildPlanRequest(userId, today);
  res.json(r.topics.length ? (await analytics.rank(r)).slice(0, 20) : []);
}));
