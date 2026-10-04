import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import type { CheckIn, FixedBlock, Plan } from "../api/types";
import { useApi } from "../hooks/useApi";
import { hm, longDate } from "../lib/format";
import { Button, Empty, ErrorNote, Heading, Loading, Panel } from "../components/ui/primitives";
import { DayStrip } from "../components/plan/DayStrip";
import { TaskCard } from "../components/plan/TaskCard";
import { CheckInForm } from "../components/plan/CheckInForm";
import { AddTaskForm, type TopicOption } from "../components/plan/AddTaskForm";
import { StudyTimer, type TimerState } from "../components/plan/StudyTimer";

interface TodayData { date: string; plan: Plan | null; fixedBlocks: FixedBlock[]; checkin: CheckIn | null }
const TIMER_KEY = "apex.timer";

export function TodayPage() {
  const { data, error, loading, reload, setData } = useApi<TodayData>("/today");
  const topics = useApi<TopicOption[]>("/topics");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [timer, setTimerState] = useState<TimerState | null>(() => {
    try { return JSON.parse(localStorage.getItem(TIMER_KEY) ?? "null") as TimerState | null; } catch { return null; }
  });
  const setTimer = (t: TimerState | null) => {
    setTimerState(t);
    try { t ? localStorage.setItem(TIMER_KEY, JSON.stringify(t)) : localStorage.removeItem(TIMER_KEY); } catch { /* storage unavailable */ }
  };
  useEffect(() => { if (data && timer && !data.plan?.items.some((i) => i.id === timer.itemId)) setTimer(null); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(fn: () => Promise<unknown>, replan = false) {
    setBusy(true); setErr(null);
    try {
      const r = await fn();
      if (replan && data) setData({ ...data, plan: (r as Plan | null) ?? null });
      else await reload();
    } catch (e) { setErr(e instanceof ApiError ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error.message} />;
  if (!data) return null;
  const plan = data.plan;
  const studyItems = plan?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-dim">{longDate(data.date)}</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">What to do today</h1>
        </div>
        {plan && <Button disabled={busy} onClick={() => act(() => api.post("/generate-plan"), true)}>Re-plan the rest of today</Button>}
      </header>

      {err && <ErrorNote message={err} />}
      {timer && (
        <StudyTimer timer={timer} onChange={setTimer} busy={busy} onFinish={(activeMin) => act(async () => {
          const now = new Date();
          await api.post("/sessions", { planItemId: timer.itemId, startedAt: new Date(timer.startedAt).toISOString(), endedAt: now.toISOString(), activeMin });
          await api.post(`/tasks/${timer.itemId}/complete`, { actualMin: activeMin, completionPct: 100 });
          setTimer(null);
        })} />
      )}

      {!data.checkin && (
        <Panel>
          <Heading aside="About a minute">Start with a check-in</Heading>
          <p className="mb-4 text-sm text-dim">Readiness changes the kind of work APEX schedules, not whether you study.</p>
          <CheckInForm compact onSaved={() => void reload()} />
        </Panel>
      )}

      <Panel>
        <Heading aside="Pick the time yourself">Add your own task</Heading>
        <AddTaskForm topics={topics.data ?? []} onAdded={() => void reload()} />
        <p className="mt-3 text-xs text-dim">Your tasks are fixed in place. Re-planning works around them and never moves them.</p>
      </Panel>

      {!plan ? (
        <Empty title="No plan for today yet.">
          {data.checkin ? <Button className="mt-3" variant="primary" disabled={busy} onClick={() => act(() => api.post("/generate-plan"), true)}>Generate today's plan</Button>
            : "Complete the check-in above, or generate a plan with moderate readiness assumed. Or build the day yourself below."}
          {!data.checkin && <div className="mt-3"><Button disabled={busy} onClick={() => act(() => api.post("/generate-plan"), true)}>Generate without a check-in</Button></div>}
        </Empty>
      ) : (
        <>
          <Panel>
            <Heading aside={`${hm(plan.budget.study_budget)} study budget`}>Your day</Heading>
            <DayStrip items={studyItems} fixed={data.fixedBlocks} />
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-dim">How the study budget was calculated</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/90">
                {plan.budget.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </details>
            {plan.warnings.length > 0 && <ul className="mt-3 space-y-1 text-sm text-caution">{plan.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
          </Panel>

          <section aria-labelledby="tasks-h" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="tasks-h" className="font-display text-lg font-semibold">Tasks</h2>
              {studyItems.some((i) => i.status === "planned") && (
                <Button variant="danger" disabled={busy} onClick={() => act(() => api.post("/plan/clear", {}), true)}>Clear all not started</Button>
              )}
            </div>
            {studyItems.length === 0 && <Empty title="Nothing fits today's free time.">Check classes and rehab times in Settings, or your study limits.</Empty>}
            {studyItems.map((item) => (
              <TaskCard key={item.id} item={item} busy={busy} timerActive={!!timer}
                onStart={() => act(async () => {
                  await api.post(`/tasks/${item.id}/start`);
                  setTimer({ itemId: item.id, title: item.title, startedAt: Date.now(), accumulatedMs: 0, runningSince: Date.now() });
                })}
                onComplete={(actualMin, completionPct) => act(() => api.post(`/tasks/${item.id}/complete`, { actualMin, completionPct }))}
                onSkip={(reason) => act(() => api.post(`/tasks/${item.id}/skip`, reason ? { reason } : {}))}
                onMove={(startMin) => act(() => api.patch(`/tasks/${item.id}`, { startMin }), true)}
                onRemove={() => act(() => api.del(`/tasks/${item.id}`).then(() => api.get<TodayData>("/today")).then((t) => t.plan), true)} />
            ))}
          </section>

          {plan.alternatives.length > 0 && (
            <Panel>
              <Heading>Next in line</Heading>
              <p className="mb-3 text-sm text-dim">Ranked but not scheduled today. They compete again tomorrow.</p>
              <ul className="space-y-2 text-sm">
                {plan.alternatives.map((a) => (
                  <li key={a.title} className="flex justify-between gap-4"><span>{a.title}</span><span className="num text-dim">{a.score.toFixed(1)}</span></li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
