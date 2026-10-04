/**
 * DEMO MODE seed. Creates (or recreates) a separate demo account flagged isDemo=true.
 * Demo data never touches real accounts: everything hangs off the demo user and is
 * deleted with it. The UI shows a persistent DEMO MODE banner for this account.
 *
 *   DEMO_PASSWORD=... npm run seed:demo
 */
import bcrypt from "bcryptjs";
import type { ErrorType } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { addDays, toDateOnly, todayIn } from "../src/lib/dates.js";
import { applyStarterProfile } from "../src/services/starterProfile.js";

const EMAIL = "demo@apex.local";
const password = process.env.DEMO_PASSWORD;
if (!password || password.length < 10) {
  console.error("Set DEMO_PASSWORD (10+ characters) to create the demo account.");
  process.exit(1);
}

// Deterministic generator so the demo looks the same every time.
let seed = 42;
const rnd = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648) / 2_147_483_648);

async function main() {
  await prisma.user.deleteMany({ where: { email: EMAIL, isDemo: true } });
  const user = await prisma.user.create({
    data: { email: EMAIL, name: "Demo student", isDemo: true, onboardedAt: new Date(),
      passwordHash: await bcrypt.hash(password!, 12), preference: { create: {} } },
  });
  await applyStarterProfile(user.id);
  const today = todayIn(user.timezone);

  const exams = await prisma.exam.findMany({ where: { userId: user.id }, include: { subjects: { include: { topics: true } } } });
  const cat = exams.find((e) => e.name.startsWith("CAT"))!;
  const topic = (subject: string, name: string) => cat.subjects.find((s) => s.name === subject)!.topics.find((t) => t.name === name)!;

  await prisma.classSession.create({ data: { userId: user.id, title: "University lectures", startMin: 9 * 60, endMin: 10 * 60 + 30, weekdays: [1, 2, 3, 4, 5] } });

  // Five CAT mocks, 10 days apart, with a story: Algebra application errors rising, Arithmetic improving.
  const plan: Array<[string, string, number, number[]]> = [
    // subject, topic, questions per mock, accuracy per mock
    ["Quant", "Algebra", 6, [0.72, 0.7, 0.62, 0.58, 0.55]],
    ["Quant", "Arithmetic", 7, [0.62, 0.66, 0.7, 0.74, 0.78]],
    ["Quant", "Geometry", 5, [0.7, 0.72, 0.7, 0.74, 0.72]],
    ["VARC", "Reading Comprehension", 16, [0.6, 0.62, 0.66, 0.65, 0.7]],
    ["VARC", "Para Jumbles", 4, [0.5, 0.5, 0.55, 0.6, 0.6]],
    ["LRDI", "Tables", 10, [0.55, 0.5, 0.55, 0.5, 0.52]],
    ["LRDI", "Arrangements", 10, [0.5, 0.52, 0.48, 0.5, 0.5]],
  ];
  const errorsFor: Record<string, ErrorType[]> = {
    Algebra: ["application", "application", "application", "calculation", "knowledge"],
    Arithmetic: ["calculation", "careless", "application"],
    Geometry: ["concept_confusion", "application"],
    "Reading Comprehension": ["interpretation", "interpretation", "time_management"],
    "Para Jumbles": ["guessing", "interpretation"],
    Tables: ["question_selection", "time_management", "calculation"],
    Arrangements: ["question_selection", "application"],
  };
  const sectionOf: Record<string, string> = { Quant: "QA", VARC: "VARC", LRDI: "LRDI" };

  for (let m = 0; m < 5; m++) {
    const takenOn = addDays(today, -40 + m * 10);
    const qs: Array<{ section: string; number: number; topicId: string; attempted: boolean; correct: boolean | null;
      timeSec: number; errorType: ErrorType | null; difficulty: "easy" | "medium" | "hard" }> = [];
    const counter: Record<string, number> = {};
    const totals: Record<string, { c: number; i: number; s: number }> = {};
    for (const [subj, name, n, acc] of plan) {
      const t = topic(subj, name);
      const sec = sectionOf[subj]!;
      totals[sec] ??= { c: 0, i: 0, s: 0 };
      for (let k = 0; k < n; k++) {
        const attempted = rnd() > 0.15;
        const correct = attempted ? rnd() < acc[m]! : null;
        const errs = errorsFor[name]!;
        qs.push({ section: sec, number: (counter[sec] = (counter[sec] ?? 0) + 1), topicId: t.id, attempted, correct,
          timeSec: Math.round(70 + rnd() * 150), errorType: correct === false ? errs[Math.floor(rnd() * errs.length)]! : null,
          difficulty: (["easy", "medium", "hard"] as const)[Math.floor(rnd() * 3)]! });
        if (!attempted) totals[sec]!.s++; else if (correct) totals[sec]!.c++; else totals[sec]!.i++;
      }
    }
    const sections = Object.entries(totals).map(([name, t]) => ({ name, score: 3 * t.c - t.i,
      attempted: t.c + t.i, correct: t.c, incorrect: t.i, skipped: t.s }));
    await prisma.mock.create({
      data: { userId: user.id, examId: cat.id, name: `Mock #${m + 1}`, takenOn: toDateOnly(takenOn),
        totalScore: sections.reduce((a, s) => a + s.score, 0), totalMin: 120,
        analysedAt: m < 4 ? new Date() : null, // the latest mock is left unanalysed so the engine schedules it
        sections: { create: sections }, questions: { create: qs } },
    });
  }

  // Two weeks of history: study sessions, completed and skipped plan items, rehab and check-ins.
  const allTopics = exams.flatMap((e) => e.subjects.flatMap((s) => s.topics.map((t) => ({ t, s, e }))));
  const programs = await prisma.rehabProgram.findMany({ where: { userId: user.id } });
  for (let d = 14; d >= 1; d--) {
    const date = addDays(today, -d);
    const picks = [0, 1, 2, 3].map(() => allTopics[Math.floor(rnd() * allTopics.length)]!);
    await prisma.dailyPlan.create({
      data: { userId: user.id, date: toDateOnly(date), budget: { study_budget: 330 }, warnings: [], alternatives: [], engineVersion: "demo-seed",
        items: { create: picks.map(({ t, s, e }, k) => {
          const status = rnd() < 0.8 ? "completed" : "skipped";
          const planned = 60;
          const actual = status === "completed" ? Math.round(planned * (1 + rnd() * 0.35)) : null;
          return { topicId: t.id, examId: e.id, subjectId: s.id, title: `${t.name} — Practice`, taskType: "practice",
            startMin: 11 * 60 + k * 75, endMin: 11 * 60 + k * 75 + planned, plannedMin: planned, cognitiveLoad: 3,
            score: 50, priority: "MEDIUM", gap: "none", reasons: ["Demo history"], factors: {}, status, actualMin: actual,
            skipReason: status === "skipped" ? (rnd() < 0.5 ? "not_enough_time" : "too_tired") : null };
        }) } },
      include: { items: true },
    }).then((p) => Promise.all(p.items.filter((i) => i.status === "completed").map((i) => prisma.studySession.create({
      data: { userId: user.id, topicId: i.topicId, planItemId: i.id, taskType: i.taskType,
        startedAt: new Date(`${date}T00:00:00Z`), endedAt: new Date(`${date}T01:00:00Z`), activeMin: i.actualMin!, plannedMin: i.plannedMin },
    }))));
    for (const p of programs) {
      const r = rnd();
      await prisma.rehabSession.create({ data: { userId: user.id, programId: p.id, date: toDateOnly(date),
        status: r < 0.82 ? "completed" : r < 0.92 ? "partial" : "skipped" } });
    }
    await prisma.dailyCheckIn.create({ data: { userId: user.id, date: toDateOnly(date), sleepHours: 6 + rnd() * 2,
      sleepQuality: 3 + Math.floor(rnd() * 3), energy: 5 + Math.floor(rnd() * 4), stress: 3 + Math.floor(rnd() * 4),
      mentalFatigue: 3 + Math.floor(rnd() * 4) } });
  }
  console.log(`Demo account ready: ${EMAIL}`);
}

main().finally(() => prisma.$disconnect());
