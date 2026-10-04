import { useState } from "react";
import type { PlanItem } from "../../api/types";
import { clock, hm, titleCase } from "../../lib/format";
import { Button, PriorityBadge } from "../ui/primitives";

const SKIP_REASONS: Array<[string, string]> = [
  ["too_tired", "Too tired"], ["not_enough_time", "Not enough time"], ["difficult", "Difficult"],
  ["lost_focus", "Lost focus"], ["commitment", "Class or commitment"], ["other", "Other"],
];
const FACTOR_LABEL: Record<string, string> = {
  urgency: "Exam urgency", importance: "Topic importance", need: "Weakness / need", recency: "Time since practice",
  benefit: "Expected benefit", prerequisite: "Prerequisite value", consistency: "Subject cadence",
  user_priority: "Your priority", carryover: "Missed recently", readiness_fit: "Fit with today's readiness",
};

interface Props {
  item: PlanItem;
  busy: boolean;
  timerActive: boolean;
  onStart: () => void;
  onComplete: (actualMin: number, pct: number) => void;
  onSkip: (reason?: string) => void;
  onMove: (startMin: number) => void;
  onRemove: () => void;
}

export function TaskCard({ item, busy, timerActive, onStart, onComplete, onSkip, onMove, onRemove }: Props) {
  const [panel, setPanel] = useState<null | "why" | "done" | "skip" | "move">(null);
  const [actual, setActual] = useState(item.plannedMin);
  const [pctDone, setPctDone] = useState(100);
  const [moveTo, setMoveTo] = useState(clock(item.startMin));
  const finished = item.status === "completed" || item.status === "partial" || item.status === "skipped";
  const toggle = (p: typeof panel) => setPanel((cur) => (cur === p ? null : p));

  return (
    <article className={`panel p-4 ${item.status === "in_progress" ? "border-ridge/60" : ""} ${finished ? "opacity-70" : ""}`}
      aria-label={item.title}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="num text-sm text-dim">{clock(item.startMin)}–{clock(item.endMin)} · {hm(item.plannedMin)}</p>
          <h3 className="mt-0.5 font-medium text-ink">{item.title}</h3>
          <p className="mt-0.5 text-sm text-dim">{titleCase(item.taskType)} · load {item.cognitiveLoad}/3</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusText item={item} />
          <PriorityBadge priority={item.priority} />
        </div>
      </div>

      {item.reasons[0] && panel !== "why" && <p className="mt-3 text-sm text-ink/90">{item.reasons[0]}</p>}

      {!finished && (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.status === "planned" && <Button variant="primary" disabled={busy || timerActive} onClick={onStart}>Start</Button>}
          <Button disabled={busy} onClick={() => toggle("done")}>Complete</Button>
          <Button disabled={busy} onClick={() => toggle("skip")}>Skip</Button>
          <Button disabled={busy} onClick={() => toggle("move")}>Reschedule</Button>
          {item.status === "planned" && <Button variant="danger" disabled={busy} onClick={onRemove}>Remove</Button>}
          <Button onClick={() => toggle("why")} aria-expanded={panel === "why"}>Why?</Button>
        </div>
      )}
      {finished && <div className="mt-3"><Button onClick={() => toggle("why")} aria-expanded={panel === "why"}>Why?</Button></div>}

      {panel === "why" && (
        <div className="mt-4 border-t border-rule pt-4 text-sm">
          <ul className="list-disc space-y-1 pl-5 text-ink/90">{item.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {Object.keys(item.factors).length > 0 && (
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-dim sm:grid-cols-3">
              {Object.entries(item.factors).filter(([k]) => FACTOR_LABEL[k]).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2"><dt>{FACTOR_LABEL[k]}</dt><dd className="num text-ink">{v.toFixed(2)}</dd></div>
              ))}
            </dl>
          )}
          {!item.pinned && <p className="mt-2 text-xs text-dim">Priority score {item.score.toFixed(1)}. Factors are multiplied; see Recommendation engine docs.</p>}
        </div>
      )}

      {panel === "done" && (
        <form className="mt-4 flex flex-wrap items-end gap-3 border-t border-rule pt-4" onSubmit={(e) => { e.preventDefault(); onComplete(actual, pctDone); setPanel(null); }}>
          <label className="text-sm"><span className="label">Minutes spent</span>
            <input className="field w-28" type="number" min={1} max={600} value={actual} onChange={(e) => setActual(Number(e.target.value))} /></label>
          <label className="text-sm"><span className="label">How much got done</span>
            <select className="field w-36" value={pctDone} onChange={(e) => setPctDone(Number(e.target.value))}>
              {[100, 75, 50, 25].map((p) => <option key={p} value={p}>{p === 100 ? "All of it" : `${p}%`}</option>)}
            </select></label>
          <Button variant="primary" type="submit" disabled={busy}>{pctDone === 100 ? "Mark completed" : "Mark partly done"}</Button>
        </form>
      )}

      {panel === "skip" && (
        <div className="mt-4 border-t border-rule pt-4">
          <p className="mb-2 text-sm text-dim">Optional: what got in the way? It helps tomorrow's plan, nothing else.</p>
          <div className="flex flex-wrap gap-2">
            {SKIP_REASONS.map(([v, l]) => <Button key={v} disabled={busy} onClick={() => { onSkip(v); setPanel(null); }}>{l}</Button>)}
            <Button disabled={busy} onClick={() => { onSkip(); setPanel(null); }}>Skip without a reason</Button>
          </div>
        </div>
      )}

      {panel === "move" && (
        <form className="mt-4 flex flex-wrap items-end gap-3 border-t border-rule pt-4" onSubmit={(e) => {
          e.preventDefault();
          const [h, m] = moveTo.split(":").map(Number);
          onMove((h ?? 0) * 60 + (m ?? 0));
          setPanel(null);
        }}>
          <label className="text-sm"><span className="label">New start time</span>
            <input className="field w-32" type="time" value={moveTo} onChange={(e) => setMoveTo(e.target.value)} required /></label>
          <Button variant="primary" type="submit" disabled={busy}>Move and re-plan the rest</Button>
        </form>
      )}
    </article>
  );
}

function StatusText({ item }: { item: PlanItem }) {
  if (item.status === "completed") return <span className="text-sm text-rise">Done · {hm(item.actualMin)}</span>;
  if (item.status === "partial") return <span className="text-sm text-caution">{item.completionPct}% · {hm(item.actualMin)}</span>;
  if (item.status === "skipped") return <span className="text-sm text-fall">Skipped</span>;
  if (item.status === "in_progress") return <span className="text-sm text-ridge">In progress</span>;
  return null;
}
