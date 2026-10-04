import { Link } from "react-router-dom";
import type { Dashboard } from "../api/types";
import { useApi } from "../hooks/useApi";
import { clock, hm, longDate, pct, titleCase } from "../lib/format";
import { Bar, Empty, ErrorNote, Heading, Loading, Panel, PriorityBadge, Stat, Trend } from "../components/ui/primitives";
import { ExamCard } from "../components/plan/ExamCard";

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"; };

export function DashboardPage() {
  const { data, error, loading } = useApi<Dashboard>("/dashboard");
  if (loading && !data) return <Loading />;
  if (error) return <ErrorNote message={error.message} />;
  if (!data) return null;
  const { time, plan, checkin } = data;
  const items = plan?.items ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-dim">{longDate(data.date)}</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{greeting()}, {data.name.split(" ")[0]}</h1>
      </header>

      <Panel>
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Free today" value={hm(time.freeMin)} sub={time.freeMin === null ? "Generate a plan to calculate" : "after fixed blocks"} />
          <Stat label="Classes" value={hm(time.classesMin)} />
          <Stat label="Rehab" value={hm(time.rehabMin)} />
          <Stat label="Rejuvenation" value={hm(time.rejuvenationTargetMin)} sub="protected minimum" />
          <Stat label="Study target" value={hm(time.studyTargetMin)} />
          <Stat label="Studied" value={hm(time.completedStudyMin)} sub={time.studyTargetMin ? pct(time.completedStudyMin / time.studyTargetMin) + " of target" : undefined} />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel>
          <Heading aside={<Link className="text-ridge hover:underline" to="/today">Open today</Link>}>Today's plan</Heading>
          {!plan ? (
            <Empty title="No plan yet."><Link className="text-ridge hover:underline" to="/today">Check in and generate today's plan</Link></Empty>
          ) : (
            <ol className="divide-y divide-rule">
              {items.map((i) => (
                <li key={i.id} className="py-3">
                  <details>
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="num w-12 text-sm text-dim">{clock(i.startMin)}</span>
                      <span className={`min-w-0 flex-1 ${i.status === "completed" ? "text-dim line-through" : ""}`}>{i.title}</span>
                      <span className="num text-sm text-dim">{hm(i.plannedMin)}</span>
                      <PriorityBadge priority={i.priority} />
                    </summary>
                    <ul className="mt-2 list-disc space-y-1 pl-20 text-sm text-ink/85">{i.reasons.slice(0, 4).map((r) => <li key={r}>{r}</li>)}</ul>
                  </details>
                </li>
              ))}
            </ol>
          )}
        </Panel>

        <Panel>
          <Heading aside={<Link className="text-ridge hover:underline" to="/wellness">Check in</Link>}>Readiness</Heading>
          {!checkin ? <Empty title="No check-in today.">Plans assume moderate readiness until you check in.</Empty> : (
            <>
              <Bar label="Today's readiness" value={checkin.readiness} />
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div><dt className="text-dim">Sleep</dt><dd className="num">{checkin.sleepHours === null ? "—" : hm(Math.round(checkin.sleepHours * 60))}</dd></div>
                <div><dt className="text-dim">Energy</dt><dd className="num">{checkin.energy ?? "—"}/10</dd></div>
                <div><dt className="text-dim">Stress</dt><dd className="num">{checkin.stress ?? "—"}/10</dd></div>
              </dl>
            </>
          )}
        </Panel>
      </div>

      <section aria-labelledby="exams-h">
        <h2 id="exams-h" className="mb-3 font-display text-lg font-semibold">Exam trajectory</h2>
        {data.exams.length === 0 ? <Empty title="No exams yet."><Link className="text-ridge" to="/syllabus">Add an exam</Link></Empty> : (
          <div className="grid gap-4 md:grid-cols-2">{data.exams.map((e) => <ExamCard key={e.id} exam={e} />)}</div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <Heading aside="Weakest first">Topic health</Heading>
          {data.topicHealth === null ? <ErrorNote message="Analytics service unavailable; topic health will return when it is running." /> :
            data.topicHealth.length === 0 ? <Empty title="Not enough data yet.">Topics appear here after 5 or more logged questions. Log a mock or a practice set.</Empty> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-dim"><th className="pb-2 font-normal">Topic</th><th className="pb-2 font-normal">Accuracy</th><th className="pb-2 font-normal">Trend</th><th className="pb-2 font-normal">Last practised</th></tr></thead>
                <tbody>{data.topicHealth.map((t) => (
                  <tr key={t.topic_id} className="border-t border-rule">
                    <td className="py-2">{t.name}</td><td className="num py-2">{pct(t.accuracy)} <span className="text-dim">({t.correct + t.incorrect})</span></td>
                    <td className="py-2"><Trend trend={t.trend} /></td><td className="py-2 text-dim">{t.last_practiced ?? "—"}</td>
                  </tr>))}</tbody>
              </table>
            )}
        </Panel>
        <div className="space-y-6">
          <Panel>
            <Heading aside={<Link className="text-ridge hover:underline" to="/rehab">Log</Link>}>Rehab today</Heading>
            {data.rehab.length === 0 ? <Empty title="No rehab programme set." /> : (
              <ul className="space-y-2 text-sm">{data.rehab.map((r) => (
                <li key={r.id} className="flex justify-between"><span>{r.name} · {hm(r.dailyMin)}</span>
                  <span className={r.today === "completed" ? "text-rise" : r.today ? "text-caution" : "text-dim"}>{r.today ? titleCase(r.today) : "Not logged"}</span></li>))}</ul>
            )}
          </Panel>
          <Panel>
            <Heading>This week</Heading>
            <Bar label={`${hm(data.week.completedMin)} of ${hm(data.week.plannedMin)} planned`}
              value={data.week.plannedMin ? Math.min(1, data.week.completedMin / data.week.plannedMin) : null} emptyText="No plans this week yet" />
          </Panel>
        </div>
      </div>
    </div>
  );
}
