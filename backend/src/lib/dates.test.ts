import { describe, expect, it } from "vitest";
import { addDays, daysBetween, todayIn, weekStart } from "./dates.js";

describe("dates", () => {
  it("adds days across month ends", () => expect(addDays("2026-10-31", 1)).toBe("2026-11-01"));
  it("counts days between exam and today", () => expect(daysBetween("2026-10-03", "2026-11-29")).toBe(57));
  it("finds Monday of the week", () => {
    expect(weekStart("2026-10-03")).toBe("2026-09-28"); // Saturday -> Monday
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
    expect(weekStart("2026-10-04")).toBe("2026-09-28"); // Sunday belongs to the same week
  });
  it("uses the user's timezone for 'today'", () => {
    expect(todayIn("Asia/Kolkata", new Date("2026-10-03T20:00:00Z"))).toBe("2026-10-04");
  });
});
