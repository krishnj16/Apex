import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { hm, pct, shortDate } from "../lib/format";
import { Bar, Button, Empty, ErrorNote, Heading, Loading, Panel } from "../components/ui/primitives";

interface Review {
  week_start: string;
  study: { planned_min: number; completed_min: number; completion_rate: number | null; tasks: number };
  sessions: Record<string, Record<string, number>>;
  topic_changes: Array<{ topic: string; from: number; to: number }>;
  biggest_improvement: string; biggest_problem: string;
  rehab: Record<string, { completed: number; partial: number; days: number }>;
  next_week_focus: Array<{ title: string; score: number; why: string[] }>;
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function ReviewPage() {
  const [offset, setOffset] = useState(0);
  const d = new Date(); d.setDate(d.getDate() - 7 * offset);
  const { data, error, loading } = useApi<Review>(`/weekly-review?week=${ymd(d)}`);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-3xl font-semibold">Weekly review</h1>
          {data && <p className="text-sm text-dim">Week of {shortDate(data.week_start)}{offset === 0 && " (in progress)"}</p>}</div>
        <div className="flex gap-2"><Button onClick={() => setOffset(offset + 1)}>Previous week</Button>
          <Button disabled={offset === 0} onClick={() => setOffset(offset - 1)}>Next week</Button></div>
      </header>
      {error && <ErrorNote message={error.message} />}
      {loading && !data && <Loading />}
      {data && (data.study.tasks === 0 ? <Empty title="No planned tasks this week." >The review is built from your plans, logged questions and rehab sessions.</Empty> : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            <Panel>
              <Heading>Study</Heading>
              <p className="num font-display text-3xl">{hm(data.study.completed_min)} <span className="text-lg text-dim">of {hm(data.study.planned_min)}</span></p>
              <div className="mt-3"><Bar label="Tasks fully completed" value={data.study.completion_rate} /></div>
              <dl className="mt-4 space-y-2 text-sm">{Object.entries(data.sessions).map(([exam, subs]) => (
                <div key={exam}><dt className="text-dim">{exam}</dt><dd>{Object.entries(subs).map(([s, n]) => `${s} ${n} session${n === 1 ? "" : "s"}`).join(", ")}</dd></div>))}</dl>
            </Panel>
            <Panel>
              <Heading>Rehabilitation</Heading>
              <ul className="space-y-2 text-sm">{Object.entries(data.rehab).map(([p, r]) => (
                <li key={p} className="flex justify-between"><span>{p}</span><span className="num">{r.completed}/{r.days} completed{r.partial ? `, ${r.partial} partial` : ""}</span></li>))}</ul>
            </Panel>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Panel><Heading>Biggest improvement</Heading><p className="text-sm">{data.biggest_improvement}</p></Panel>
            <Panel><Heading>Biggest problem</Heading><p className="text-sm">{data.biggest_problem}</p></Panel>
          </div>
          {data.topic_changes.length > 0 && (
            <Panel><Heading aside="Topics with 5+ questions in both weeks">Accuracy versus the week before</Heading>
              <ul className="space-y-1 text-sm">{data.topic_changes.map((c) => (
                <li key={c.topic} className="flex justify-between"><span>{c.topic}</span>
                  <span className={`num ${c.to > c.from ? "text-rise" : c.to < c.from ? "text-fall" : "text-dim"}`}>{pct(c.from)} → {pct(c.to)}</span></li>))}</ul>
            </Panel>
          )}
          {data.next_week_focus.length > 0 && (
            <Panel><Heading aside="From the planner's current ranking">Next week's focus</Heading>
              <ol className="list-decimal space-y-2 pl-5 text-sm">{data.next_week_focus.map((f) => (
                <li key={f.title}>{f.title}<p className="text-dim">{f.why[0]}</p></li>))}</ol>
            </Panel>
          )}
        </>
      ))}
    </div>
  );
}
