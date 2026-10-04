/** Typed client for the internal analytics service. All recommendation logic lives there. */
import { env } from "../config/env.js";
import { HttpError } from "../lib/http.js";

export interface FixedBlockDTO {
  start: number;
  end: number;
  kind: "class" | "rehab" | "commitment" | "pinned_study";
  label?: string;
  topic_id?: string | null;
  task_type?: string | null;
}

export interface PlanRequestDTO {
  today: string;
  exams: Array<{ id: string; name: string; exam_date: string; user_priority: number; active: boolean }>;
  subjects: Array<Record<string, unknown>>;
  topics: Array<Record<string, unknown>>;
  attempts: Array<Record<string, unknown>>;
  practice_logs: Array<Record<string, unknown>>;
  skipped: Array<Record<string, unknown>>;
  pending_mock_analyses: Array<Record<string, unknown>>;
  constraints: Record<string, unknown> & { fixed_blocks: FixedBlockDTO[] };
  checkin: Record<string, unknown> | null;
  duration_samples: Array<[number, number]>;
}

export interface PlanItemDTO {
  start: number;
  end: number;
  exam_id: string;
  subject_id: string | null;
  topic_id: string | null;
  title: string;
  task_type: string;
  duration: number;
  cognitive_load: number;
  score: number;
  priority: string;
  reasons: string[];
  factors: Record<string, number>;
  gap: string;
  mock_id: string | null;
  pinned: boolean;
}

export interface PlanResultDTO {
  today: string;
  readiness: number | null;
  readiness_notes: string[];
  budget: Record<string, unknown>;
  items: PlanItemDTO[];
  alternatives: Array<Omit<PlanItemDTO, "start" | "end" | "priority" | "pinned">>;
  warnings: string[];
}

export const ENGINE_VERSION = "unified-v1";

async function call<T>(path: string, payload: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.ANALYTICS_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Service-Token": env.ANALYTICS_SERVICE_TOKEN },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(503, "The analytics service is not reachable. Start it and try again.");
  }
  if (!res.ok) {
    const detail = await res.text();
    throw new HttpError(res.status === 422 ? 400 : 502, "Analytics service rejected the request", detail);
  }
  return (await res.json()) as T;
}

export const analytics = {
  dailyPlan: (req: PlanRequestDTO) => call<PlanResultDTO>("/recommend/daily-plan", req),
  rank: (req: PlanRequestDTO) => call<PlanResultDTO["alternatives"]>("/recommend/rank", req),
  topics: (req: PlanRequestDTO) => call<Array<Record<string, unknown>>>("/analyze/topic", req),
  mocks: (mocks: unknown[]) => call<Record<string, unknown>>("/analyze/mock", { mocks }),
  weekly: (payload: unknown) => call<Record<string, unknown>>("/analyze/weekly", payload),
  readiness: (c: unknown) => call<{ score: number | null; components: Record<string, number>; notes: string[] }>(
    "/calculate/readiness", c),
};
