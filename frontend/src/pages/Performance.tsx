import type { ExamProgress, TopicReport } from "../api/types";
import { useApi } from "../hooks/useApi";
import { hm, pct, titleCase } from "../lib/format";
import { Empty, ErrorNote, Heading, Loading, Panel, Trend } from "../components/ui/primitives";
import { ExamCard } from "../components/plan/ExamCard";

const GAP_TEXT: Record<string, string> = {
  knowledge: "Knowledge gap", application: "Application gap", execution: "Calculation / careless", speed: "Speed gap",
  selection: "Question selection", none: "No clear gap",
};

export function PerformancePage() {
  const perf = useApi<{ exams: ExamProgress[] }>("/performance");
  const topics = useApi<TopicReport[]>("/performance/topics");
  const prio = useApi<Array<{ title: string; score: number; reasons: string[] }>>("/performance/priorities");
  if (perf.loading && !perf.data) return <Loading />;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Performance</h1>
      {perf.error && <ErrorNote message={perf.error.message} />}
      <div className="grid gap-4 md:grid-cols-2">{perf.data?.exams.map((e) => <ExamCard key={e.id} exam={e} />)}</div>

      <Panel>
        <Heading aside="Coverage ≠ performance">Topics</Heading>
        {topics.error && <ErrorNote message={topics.error.message} />}
        {topics.data?.length === 0 && <Empty title="No topics yet." />}
        {!!topics.data?.length && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="text-left text-dim">{["Topic", "Coverage", "Mastery", "Accuracy", "Speed", "Trend", "Last practised", "Last 14 days", "Diagnosis"].map((h) => <th key={h} className="pb-2 pr-3 font-normal">{h}</th>)}</tr></thead>
              <tbody>{topics.data.map((t) => (
                <tr key={t.topic_id} className="border-t border-rule align-top">
                  <td className="py-2 pr-3">{t.name}</td>
                  <td className="num py-2 pr-3">{pct(t.coverage)}</td>
                  <td className="num py-2 pr-3" title="Estimate: accuracy shrunk toward your self-assessment, blended with coverage">{pct(t.mastery)}</td>
                  <td className="num py-2 pr-3">{t.sufficient ? <>{pct(t.accuracy)} <span className="text-dim">({t.correct + t.incorrect})</span></> : <span className="text-dim">{t.correct + t.incorrect} answered</span>}</td>
                  <td className="num py-2 pr-3" title="Your time ÷ expected time; below 1 is faster">{t.speed_ratio === null ? "—" : `${t.speed_ratio.toFixed(2)}×`}</td>
                  <td className="py-2 pr-3"><Trend trend={t.trend} />{t.trend_from !== null && t.trend_to !== null && <span className="num ml-1 text-dim">{pct(t.trend_from)}→{pct(t.trend_to)}</span>}</td>
                  <td className="py-2 pr-3 text-dim">{t.last_practiced ?? "Never logged"}</td>
                  <td className="num py-2 pr-3">{hm(t.minutes_14d)}</td>
                  <td className="py-2">{t.diagnosis ? <span title={t.diagnosis.reasons.join(" ")}>{GAP_TEXT[t.diagnosis.gap] ?? titleCase(t.diagnosis.gap)}</span> : "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel>
        <Heading aside="Ignoring today's time limits">What matters most right now</Heading>
        {prio.error && <ErrorNote message={prio.error.message} />}
        <ol className="space-y-3 text-sm">
          {prio.data?.map((c, i) => (
            <li key={c.title} className="flex gap-3">
              <span className="num w-6 text-dim">{i + 1}</span>
              <div className="flex-1"><p>{c.title} <span className="num text-dim">· {c.score.toFixed(1)}</span></p><p className="text-dim">{c.reasons[0]}</p></div>
            </li>))}
        </ol>
      </Panel>
    </div>
  );
}
