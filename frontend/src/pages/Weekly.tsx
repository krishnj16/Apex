import { useApi } from "../hooks/useApi";
import { Empty, ErrorNote, Panel, Stat } from "../components/ui/primitives";
import { hm, pct } from "../lib/format";

interface Review { weekStart: string; data: {
  study: { planned_min: number; completed_min: number; completion_rate: number | null; tasks: number };
  sessions: Record<string, Record<string, number>>; topic_changes: Array<{ topic: string; from: number; to: number }>;
  biggest_improvement: string; biggest_problem: string; rehab: Record<string, { completed: number; partial: number; days: number }>;
  next_week_focus: Array<{ title: string; score: number; why: string[] }> } }

export default function Weekly() {
  const { data, error, loading } = useApi<Review>("/weekly-review");
  if (error) return <ErrorNote message={error.message} />;
  if (loading || !data) return <p className="text-muted">Building your review from last week's data…</p>;
  const r = data.data;
  return (
    <div className="space-y-6">
      <header><p className="text-muted">Week of {data.weekStart.slice(0, 10)}</p><h1 className="display text-3xl">Weekly review</h1></header>
      {r.study.tasks === 0 ? <Empty title="No planned work last week">Generate daily plans and mark tasks to get a review.</Empty> : (
        <Panel><div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <Stat label="Study done" value={hm(r.study.completed_min)} sub={`of ${hm(r.study.planned_min)} planned`} />
          <Stat label="Tasks completed" value={pct(r.study.completion_rate)} sub={`${r.study.tasks} tasks`} />
          {Object.entries(r.rehab).map(([p, x]) => <Stat key={p} label={`${p} rehab`} value={`${x.completed}/${x.days}`} sub={x.partial ? `${x.partial} partial` : undefined} />)}
        </div></Panel>)}
      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Biggest improvement"><p>{r.biggest_improvement}</p></Panel>
        <Panel title="Biggest problem"><p>{r.biggest_problem}</p></Panel>
      </div>
      <Panel title="Sessions by subject">
        {Object.keys(r.sessions).length ? Object.entries(r.sessions).map(([exam, subs]) => (
          <div key={exam} className="mb-3"><h3 className="text-sm text-muted">{exam}</h3>
            <p>{Object.entries(subs).map(([s, n]) => `${s} ${n}`).join(", ")}</p></div>)) : <p className="text-muted">No sessions completed.</p>}
      </Panel>
      <Panel title="Next week's focus">
        <ol className="list-decimal space-y-3 pl-5">{r.next_week_focus.map((f) => (
          <li key={f.title}><p className="font-medium">{f.title}</p><p className="text-sm text-muted">{f.why.join(" ")}</p></li>))}</ol>
      </Panel>
    </div>
  );
}
