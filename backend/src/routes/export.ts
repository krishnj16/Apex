/** CSV export of the user's own records. Values are escaped; formula-leading cells are neutralised. */
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ah } from "../lib/http.js";
import { uid } from "../middleware/auth.js";
import { isoDate } from "../lib/dates.js";
import { parse } from "../middleware/validate.js";

export const exportRouter = Router();

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (header: string[], rows: unknown[][]) => [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");

exportRouter.get("/export/:kind", ah(async (req, res) => {
  const userId = uid(req);
  const kind = parse(z.enum(["study-history", "mock-history", "mock-questions", "rehab-history", "syllabus"]), req.params.kind);
  let csv = "";
  if (kind === "study-history") {
    const rows = await prisma.studySession.findMany({ where: { userId }, orderBy: { startedAt: "asc" },
      include: { topic: { select: { name: true, subject: { select: { name: true, exam: { select: { name: true } } } } } } } });
    csv = toCsv(["started_at", "exam", "subject", "topic", "task_type", "active_min", "planned_min"],
      rows.map((r) => [r.startedAt, r.topic?.subject.exam.name, r.topic?.subject.name, r.topic?.name, r.taskType, r.activeMin, r.plannedMin]));
  } else if (kind === "mock-history") {
    const rows = await prisma.mock.findMany({ where: { userId }, orderBy: { takenOn: "asc" }, include: { sections: true, exam: true } });
    csv = toCsv(["date", "exam", "mock", "total_score", "section", "section_score", "attempted", "correct", "incorrect", "skipped"],
      rows.flatMap((m) => (m.sections.length ? m.sections : [null]).map((s) =>
        [isoDate(m.takenOn), m.exam.name, m.name, m.totalScore, s?.name, s?.score, s?.attempted, s?.correct, s?.incorrect, s?.skipped])));
  } else if (kind === "mock-questions") {
    const rows = await prisma.mockQuestion.findMany({ where: { mock: { userId } }, include: { mock: true, topic: true },
      orderBy: [{ mockId: "asc" }, { section: "asc" }, { number: "asc" }] });
    csv = toCsv(["mock", "date", "section", "number", "topic", "subtopic", "attempted", "correct", "time_sec", "error_type", "difficulty", "confidence"],
      rows.map((q) => [q.mock.name, isoDate(q.mock.takenOn), q.section, q.number, q.topic?.name, q.subtopic, q.attempted, q.correct,
        q.timeSec, q.errorType, q.difficulty, q.confidence]));
  } else if (kind === "rehab-history") {
    const rows = await prisma.rehabSession.findMany({ where: { userId }, include: { program: true }, orderBy: { date: "asc" } });
    csv = toCsv(["date", "program", "status", "pain_before", "pain_after", "difficulty", "notes"],
      rows.map((r) => [isoDate(r.date), r.program.name, r.status, r.painBefore, r.painAfter, r.difficulty, r.notes]));
  } else {
    const rows = await prisma.topic.findMany({ where: { subject: { exam: { userId } } }, include: { subject: { include: { exam: true } } } });
    csv = toCsv(["exam", "subject", "topic", "importance", "coverage", "status", "user_priority", "active"],
      rows.map((t) => [t.subject.exam.name, t.subject.name, t.name, t.importance, t.coverage, t.status, t.userPriority, t.active]));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="apex-${kind}.csv"`);
  res.send(csv);
}));
