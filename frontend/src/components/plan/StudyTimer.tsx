import { useEffect, useState } from "react";
import { Button } from "../ui/primitives";

export interface TimerState { itemId: string; title: string; startedAt: number; accumulatedMs: number; runningSince: number | null }

const fmt = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
export const elapsedMs = (t: TimerState, now = Date.now()) => t.accumulatedMs + (t.runningSince ? now - t.runningSince : 0);

/** Active time excludes pauses; the finished minutes feed duration calibration. */
export function StudyTimer({ timer, onChange, onFinish, busy }: {
  timer: TimerState; onChange: (t: TimerState | null) => void; onFinish: (activeMin: number) => void; busy: boolean;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!timer.runningSince) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [timer.runningSince]);
  const ms = elapsedMs(timer);

  return (
    <div className="panel sticky top-2 z-10 flex flex-wrap items-center justify-between gap-3 border-ridge/50 p-4" role="timer" aria-label="Study timer">
      <div>
        <p className="text-sm text-dim">{timer.runningSince ? "Studying" : "Paused"}</p>
        <p className="font-medium">{timer.title}</p>
      </div>
      <p className="num font-display text-3xl font-semibold">{fmt(ms)}</p>
      <div className="flex gap-2">
        {timer.runningSince
          ? <Button onClick={() => onChange({ ...timer, accumulatedMs: ms, runningSince: null })}>Pause</Button>
          : <Button onClick={() => onChange({ ...timer, runningSince: Date.now() })}>Resume</Button>}
        <Button variant="primary" disabled={busy || ms < 60_000} onClick={() => onFinish(Math.max(1, Math.round(ms / 60_000)))}>Finish</Button>
        <Button onClick={() => onChange(null)}>Discard</Button>
      </div>
    </div>
  );
}
