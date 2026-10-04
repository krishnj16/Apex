import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import { useApi } from "../hooks/useApi";
import { clock, parseClock } from "../lib/format";
import { Button, Empty, ErrorNote, Heading, Loading, Panel } from "../components/ui/primitives";

interface Prefs {
  dayStartMin: number; dayEndMin: number; studyMinMin: number; studyMaxMin: number; rejuvenationMinMin: number;
  rejuvenationMaxMin: number; preferredBlockMin: number; maxBlockMin: number; breakMin: number;
  notifyRehab: boolean; notifyWeeklyReview: boolean; notifyMocks: boolean;
}
interface ClassRow { id: string; title: string; subject: string | null; location: string | null; startMin: number; endMin: number; weekdays: number[]; date: string | null }
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PreferencesForm({ onSaved, submitLabel = "Save" }: { onSaved?: () => void; submitLabel?: string }) {
  const { data, error } = useApi<Prefs>("/preferences");
  const [p, setP] = useState<Prefs | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (data) setP(data); }, [data]);
  if (error) return <ErrorNote message={error.message} />;
  if (!p) return <Loading />;
  const hours = (k: keyof Prefs, label: string, step = 0.25) => (
    <label><span className="label">{label}</span>
      <input className="field" type="number" step={step} min={0} value={(p[k] as number) / 60}
        onChange={(e) => setP({ ...p, [k]: Math.round(Number(e.target.value) * 60) })} /></label>
  );
  const mins = (k: keyof Prefs, label: string) => (
    <label><span className="label">{label}</span>
      <input className="field" type="number" min={0} value={p[k] as number} onChange={(e) => setP({ ...p, [k]: Number(e.target.value) })} /></label>
  );
  const time = (k: keyof Prefs, label: string) => (
    <label><span className="label">{label}</span>
      <input className="field" type="time" value={clock(p[k] as number)} onChange={(e) => setP({ ...p, [k]: parseClock(e.target.value) })} /></label>
  );
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null); setSaved(false);
    try { await api.patch("/preferences", p); setSaved(true); onSaved?.(); } catch (x) { setErr(x instanceof ApiError ? x.message : "Could not save"); }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {time("dayStartMin", "Day starts")}{time("dayEndMin", "Day ends")}{mins("breakMin", "Break between blocks (min)")}
        {hours("studyMinMin", "Study minimum (hours)")}{hours("studyMaxMin", "Study maximum (hours)")}
        {hours("rejuvenationMinMin", "Rejuvenation minimum (hours)")}{hours("rejuvenationMaxMin", "Rejuvenation maximum (hours)")}
        {mins("preferredBlockMin", "Preferred block (min)")}{mins("maxBlockMin", "Longest block (min)")}
      </div>
      <fieldset className="space-y-2 text-sm">
        <legend className="label">Notifications (off unless you turn them on)</legend>
        {([["notifyRehab", "Rehab reminders"], ["notifyWeeklyReview", "Weekly review ready"], ["notifyMocks", "Upcoming mocks"]] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={p[k]} onChange={(e) => setP({ ...p, [k]: e.target.checked })} />{l}</label>
        ))}
      </fieldset>
      {err && <ErrorNote message={err} />}
      <div className="flex items-center gap-3"><Button variant="primary" type="submit">{submitLabel}</Button>{saved && !onSaved && <span className="text-sm text-rise">Saved</span>}</div>
    </form>
  );
}

function Classes() {
  const { data, reload, error } = useApi<ClassRow[]>("/classes");
  const [f, setF] = useState({ title: "", start: "09:00", end: "10:30", weekdays: [1, 2, 3, 4, 5] as number[], location: "" });
  const [err, setErr] = useState<string | null>(null);
  async function add(e: FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      await api.post("/classes", { title: f.title, startMin: parseClock(f.start), endMin: parseClock(f.end), weekdays: f.weekdays, location: f.location || null });
      setF({ ...f, title: "" }); await reload();
    } catch (x) { setErr(x instanceof ApiError ? x.message : "Could not add class"); }
  }
  return (
    <Panel>
      <Heading>Classes</Heading>
      {error && <ErrorNote message={error.message} />}
      {data && data.length === 0 && <Empty title="No classes yet.">Classes are fixed; plans are built around them.</Empty>}
      <ul className="mb-4 divide-y divide-rule text-sm">
        {(data ?? []).map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{c.title}{c.location && <span className="text-dim"> · {c.location}</span>}</span>
            <span className="num text-dim">{clock(c.startMin)}–{clock(c.endMin)} · {c.date ?? c.weekdays.map((d) => DAYS[d]).join(" ")}</span>
            <Button variant="danger" onClick={() => void api.del(`/classes/${c.id}`).then(reload)}>Remove</Button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-4">
        <label className="sm:col-span-2"><span className="label">Class</span><input className="field" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
        <label><span className="label">Starts</span><input className="field" type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
        <label><span className="label">Ends</span><input className="field" type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        <fieldset className="sm:col-span-3"><legend className="label">Repeats on</legend>
          <div className="flex flex-wrap gap-1">{DAYS.map((d, i) => (
            <label key={d} className={`cursor-pointer rounded border px-2 py-1 text-sm ${f.weekdays.includes(i) ? "border-ridge text-ridge" : "border-rule text-dim"}`}>
              <input type="checkbox" className="sr-only" checked={f.weekdays.includes(i)}
                onChange={() => setF({ ...f, weekdays: f.weekdays.includes(i) ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i] })} />{d}</label>))}
          </div></fieldset>
        <label><span className="label">Location (optional)</span><input className="field" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
        {err && <div className="sm:col-span-4"><ErrorNote message={err} /></div>}
        <div><Button variant="primary" type="submit">Add class</Button></div>
      </form>
    </Panel>
  );
}

export function SettingsPage() {
  const exports: Array<[string, string]> = [["study-history", "Study history"], ["mock-history", "Mock history"],
    ["mock-questions", "Mock questions"], ["rehab-history", "Rehab history"], ["syllabus", "Syllabus"]];
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Settings</h1>
      <Panel><Heading>Study limits and day</Heading><PreferencesForm /></Panel>
      <Classes />
      <Panel>
        <Heading>Export</Heading>
        <p className="mb-3 text-sm text-dim">CSV files of your own records.</p>
        <div className="flex flex-wrap gap-2">{exports.map(([k, l]) => <a key={k} className="rounded-md border border-rule px-3 py-2 text-sm hover:border-dim" href={`/api/export/${k}`}>{l}</a>)}</div>
      </Panel>
    </div>
  );
}
