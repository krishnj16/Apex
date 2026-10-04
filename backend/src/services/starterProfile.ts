/**
 * Starter profile offered during onboarding. These are INITIAL values only: every field is
 * editable afterwards, and nothing in the engine refers to these names.
 *
 * Exam dates are placeholders the user must confirm in onboarding step 2.
 */
import type { Prisma, SubjectKind, TopicStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { toDateOnly } from "../lib/dates.js";

type T = [name: string, importance: number, coverage: number, status: TopicStatus];
type S = { name: string; kind: SubjectKind; cadenceDays: number; topics: T[] };
type E = { name: string; examDate: string; userPriority: number; subjects: S[] };

export const STARTER_EXAMS: E[] = [
  {
    name: "CAT 2026",
    examDate: "2026-11-29", // placeholder: confirm the official date in onboarding
    userPriority: 1.0,
    subjects: [
      { name: "Quant", kind: "quantitative", cadenceDays: 2, topics: [
        ["Arithmetic", 5, 0.85, "familiar"], ["Algebra", 5, 0.85, "familiar"], ["Geometry", 4, 0.85, "familiar"],
        ["Number System", 3, 0.3, "learning"], ["Modern Math", 3, 0.2, "learning"],
      ] },
      { name: "VARC", kind: "verbal", cadenceDays: 2, topics: [
        ["Reading Comprehension", 5, 0.6, "learning"], ["Para Jumbles", 3, 0.5, "learning"],
        ["Para Summary", 3, 0.5, "learning"], ["Odd Sentence Out", 2, 0.4, "learning"],
      ] },
      { name: "LRDI", kind: "reasoning", cadenceDays: 2, topics: [
        ["Tables", 4, 0.5, "learning"], ["Arrangements", 4, 0.5, "learning"], ["Games", 3, 0.3, "learning"],
      ] },
    ],
  },
  {
    name: "CDS 2027",
    examDate: "2027-04-11", // placeholder: confirm the official date in onboarding
    userPriority: 1.0,
    subjects: [
      { name: "Mathematics", kind: "quantitative", cadenceDays: 4, topics: [
        ["Arithmetic", 4, 0.6, "familiar"], ["Algebra", 4, 0.6, "familiar"], ["Geometry", 4, 0.5, "familiar"],
        ["Trigonometry", 4, 0.1, "not_started"], ["Mensuration", 3, 0.2, "learning"], ["Statistics", 2, 0.1, "not_started"],
      ] },
      { name: "English", kind: "verbal", cadenceDays: 2, topics: [
        ["Grammar", 4, 0.3, "learning"], ["Vocabulary", 4, 0.3, "learning"], ["Reading Comprehension", 3, 0.4, "learning"],
      ] },
      { name: "General Studies", kind: "knowledge", cadenceDays: 2, topics: [
        ["History", 4, 0.2, "learning"], ["Geography", 4, 0.2, "learning"], ["Polity", 4, 0.2, "learning"],
        ["Science", 4, 0.15, "learning"], ["Current Affairs", 3, 0.1, "not_started"],
      ] },
    ],
  },
];

type X = [name: string, area: string, sets: number, repsMin: number | null, repsMax: number | null,
  secMin: number | null, secMax: number | null];

/** Transcribed from the user's reference image. No exercises are added beyond it. */
export const LEG_EXERCISES: X[] = [
  ["Short-foot", "Feet & ankles", 3, 10, 15, null, null],
  ["Single-leg calf raises", "Feet & ankles", 3, 12, 15, null, null],
  ["Tibialis raises", "Feet & ankles", 3, 15, 20, null, null],
  ["Knee-to-wall ankle mobility", "Feet & ankles", 3, 10, 10, null, null],
  ["Single-leg balance", "Feet & ankles", 3, null, null, 30, 45],
  ["Spanish squat/isometric", "Knee", 3, null, null, 30, 45],
  ["Step-ups", "Knee", 3, 10, 10, null, null],
  ["Split squats", "Knee", 3, 8, 12, null, null],
  ["Leg extensions", "Knee", 3, 10, 15, null, null],
  ["Side plank", "Hips", 3, null, null, 20, 40],
  ["Hip abduction", "Hips", 3, 12, 15, null, null],
  ["Single-leg bridges", "Hips", 3, 10, 15, null, null],
];

export async function applyStarterProfile(userId: string, examDates?: Record<string, string>) {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const e of STARTER_EXAMS) {
      await tx.exam.create({
        data: {
          userId, name: e.name, examDate: toDateOnly(examDates?.[e.name] ?? e.examDate), userPriority: e.userPriority,
          subjects: {
            create: e.subjects.map((s, si) => ({
              name: s.name, kind: s.kind, cadenceDays: s.cadenceDays, order: si,
              topics: { create: s.topics.map(([name, importance, coverage, status], ti) =>
                ({ name, importance, coverage, status, order: ti })) },
            })),
          },
        },
      });
    }
    await tx.rehabProgram.create({
      data: {
        userId, name: "Leg", dailyMin: 60, preferredStartMin: 17 * 60,
        exercises: { create: LEG_EXERCISES.map(([name, bodyArea, sets, repsMin, repsMax, secMin, secMax], order) =>
          ({ name, bodyArea, sets, repsMin, repsMax, secMin, secMax, order })) },
      },
    });
    // Wrist exercises were not in the reference image; the user adds their own.
    await tx.rehabProgram.create({ data: { userId, name: "Wrist", dailyMin: 30, preferredStartMin: 18 * 60 + 15 } });
    await tx.userPreference.upsert({ where: { userId }, create: { userId }, update: {} });
  });
}
