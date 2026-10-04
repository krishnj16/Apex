import { useState, type FormEvent } from "react";
import { api, ApiError } from "../../api/client";
import { parseClock } from "../../lib/format";
import { Button, ErrorNote } from "../ui/primitives";

export interface TopicOption { id: string; name: string; active: boolean; subject: { name: string; exam: { name: string } } }

const TYPES: Array<[string, string]> = [
  ["concept_learning", "Learn concepts"], ["practice", "Practice"], ["timed_practice", "Timed practice"], ["revision", "Revision"],
  ["mock_test", "Mock test"], ["sectional_test", "Sectional test"], ["mock_analysis", "Mock analysis"],
  ["error_log_review", "Error log review"], ["reading", "Reading"], ["current_affairs", "Current affairs"],
  ["vocabulary", "Vocabulary"], ["formula_revision", "Formula revision"],
  ["question_selection_practice", "Question selection"], ["maintenance_practice", "Maintenance practice"],
];

const nextQuarter = () => {
  const d = new Date();
  const m = Math.ceil((d.getHours() * 60 + d.getMinutes() + 1) / 15) * 15;
  const c = Math.min(m, 23 * 60);
  return `${String(Math.floor(c / 60)).padStart(2, "0")}:${String(c % 60).padStart(2, "0")}`;
};

/** Plan your own day: pick a topic (or type anything), a time and a length. It will not overlap anything else. */
export function AddTaskForm({ date, topics, onAdded, defaultStart }: {
  date?: string; topics: TopicOption[]; onAdded: () => void; defaultStart?: string;
}) {
  const [f, setF] = useState({ topicId: "", title: "", taskType: "practice", start: defaultStart ?? nextQuarter(), minutes: 45 });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await api.post("/tasks", {
        date, topicId: f.topicId || undefined, title: f.title.trim() || undefined, taskType: f.taskType,
        startMin: parseClock(f.start), durationMin: f.minutes,
      });
      setF({ ...f, title: "" });
      onAdded();
    } catch (x) { setErr(x instanceof ApiError ? x.message : "Could not add the task"); }
    finally { setBusy(false); }
  }

  const grouped = topics.filter((t) => t.active).reduce<Record<string, TopicOption[]>>((acc, t) => {
    const k = `${t.subject.exam.name} · ${t.subject.name}`;
    (acc[k] ??= []).push(t);
    return acc;
  }, {});

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-6">
      <label className="sm:col-span-2"><span className="label">Topic</span>
        <select className="field" value={f.topicId} onChange={(e) => setF({ ...f, topicId: e.target.value })}>
          <option value="">Something else (name it)</option>
          {Object.entries(grouped).map(([g, ts]) => <optgroup key={g} label={g}>{ts.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
        </select></label>
      <label className="sm:col-span-2"><span className="label">Name {f.topicId ? "(optional)" : ""}</span>
        <input className="field" required={!f.topicId} placeholder={f.topicId ? "Leave blank to use the topic name" : "e.g. Revise formulas"} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
      <label className="sm:col-span-2"><span className="label">Kind of work</span>
        <select className="field" value={f.taskType} onChange={(e) => setF({ ...f, taskType: e.target.value })}>
          {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label><span className="label">Start</span><input className="field" type="time" required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
      <label><span className="label">Minutes</span><input className="field" type="number" min={10} max={300} step={5} required value={f.minutes} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })} /></label>
      <div className="flex items-end"><Button variant="primary" type="submit" disabled={busy}>Add to day</Button></div>
      {err && <div className="sm:col-span-6"><ErrorNote message={err} /></div>}
    </form>
  );
}
