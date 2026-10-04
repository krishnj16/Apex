import { useState } from "react";
import { api } from "../api/client";
import type { Exam, Subject, Topic } from "../api/types";
import { useApi } from "../hooks/useApi";
import { Button, Empty, ErrorNote, Field, Panel } from "../components/ui/primitives";

const STATUS: Array<[string, string]> = [["not_started", "Not started"], ["learning", "Learning"], ["familiar", "Familiar"], ["strong", "Strong"]];

function TopicRow({ t, onChange }: { t: Topic; onChange: () => void }) {
  const patch = (b: Partial<Topic>) => void api.patch(`/topics/${t.id}`, b).then(onChange);
  return (
    <tr className="border-t border-line">
      <td className="py-1.5 pr-2">{t.name}</td>
      <td className="pr-2"><select aria-label={`${t.name} status`} className="field" defaultValue={t.status} onChange={(e) => patch({ status: e.target.value })}>
        {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
      <td className="pr-2"><input aria-label={`${t.name} coverage`} className="field w-20" type="number" min={0} max={100} defaultValue={Math.round(t.coverage * 100)}
        onBlur={(e) => patch({ coverage: Math.min(100, Math.max(0, +e.target.value)) / 100 })} /></td>
      <td className="pr-2"><select aria-label={`${t.name} importance`} className="field w-20" defaultValue={t.importance} onChange={(e) => patch({ importance: +e.target.value })}>
        {[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></td>
      <td className="pr-2"><select aria-label={`${t.name} priority`} className="field w-28" defaultValue={t.userPriority} onChange={(e) => patch({ userPriority: +e.target.value })}>
        <option value={0.6}>Lower</option><option value={1}>Normal</option><option value={1.4}>Higher</option></select></td>
      <td><button className="text-xs text-faint hover:text-ink" onClick={() => patch({ active: !t.active })}>{t.active ? "Pause" : "Resume"}</button></td>
    </tr>
  );
}

function SubjectBlock({ s, onChange }: { s: Subject; onChange: () => void }) {
  const [name, setName] = useState("");
  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{s.name}</h3>
        <label className="text-sm text-muted">Keep in touch at least every{" "}
          <input aria-label={`${s.name} cadence`} className="field inline w-16 py-1" type="number" min={1} max={30} defaultValue={s.cadenceDays}
            onBlur={(e) => void api.patch(`/subjects/${s.id}`, { cadenceDays: +e.target.value }).then(onChange)} /> days</label>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-muted"><tr>{["Topic", "Status", "Coverage %", "Importance", "Your priority", ""].map((h) =>
            <th key={h} className="pb-1 pr-2 font-normal">{h}</th>)}</tr></thead>
          <tbody>{s.topics.map((t) => <TopicRow key={t.id} t={t} onChange={onChange} />)}</tbody>
        </table>
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void api.post(`/subjects/${s.id}/topics`, { name }).then(() => { setName(""); onChange(); }); }}>
        <input className="field max-w-xs" placeholder="Add a topic" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button>Add</Button>
      </form>
    </div>
  );
}

export default function Exams() {
  const { data, error, reload } = useApi<Exam[]>("/exams");
  const [f, setF] = useState({ name: "", examDate: "" });
  const [subj, setSubj] = useState<Record<string, string>>({});
  if (error) return <ErrorNote message={error.message} />;
  return (
    <div className="space-y-6">
      <header>
        <h1 className="display text-3xl">Exams & syllabus</h1>
        <p className="mt-1 max-w-2xl text-muted">One planning engine ranks every topic across all exams. Dates, coverage and importance here are what drive it.</p>
      </header>
      {data?.length === 0 && <Empty title="No exams yet">Add your first exam below.</Empty>}
      {data?.map((e) => (
        <Panel key={e.id} title={e.name} action={
          <div className="flex items-center gap-2 text-sm">
            <input aria-label={`${e.name} date`} className="field w-40 py-1" type="date" defaultValue={e.examDate.slice(0, 10)}
              onBlur={(x) => void api.patch(`/exams/${e.id}`, { examDate: x.target.value }).then(reload)} />
            <Button onClick={() => void api.patch(`/exams/${e.id}`, { active: !e.active }).then(reload)}>{e.active ? "Archive" : "Reactivate"}</Button>
          </div>}>
          {e.subjects.map((s) => <SubjectBlock key={s.id} s={s} onChange={() => void reload()} />)}
          <form className="mt-5 flex gap-2" onSubmit={(x) => { x.preventDefault(); void api.post(`/exams/${e.id}/subjects`, { name: subj[e.id] }).then(() => { setSubj({ ...subj, [e.id]: "" }); void reload(); }); }}>
            <input className="field max-w-xs" placeholder="Add a subject" required value={subj[e.id] ?? ""} onChange={(x) => setSubj({ ...subj, [e.id]: x.target.value })} />
            <Button>Add subject</Button>
          </form>
        </Panel>
      ))}
      <Panel title="Add an exam">
        <form className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end" onSubmit={(x) => { x.preventDefault(); void api.post("/exams", f).then(() => { setF({ name: "", examDate: "" }); void reload(); }); }}>
          <Field label="Name"><input className="field" required value={f.name} onChange={(x) => setF({ ...f, name: x.target.value })} /></Field>
          <Field label="Exam date"><input className="field" type="date" required value={f.examDate} onChange={(x) => setF({ ...f, examDate: x.target.value })} /></Field>
          <Button variant="primary">Add exam</Button>
        </form>
      </Panel>
    </div>
  );
}
