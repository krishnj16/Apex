import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import type { CheckIn } from "../../api/types";
import { Button, ErrorNote } from "../ui/primitives";

type Field = "sleepHours" | "sleepQuality" | "energy" | "stress" | "mentalFatigue" | "legDiscomfort" | "wristDiscomfort" | "physicalDiscomfort";
const SCALES: Array<[Field, string, number, number, string]> = [
  ["sleepQuality", "Sleep quality", 1, 5, "1 poor · 5 great"],
  ["energy", "Energy", 1, 10, "1 drained · 10 sharp"],
  ["stress", "Stress", 1, 10, "1 calm · 10 overwhelmed"],
  ["mentalFatigue", "Mental fatigue", 1, 10, "1 fresh · 10 foggy"],
];
const OPTIONAL: Array<[Field, string]> = [["legDiscomfort", "Leg discomfort"], ["wristDiscomfort", "Wrist discomfort"], ["physicalDiscomfort", "General physical discomfort"]];

/** Saving re-plans the day. Discomfort fields are recorded for your own history only. */
export function CheckInForm({ initial, onSaved, compact = false }: { initial?: CheckIn | null; onSaved: () => void; compact?: boolean }) {
  const [v, setV] = useState<Record<string, number | null>>({
    sleepHours: initial?.sleepHours ?? null, sleepQuality: initial?.sleepQuality ?? null, energy: initial?.energy ?? null,
    stress: initial?.stress ?? null, mentalFatigue: initial?.mentalFatigue ?? null, legDiscomfort: initial?.legDiscomfort ?? null,
    wristDiscomfort: initial?.wristDiscomfort ?? null, physicalDiscomfort: initial?.physicalDiscomfort ?? null,
    availableStudyMin: initial?.availableStudyMin ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, raw: string) => setV((s) => ({ ...s, [k]: raw === "" ? null : Number(raw) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await api.post("/checkins", v); onSaved(); }
    catch (x) { setErr(x instanceof ApiError ? x.message : "Could not save the check-in"); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label><span className="label">Sleep (hours)</span>
          <input className="field" type="number" step="0.25" min={0} max={24} value={v.sleepHours ?? ""} onChange={(e) => set("sleepHours", e.target.value)} /></label>
        <label><span className="label">Study time you have today (hours, optional)</span>
          <input className="field" type="number" step="0.25" min={0} max={16}
            value={v.availableStudyMin === null || v.availableStudyMin === undefined ? "" : v.availableStudyMin / 60}
            onChange={(e) => setV((s) => ({ ...s, availableStudyMin: e.target.value === "" ? null : Math.round(Number(e.target.value) * 60) }))} /></label>
        {SCALES.map(([k, label, lo, hi, hint]) => (
          <fieldset key={k}>
            <legend className="label">{label} <span className="text-xs">({hint})</span></legend>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).map((n) => (
                <label key={n} className={`num flex h-8 min-w-8 cursor-pointer items-center justify-center rounded border px-2 text-sm ${v[k] === n ? "border-ridge text-ridge" : "border-rule text-dim hover:text-ink"}`}>
                  <input type="radio" className="sr-only" name={k} value={n} checked={v[k] === n} onChange={() => setV((s) => ({ ...s, [k]: n }))} />{n}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {!compact && (
        <details className="text-sm">
          <summary className="cursor-pointer text-dim">Optional: discomfort (0–10, recorded only)</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            {OPTIONAL.map(([k, label]) => (
              <label key={k}><span className="label">{label}</span>
                <input className="field" type="number" min={0} max={10} value={v[k] ?? ""} onChange={(e) => set(k, e.target.value)} /></label>
            ))}
          </div>
        </details>
      )}
      {err && <ErrorNote message={err} />}
      <Button variant="primary" type="submit" disabled={busy}>{busy ? "Planning your day…" : "Save check-in and plan today"}</Button>
    </form>
  );
}
