import { useApi } from "../hooks/useApi";
import { hm, longDate } from "../lib/format";
import { Empty, ErrorNote, Loading, Panel } from "../components/ui/primitives";

interface CalDay { date: string; events: Array<{ kind: string; title: string; start: number; end: number; status?: string }> }
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function HistoryPage() {
  const to = new Date(); to.setDate(to.getDate() - 1);
  const from = new Date(); from.setDate(from.getDate() - 28);
  const { data, error, loading } = useApi<CalDay[]>(`/calendar?from=${ymd(from)}&to=${ymd(to)}`);
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error.message} />;
  const days = (data ?? []).filter((d) => d.events.some((e) => e.kind === "study")).reverse();

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-semibold">History</h1>
      <p className="text-sm text-dim">The last four weeks of plans and what happened to each task.</p>
      {days.length === 0 && <Empty title="No history yet.">Completed and skipped tasks will appear here.</Empty>}
      {days.map((d) => {
        const study = d.events.filter((e) => e.kind === "study");
        const planned = study.reduce((a, e) => a + e.end - e.start, 0);
        return (
          <Panel key={d.date}>
            <div className="mb-2 flex justify-between text-sm"><span className="font-medium">{longDate(d.date)}</span>
              <span className="num text-dim">{study.filter((e) => e.status === "completed").length}/{study.length} done · {hm(planned)} planned</span></div>
            <ul className="space-y-1 text-sm">{study.map((e, i) => (
              <li key={i} className="flex justify-between gap-3"><span>{e.title}</span>
                <span className={e.status === "completed" ? "text-rise" : e.status === "skipped" ? "text-fall" : e.status === "partial" ? "text-caution" : "text-dim"}>
                  {e.status === "planned" ? "Not marked" : e.status}</span></li>))}</ul>
          </Panel>
        );
      })}
    </div>
  );
}
