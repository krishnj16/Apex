import { useState, type FormEvent } from "react";
import { api, ApiError } from "../api/client";
import type { Exam, Topic } from "../api/types";
import { useApi } from "../hooks/useApi";
import { Button, Empty, ErrorNote, Heading, Loading, Panel } from "../components/ui/primitives";

const STATUSES: Array<[string, string]> = [["not_started", "Not started"], ["learning", "Learning"], ["familiar", "Familiar"], ["strong", "Strong"]];

function InlineAdd({ label, onAdd }: { label: string; onAdd: (name: string) => Promise<void> }) {
  const [name, setName] = useState("");
  return (
    <form className="flex gap-2" onSubmit={async (e: FormEvent) => { e.preventDefault(); if (name.trim()) { await onAdd(name.trim()); setName(""); } }}>
      <input className="field max-w-xs" placeholder={label} aria-label={label} value={name} onChange={(e) => setName(e.target.value)} />
      <Button type="submit">Add</Button>
    </form>
  );
}

function TopicRow({ t, onError }: { t: Topic; onError: (m: string) => void }) {
  const [v, setV] = useState(t);
  const save = (patch: Partial<Topic>) => {
    setV({ ...v, ...patch });
    api.patch(`/topics/${t.id}`, patch).catch((e) => onError(e instanceof ApiError ? e.message : "Could not save"));
  };
  return (
    <tr className="border-t border-rule">
      <td className="py-2 pr-3">{v.name}</td>
      <td className="py-2 pr-3">
        <select className="field" aria-label={`${v.name} status`} value={v.status} onChange={(e) => save({ status: e.target.value })}>
          {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={100} step={5} aria-label={`${v.name} coverage`} value={Math.round(v.coverage * 100)}
            onChange={(e) => setV({ ...v, coverage: Number(e.target.value) / 100 })} onPointerUp={() => save({ coverage: v.coverage })}
            onKeyUp={() => save({ coverage: v.coverage })} />
          <span className="num w-10 text-right text-dim">{Math.round(v.coverage * 100)}%</span>
        </div>
      </td>
      <td className="py-2 pr-3">
        <select className="field w-16" aria-label={`${v.name} importance`} value={v.importance} onChange={(e) => save({ importance: Number(e.target.value) })}>
          {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
      </td>
      <td className="py-2 pr-3">
        <select className="field w-24" aria-label={`${v.name} your priority`} value={v.userPriority} onChange={(e) => save({ userPriority: Number(e.target.value) })}>
          {[[0.5, "Lower"], [1, "Normal"], [1.5, "Higher"], [2, "Top"]].map(([n, l]) => <option key={n} value={n}>{l}</option>)}</select>
      </td>
      <td className="py-2">
        <input type="checkbox" aria-label={`${v.name} active`} checked={v.active} onChange={(e) => save({ active: e.target.checked })} />
      </td>
    </tr>
  );
}

export function SyllabusPage() {
  const { data, error, loading, reload } = useApi<Exam[]>("/exams");
  const [err, setErr] = useState<string | null>(null);
  const [ne, setNe] = useState({ name: "", examDate: "" });
  const wrap = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); await reload(); } catch (e) { setErr(e instanceof ApiError ? e.message : "Failed"); } };

  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error.message} />;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Exams & syllabus</h1>
      <p className="max-w-prose text-sm text-dim">All exams share one planner. Exam date, importance and your priority decide how topics compete; nothing is fixed per exam. Importance is the topic's weight in the exam (1–5).</p>
      {err && <ErrorNote message={err} />}
      {(data ?? []).length === 0 && <Empty title="No exams yet.">Add your first exam below.</Empty>}
      {(data ?? []).map((exam) => (
        <Panel key={exam.id}>
          <Heading aside={
            <span className="flex items-center gap-2">
              <input className="field w-40" type="date" aria-label={`${exam.name} date`} defaultValue={exam.examDate}
                onBlur={(e) => e.target.value !== exam.examDate && void wrap(() => api.patch(`/exams/${exam.id}`, { examDate: e.target.value }))} />
              <label className="flex items-center gap-1"><input type="checkbox" defaultChecked={exam.active}
                onChange={(e) => void wrap(() => api.patch(`/exams/${exam.id}`, { active: e.target.checked }))} />Active</label>
            </span>}>{exam.name}</Heading>
          {exam.subjects.map((s) => (
            <div key={s.id} className="mb-6">
              <h3 className="mb-1 font-medium">{s.name}</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead><tr className="text-left text-dim">{["Topic", "Status", "Coverage", "Importance", "Your priority", "Active"].map((h) => <th key={h} className="pb-1 pr-3 font-normal">{h}</th>)}</tr></thead>
                  <tbody>{s.topics.map((t) => <TopicRow key={t.id} t={t} onError={setErr} />)}</tbody>
                </table>
              </div>
              <div className="mt-2"><InlineAdd label={`New topic in ${s.name}`} onAdd={(name) => wrap(() => api.post(`/subjects/${s.id}/topics`, { name }))} /></div>
            </div>
          ))}
          <InlineAdd label="New subject" onAdd={(name) => wrap(() => api.post(`/exams/${exam.id}/subjects`, { name }))} />
        </Panel>
      ))}
      <Panel>
        <Heading>Add an exam</Heading>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void wrap(() => api.post("/exams", ne)).then(() => setNe({ name: "", examDate: "" })); }}>
          <label><span className="label">Name</span><input className="field" required value={ne.name} onChange={(e) => setNe({ ...ne, name: e.target.value })} /></label>
          <label><span className="label">Date</span><input className="field" type="date" required value={ne.examDate} onChange={(e) => setNe({ ...ne, examDate: e.target.value })} /></label>
          <Button variant="primary" type="submit">Add exam</Button>
        </form>
      </Panel>
    </div>
  );
}
