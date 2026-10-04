import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Exam } from "../api/types";
import { useApi } from "../hooks/useApi";
import { Button, ErrorNote, Panel } from "../components/ui/primitives";
import { human } from "../lib/format";

const ERRORS = ["knowledge", "concept_confusion", "application", "calculation", "careless", "time_management",
  "question_selection", "interpretation", "guessing", "unknown"];
interface Q { section: string; number: number; topicId: string; attempted: boolean; correct: boolean | null; time: string;
  errorType: string; difficulty: string }
interface MockFull { id: string; name: string; examId: string; analysedAt: string | null; sections: Array<{ name: string; attempted: number; skipped: number }>;
  questions: Array<{ section: string; number: number; topicId: string | null; attempted: boolean; correct: boolean | null;
    timeSec: number | null; errorType: string | null; difficulty: string | null }> }

const toSec = (t: string) => { const [m, s] = t.split(":").map(Number); return t ? (m ?? 0) * 60 + (s ?? 0) : undefined; };
const fromSec = (s: number | null) => (s == null ? "" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);

export default function MockDetail() {
  const { id } = useParams();
  const mock = useApi<MockFull>(`/mocks/${id}`);
  const exams = useApi<Exam[]>("/exams");
  const [rows, setRows] = useState<Q[]>([]);
  const [section, setSection] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const m = mock.data;
    if (!m) return;
    setSection((s) => s || m.sections[0]?.name || "Section 1");
    setRows(m.questions.map((q) => ({ section: q.section, number: q.number, topicId: q.topicId ?? "", attempted: q.attempted,
      correct: q.correct, time: fromSec(q.timeSec), errorType: q.errorType ?? "", difficulty: q.difficulty ?? "" })));
  }, [mock.data]);

  if (mock.error) return <ErrorNote message={mock.error.message} />;
  const m = mock.data;
  if (!m) return <p className="text-muted">Loading…</p>;
  const topics = exams.data?.find((e) => e.id === m.examId)?.subjects.flatMap((s) => s.topics.map((t) => ({ ...t, subject: s.name }))) ?? [];
  const sec = rows.filter((r) => r.section === section);
  const update = (n: number, patch: Partial<Q>) => setRows(rows.map((r) => (r.section === section && r.number === n ? { ...r, ...patch } : r)));
  const addRows = (k: number) => {
    const start = Math.max(0, ...sec.map((r) => r.number));
    setRows([...rows, ...Array.from({ length: k }, (_, i) => ({ section, number: start + i + 1, topicId: "", attempted: true,
      correct: true, time: "", errorType: "", difficulty: "" }))]);
  };
  const save = async () => {
    setErr(null); setMsg(null);
    try {
      const r = await api.post<{ saved: number }>(`/mocks/${m.id}/questions`, { questions: rows.map((q) => ({
        section: q.section, number: q.number, topicId: q.topicId || undefined, attempted: q.attempted,
        correct: q.attempted ? q.correct : null, timeSec: toSec(q.time), errorType: q.attempted && q.correct === false && q.errorType ? q.errorType : undefined,
        difficulty: q.difficulty || undefined })) });
      setMsg(`Saved ${r.saved} questions. Future plans now use them.`);
    } catch (x) { setErr((x as Error).message); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="display text-3xl">{m.name}</h1>
        {!m.analysedAt && <Button onClick={() => void api.post(`/mocks/${m.id}/analysed`).then(mock.reload)}>Mark analysis done</Button>}
      </header>
      <Panel title="Question log" action={
        <div className="flex gap-1" role="tablist">{[...new Set([...m.sections.map((s) => s.name), ...rows.map((r) => r.section)])].map((s) => (
          <button key={s} role="tab" aria-selected={s === section} onClick={() => setSection(s)}
            className={`rounded-chip px-2.5 py-1 text-sm ${s === section ? "bg-raised" : "text-muted"}`}>{s}</button>))}</div>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-muted"><tr>{["#", "Topic", "Result", "Time (m:ss)", "Why wrong", "Difficulty"].map((h) =>
              <th key={h} className="pb-2 pr-2 font-normal">{h}</th>)}</tr></thead>
            <tbody>{sec.map((q) => (
              <tr key={q.number} className="border-t border-line">
                <td className="py-1.5 pr-2 text-muted">{q.number}</td>
                <td className="pr-2"><select aria-label={`Q${q.number} topic`} className="field" value={q.topicId} onChange={(e) => update(q.number, { topicId: e.target.value })}>
                  <option value="">Untagged</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.subject}: {t.name}</option>)}</select></td>
                <td className="pr-2"><select aria-label={`Q${q.number} result`} className="field"
                  value={!q.attempted ? "skip" : q.correct ? "right" : "wrong"}
                  onChange={(e) => update(q.number, e.target.value === "skip" ? { attempted: false, correct: null } : { attempted: true, correct: e.target.value === "right" })}>
                  <option value="right">Correct</option><option value="wrong">Wrong</option><option value="skip">Not attempted</option></select></td>
                <td className="pr-2"><input aria-label={`Q${q.number} time`} className="field w-24" placeholder="2:30" value={q.time} onChange={(e) => update(q.number, { time: e.target.value })} /></td>
                <td className="pr-2"><select aria-label={`Q${q.number} error`} className="field" disabled={!(q.attempted && q.correct === false)} value={q.errorType}
                  onChange={(e) => update(q.number, { errorType: e.target.value })}><option value="">—</option>{ERRORS.map((x) => <option key={x} value={x}>{human(x)}</option>)}</select></td>
                <td><select aria-label={`Q${q.number} difficulty`} className="field" value={q.difficulty} onChange={(e) => update(q.number, { difficulty: e.target.value })}>
                  <option value="">—</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={() => addRows(1)}>Add question</Button>
          <Button onClick={() => addRows(10)}>Add 10</Button>
          <Button variant="primary" onClick={() => void save()}>Save questions</Button>
          {msg && <span className="text-sm text-done">{msg}</span>}
        </div>
        {err && <div className="mt-3"><ErrorNote message={err} /></div>}
      </Panel>
    </div>
  );
}
