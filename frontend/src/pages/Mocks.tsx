import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Exam } from "../api/types";
import { useApi } from "../hooks/useApi";
import { pct, shortDate, titleCase } from "../lib/format";
import { Button, Empty, ErrorNote, Heading, Loading, Panel } from "../components/ui/primitives";
import { ErrorDistribution, ScoreTrajectory, SectionTrajectory, type TrajectoryPoint } from "../components/charts/MockCharts";

interface MockRow { id: string; name: string; takenOn: string; totalScore: number; analysedAt: string | null; exam: { name: string };
  sections: Array<{ name: string; score: number; attempted: number; correct: number; incorrect: number; skipped: number }>; _count: { questions: number } }
interface Analytics {
  count: number; message?: string; trajectory?: TrajectoryPoint[]; summary?: string[];
  topic_accuracy?: Array<{ topic: string; accuracy: number | null; n: number; skipped: number }>;
  error_distribution?: Record<string, number>;
  selection?: { sufficient: boolean; message?: string; median_time_sec?: number; avg_time_correct_sec?: number | null;
    avg_time_incorrect_sec?: number | null; time_sinks?: number; time_sink_minutes?: number; skip_rate?: number };
}
const ERROR_TYPES = ["knowledge", "concept_confusion", "application", "calculation", "careless", "time_management", "question_selection", "interpretation", "guessing", "unknown"];

export function MocksPage() {
  const exams = useApi<Exam[]>("/exams");
  const [examId, setExamId] = useState<string>("");
  useEffect(() => { if (!examId && exams.data?.[0]) setExamId(exams.data[0].id); }, [exams.data, examId]);
  const mocks = useApi<MockRow[]>(examId ? `/mocks?examId=${examId}` : null);
  const an = useApi<Analytics>(examId ? `/mocks/analytics?examId=${examId}` : null);
  const [adding, setAdding] = useState(false);

  if (exams.loading && !exams.data) return <Loading />;
  if (!exams.data?.length) return <Empty title="Add an exam first.">Mocks belong to an exam. <Link className="text-ridge" to="/syllabus">Go to Exams & syllabus</Link></Empty>;
  const a = an.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl font-semibold">Mocks</h1>
        <div className="flex gap-2">
          <select className="field w-44" aria-label="Exam" value={examId} onChange={(e) => setExamId(e.target.value)}>
            {exams.data.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
          <Button variant="primary" onClick={() => setAdding((x) => !x)}>{adding ? "Close" : "Log a mock"}</Button>
        </div>
      </header>

      {adding && <NewMock examId={examId} sectionNames={exams.data.find((e) => e.id === examId)?.subjects.map((s) => s.name) ?? []} onSaved={() => { setAdding(false); void mocks.reload(); void an.reload(); }} />}
      {an.error && <ErrorNote message={an.error.message} />}

      {a && a.count === 0 && <Empty title="No mock data yet.">Complete your first mock to unlock performance analysis.</Empty>}
      {a && a.count > 0 && a.trajectory && (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel><Heading aside={`${a.count} mocks`}>Score trajectory</Heading><ScoreTrajectory points={a.trajectory} />
              <ul className="mt-3 space-y-1 text-sm text-ink/90">{a.summary?.map((s) => <li key={s}>{s}</li>)}</ul></Panel>
            <Panel><Heading>Sections</Heading><SectionTrajectory points={a.trajectory} /></Panel>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel><Heading>Where marks are lost</Heading><ErrorDistribution counts={a.error_distribution ?? {}} /></Panel>
            <Panel>
              <Heading>Question selection</Heading>
              {!a.selection?.sufficient ? <p className="text-sm text-dim">{a.selection?.message}</p> : (
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div><dt className="text-dim">Median time per question</dt><dd className="num text-lg">{a.selection.median_time_sec}s</dd></div>
                  <div><dt className="text-dim">Skip rate</dt><dd className="num text-lg">{pct(a.selection.skip_rate)}</dd></div>
                  <div><dt className="text-dim">Avg time, correct</dt><dd className="num text-lg">{a.selection.avg_time_correct_sec ?? "—"}s</dd></div>
                  <div><dt className="text-dim">Avg time, incorrect</dt><dd className="num text-lg">{a.selection.avg_time_incorrect_sec ?? "—"}s</dd></div>
                  <div className="col-span-2"><dt className="text-dim">Time sinks (long and wrong)</dt><dd className="num">{a.selection.time_sinks} questions, {a.selection.time_sink_minutes} min</dd></div>
                </dl>
              )}
            </Panel>
          </div>
          <Panel>
            <Heading aside="From tagged questions">Topic accuracy</Heading>
            {!a.topic_accuracy?.length ? <p className="text-sm text-dim">Tag questions with topics to see topic accuracy.</p> : (
              <table className="w-full text-sm"><thead><tr className="text-left text-dim"><th className="pb-2 font-normal">Topic</th><th className="pb-2 font-normal">Accuracy</th><th className="pb-2 font-normal">Answered</th><th className="pb-2 font-normal">Skipped</th></tr></thead>
                <tbody>{a.topic_accuracy.map((t) => <tr key={t.topic} className="border-t border-rule"><td className="py-2">{t.topic}</td>
                  <td className="num py-2">{t.n >= 5 ? pct(t.accuracy) : <span className="text-dim">{pct(t.accuracy)} (small sample)</span>}</td><td className="num py-2">{t.n}</td><td className="num py-2">{t.skipped}</td></tr>)}</tbody></table>
            )}
          </Panel>
        </>
      )}

      <Panel>
        <Heading>All mocks</Heading>
        {(mocks.data ?? []).length === 0 ? <p className="text-sm text-dim">None logged for this exam.</p> : (
          <ul className="divide-y divide-rule text-sm">{mocks.data!.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link className="text-ink hover:text-ridge" to={`/mocks/${m.id}`}>{m.name}</Link>
              <span className="text-dim">{shortDate(m.takenOn)} · score <span className="num text-ink">{m.totalScore}</span> · {m._count.questions} questions logged · {m.analysedAt ? "analysed" : "analysis pending"}</span>
            </li>))}</ul>
        )}
      </Panel>
    </div>
  );
}

function NewMock({ examId, sectionNames, onSaved }: { examId: string; sectionNames: string[]; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", takenOn: new Date().toISOString().slice(0, 10), totalScore: "" });
  // Sections default to the exam's subjects; rename freely (e.g. "QA" for Quant).
  const [sections, setSections] = useState((sectionNames.length ? sectionNames : [""]).map((name) =>
    ({ name, score: "", attempted: "", correct: "", incorrect: "" })));
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setErr(null);
    try {
      await api.post("/mocks", { examId, name: f.name, takenOn: f.takenOn, totalScore: Number(f.totalScore),
        sections: sections.filter((s) => s.name && s.score !== "").map((s) => ({ name: s.name, score: Number(s.score),
          attempted: Number(s.attempted || 0), correct: Number(s.correct || 0), incorrect: Number(s.incorrect || 0),
          skipped: 0 })) });
      onSaved();
    } catch (x) { setErr(x instanceof ApiError ? x.message : "Could not save"); }
  }
  return (
    <Panel>
      <Heading aside="Section names are free text">Log a mock</Heading>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label><span className="label">Name</span><input className="field" required placeholder="Mock #6" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label><span className="label">Date</span><input className="field" type="date" required value={f.takenOn} onChange={(e) => setF({ ...f, takenOn: e.target.value })} /></label>
          <label><span className="label">Total score</span><input className="field" type="number" step="any" required value={f.totalScore} onChange={(e) => setF({ ...f, totalScore: e.target.value })} /></label>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm">
          <thead><tr className="text-left text-dim">{["Section", "Score", "Attempted", "Correct", "Incorrect"].map((h) => <th key={h} className="pb-1 pr-2 font-normal">{h}</th>)}</tr></thead>
          <tbody>{sections.map((s, i) => (
            <tr key={i}>{(["name", "score", "attempted", "correct", "incorrect"] as const).map((k) => (
              <td key={k} className="pr-2 pb-2"><input className="field" aria-label={`${s.name || "Section"} ${k}`} type={k === "name" ? "text" : "number"} step="any"
                value={s[k]} onChange={(e) => setSections(sections.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))} /></td>))}</tr>))}</tbody>
        </table></div>
        <Button onClick={() => setSections([...sections, { name: "", score: "", attempted: "", correct: "", incorrect: "" }])}>Add section</Button>
        {err && <ErrorNote message={err} />}
        <div><Button variant="primary" type="submit">Save mock</Button></div>
      </form>
    </Panel>
  );
}

interface MockDetail { id: string; name: string; examId: string; takenOn: string; totalScore: number; analysedAt: string | null;
  sections: Array<{ name: string }>;
  questions: Array<{ section: string; number: number; topicId: string | null; attempted: boolean; correct: boolean | null; timeSec: number | null; errorType: string | null; difficulty: string | null }> }
type QRow = { section: string; number: number; topicId: string; outcome: "correct" | "incorrect" | "skipped"; time: string; errorType: string; difficulty: string };

/** Question-level entry. Saving feeds topic accuracy, error types and selection analysis into the planner. */
export function MockDetailPage() {
  const { id } = useParams();
  const mock = useApi<MockDetail>(`/mocks/${id}`);
  const exams = useApi<Exam[]>("/exams");
  const [rows, setRows] = useState<QRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!mock.data) return;
    setRows(mock.data.questions.map((q) => ({ section: q.section, number: q.number, topicId: q.topicId ?? "",
      outcome: !q.attempted ? "skipped" : q.correct ? "correct" : "incorrect", time: q.timeSec ? String(q.timeSec) : "",
      errorType: q.errorType ?? "", difficulty: q.difficulty ?? "" })));
  }, [mock.data]);
  if (!mock.data) return mock.error ? <ErrorNote message={mock.error.message} /> : <Loading />;
  const m = mock.data;
  const topics = (exams.data ?? []).find((e) => e.id === m.examId)?.subjects.flatMap((s) => s.topics.map((t) => ({ id: t.id, label: `${s.name} · ${t.name}` }))) ?? [];
  const sectionNames = m.sections.map((s) => s.name);
  const addRow = () => {
    const section = rows.at(-1)?.section ?? sectionNames[0] ?? "Section";
    const number = Math.max(0, ...rows.filter((r) => r.section === section).map((r) => r.number)) + 1;
    setRows([...rows, { section, number, topicId: rows.at(-1)?.topicId ?? "", outcome: "correct", time: "", errorType: "", difficulty: "" }]);
  };
  const upd = (i: number, p: Partial<QRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));

  async function save() {
    setErr(null); setMsg(null);
    try {
      await api.post(`/mocks/${m.id}/questions`, { questions: rows.map((r) => ({
        section: r.section, number: r.number, topicId: r.topicId || null, attempted: r.outcome !== "skipped",
        correct: r.outcome === "skipped" ? null : r.outcome === "correct", timeSec: r.time ? Number(r.time) : undefined,
        errorType: r.outcome === "incorrect" && r.errorType ? r.errorType : null, difficulty: r.difficulty || null })) });
      setMsg(`Saved ${rows.length} questions. Future plans will use them.`);
    } catch (x) { setErr(x instanceof ApiError ? x.message : "Could not save"); }
  }

  return (
    <div className="space-y-6">
      <header><Link className="text-sm text-dim hover:text-ink" to="/mocks">Mocks</Link>
        <h1 className="font-display text-3xl font-semibold">{m.name}</h1><p className="text-sm text-dim">{shortDate(m.takenOn)} · score {m.totalScore}</p></header>
      <Panel>
        <Heading aside="Tag wrong answers with an error type">Questions</Heading>
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-sm">
          <thead><tr className="text-left text-dim">{["Section", "No.", "Topic", "Outcome", "Time (s)", "Error type", "Difficulty"].map((h) => <th key={h} className="pb-1 pr-2 font-normal">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={`${r.section}-${i}`}>
              <td className="pb-2 pr-2"><input className="field w-24" aria-label="Section" value={r.section} onChange={(e) => upd(i, { section: e.target.value })} /></td>
              <td className="pb-2 pr-2"><input className="field w-16" aria-label="Question number" type="number" min={1} value={r.number} onChange={(e) => upd(i, { number: Number(e.target.value) })} /></td>
              <td className="pb-2 pr-2"><select className="field" aria-label="Topic" value={r.topicId} onChange={(e) => upd(i, { topicId: e.target.value })}>
                <option value="">Untagged</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></td>
              <td className="pb-2 pr-2"><select className="field" aria-label="Outcome" value={r.outcome} onChange={(e) => upd(i, { outcome: e.target.value as QRow["outcome"] })}>
                <option value="correct">Correct</option><option value="incorrect">Incorrect</option><option value="skipped">Skipped</option></select></td>
              <td className="pb-2 pr-2"><input className="field w-20" aria-label="Time in seconds" type="number" min={0} value={r.time} onChange={(e) => upd(i, { time: e.target.value })} /></td>
              <td className="pb-2 pr-2"><select className="field" aria-label="Error type" disabled={r.outcome !== "incorrect"} value={r.errorType} onChange={(e) => upd(i, { errorType: e.target.value })}>
                <option value="">—</option>{ERROR_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}</select></td>
              <td className="pb-2 pr-2"><select className="field" aria-label="Difficulty" value={r.difficulty} onChange={(e) => upd(i, { difficulty: e.target.value })}>
                <option value="">—</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></td>
            </tr>))}</tbody>
        </table></div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={addRow}>Add question</Button>
          <Button variant="primary" disabled={!rows.length} onClick={() => void save()}>Save questions</Button>
          {!m.analysedAt && <Button onClick={() => void api.post(`/mocks/${m.id}/analysed`).then(() => mock.reload())}>Mark analysis done</Button>}
        </div>
        {msg && <p className="mt-3 text-sm text-rise" role="status">{msg}</p>}
        {err && <div className="mt-3"><ErrorNote message={err} /></div>}
      </Panel>
    </div>
  );
}
