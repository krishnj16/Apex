import { useState } from "react";
import { api, ApiError } from "../api/client";
import { useApi } from "../hooks/useApi";
import { clock, hm, parseClock, titleCase } from "../lib/format";
import { Button, Empty, ErrorNote, Heading, Loading, Panel } from "../components/ui/primitives";

interface Exercise { id: string; name: string; bodyArea: string; sets: number; repsMin: number | null; repsMax: number | null;
  secMin: number | null; secMax: number | null; notes: string | null; active: boolean; order: number }
interface Adherence { completed: number; partial: number; skipped: number; missed: number; scheduled: number; days: number }
interface Program { id: string; name: string; dailyMin: number; preferredStartMin: number | null; weekdays: number[]; active: boolean; exercises: Exercise[];
  today: { status: string } | null; week: Adherence; month: Adherence }

const dose = (e: Exercise) => {
  const r = (a: number | null, b: number | null) => (a === b || b === null ? `${a}` : `${a}–${b}`);
  return e.repsMin !== null ? `${e.sets}×${r(e.repsMin, e.repsMax)}` : e.secMin !== null ? `${e.sets}×${r(e.secMin, e.secMax)} sec` : `${e.sets} sets`;
};

/** Tracks an existing rehab routine. APEX schedules it as a fixed commitment and never adjusts the exercises itself. */
export function RehabPage() {
  const { data, error, loading, reload } = useApi<Program[]>("/rehab");
  const [err, setErr] = useState<string | null>(null);
  const wrap = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await reload(); } catch (e) { setErr(e instanceof ApiError ? e.message : "Failed"); } };
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error.message} />;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Rehabilitation</h1>
      <p className="max-w-prose text-sm text-dim">Rehab is a fixed block in every plan. Logging here is for your own record; pain and difficulty notes are never used to change exercises.</p>
      {err && <ErrorNote message={err} />}
      {(data ?? []).length === 0 && <Empty title="No rehab programme yet." />}
      {(data ?? []).map((p) => <ProgramCard key={p.id} p={p} wrap={wrap} />)}
    </div>
  );
}

function ProgramCard({ p, wrap }: { p: Program; wrap: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [log, setLog] = useState({ painBefore: "", painAfter: "", difficulty: "", notes: "" });
  const [newEx, setNewEx] = useState({ name: "", bodyArea: "", sets: "3", reps: "" });
  const areas = [...new Set(p.exercises.map((e) => e.bodyArea))];
  const n = (v: string) => (v === "" ? null : Number(v));
  const submit = (status: string) => wrap(() => api.post("/rehab/session", { programId: p.id, status,
    painBefore: n(log.painBefore), painAfter: n(log.painAfter), difficulty: n(log.difficulty), notes: log.notes || undefined }));

  return (
    <Panel>
      <Heading aside={<span className="num">{p.week.completed}/{p.week.scheduled} this week · {p.month.completed}/{p.month.scheduled} this month</span>}>{p.name} rehab · {hm(p.dailyMin)}</Heading>

      <div className="mb-5 rounded-md border border-rule p-4">
        <p className="mb-3 text-sm">{p.today ? <>Today: <span className={p.today.status === "completed" ? "text-rise" : "text-caution"}>{titleCase(p.today.status)}</span>. You can update it.</> : "Not logged today."}</p>
        <div className="grid gap-3 sm:grid-cols-4">
          {(["painBefore", "painAfter"] as const).map((k) => (
            <label key={k}><span className="label">{k === "painBefore" ? "Pain before (0–10)" : "Pain after (0–10)"}</span>
              <input className="field" type="number" min={0} max={10} value={log[k]} onChange={(e) => setLog({ ...log, [k]: e.target.value })} /></label>))}
          <label><span className="label">Difficulty (1–10)</span><input className="field" type="number" min={1} max={10} value={log.difficulty} onChange={(e) => setLog({ ...log, difficulty: e.target.value })} /></label>
          <label><span className="label">Notes</span><input className="field" value={log.notes} onChange={(e) => setLog({ ...log, notes: e.target.value })} /></label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => void submit("completed")}>Completed</Button>
          <Button onClick={() => void submit("partial")}>Partly done</Button>
          <Button onClick={() => void submit("skipped")}>Skipped</Button>
        </div>
      </div>

      {p.exercises.length === 0 ? <Empty title="No exercises listed.">Add the exercises from your programme below.</Empty> : areas.map((a) => (
        <div key={a} className="mb-4">
          <h3 className="mb-1 text-sm text-dim">{a}</h3>
          <ul className="divide-y divide-rule text-sm">
            {p.exercises.filter((e) => e.bodyArea === a).map((e) => (
              <li key={e.id} className={`flex flex-wrap items-center justify-between gap-2 py-2 ${e.active ? "" : "opacity-50"}`}>
                <span>{e.name}</span>
                <span className="flex items-center gap-3"><span className="num text-dim">{dose(e)}</span>
                  <label className="flex items-center gap-1 text-dim"><input type="checkbox" checked={e.active}
                    onChange={(ev) => void wrap(() => api.patch(`/rehab/exercises/${e.id}`, { active: ev.target.checked }))} />Active</label></span>
              </li>))}
          </ul>
        </div>
      ))}

      <details className="text-sm">
        <summary className="cursor-pointer text-dim">Edit programme</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label><span className="label">Minutes per day</span><input className="field" type="number" min={5} max={240} defaultValue={p.dailyMin}
            onBlur={(e) => Number(e.target.value) !== p.dailyMin && void wrap(() => api.patch(`/rehab/programs/${p.id}`, { dailyMin: Number(e.target.value) }))} /></label>
          <label><span className="label">Usual start</span><input className="field" type="time" defaultValue={p.preferredStartMin === null ? "" : clock(p.preferredStartMin)}
            onBlur={(e) => e.target.value && void wrap(() => api.patch(`/rehab/programs/${p.id}`, { preferredStartMin: parseClock(e.target.value) }))} /></label>
        </div>
        <fieldset className="mt-4"><legend className="label">Rehab days</legend>
          <div className="flex flex-wrap gap-1">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
            <label key={d} className={`cursor-pointer rounded border px-2 py-1 text-sm ${p.weekdays.includes(i) ? "border-ridge text-ridge" : "border-rule text-dim"}`}>
              <input type="checkbox" className="sr-only" checked={p.weekdays.includes(i)}
                onChange={() => void wrap(() => api.patch(`/rehab/programs/${p.id}`, { weekdays: p.weekdays.includes(i) ? p.weekdays.filter((x) => x !== i) : [...p.weekdays, i].sort() }))} />{d}</label>))}
          </div>
          <p className="mt-1 text-xs text-dim">To change just one day, open that day in the Calendar and click the rehab block.</p>
        </fieldset>
        <form className="mt-4 grid gap-3 sm:grid-cols-5" onSubmit={(e) => {
          e.preventDefault();
          const [lo, hi] = newEx.reps.split(/[-–]/).map((x) => Number(x.trim()));
          void wrap(() => api.post(`/rehab/programs/${p.id}/exercises`, { name: newEx.name, bodyArea: newEx.bodyArea || "General",
            sets: Number(newEx.sets), repsMin: lo || null, repsMax: hi || lo || null })).then(() => setNewEx({ name: "", bodyArea: "", sets: "3", reps: "" }));
        }}>
          <label className="sm:col-span-2"><span className="label">Exercise</span><input className="field" required value={newEx.name} onChange={(e) => setNewEx({ ...newEx, name: e.target.value })} /></label>
          <label><span className="label">Body area</span><input className="field" value={newEx.bodyArea} onChange={(e) => setNewEx({ ...newEx, bodyArea: e.target.value })} /></label>
          <label><span className="label">Sets</span><input className="field" type="number" min={1} value={newEx.sets} onChange={(e) => setNewEx({ ...newEx, sets: e.target.value })} /></label>
          <label><span className="label">Reps (e.g. 10–15)</span><input className="field" value={newEx.reps} onChange={(e) => setNewEx({ ...newEx, reps: e.target.value })} /></label>
          <div><Button type="submit">Add exercise</Button></div>
        </form>
      </details>
    </Panel>
  );
}
