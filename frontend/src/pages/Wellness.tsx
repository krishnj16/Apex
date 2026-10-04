import type { CheckIn } from "../api/types";
import { useApi } from "../hooks/useApi";
import { Bar, Heading, Loading, Panel } from "../components/ui/primitives";
import { CheckInForm } from "../components/plan/CheckInForm";

const LABEL: Record<string, string> = { sleep_hours: "Sleep", sleep_quality: "Sleep quality", energy: "Energy", stress: "Stress (inverted)", mental_fatigue: "Mental fatigue (inverted)" };

export function WellnessPage() {
  const { data, loading, reload } = useApi<CheckIn | null>("/checkins/today");
  if (loading && data === null) return <Loading />;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">Wellness</h1>
      <p className="max-w-prose text-sm text-dim">
        Readiness is a weighted average of the fields you fill in. It changes the type and intensity of planned work
        (lighter formats, shorter blocks when low); it is not a health assessment.
      </p>
      {data?.readiness !== undefined && data?.readiness !== null && (
        <Panel>
          <Heading>Today's readiness</Heading>
          <Bar label="Readiness" value={data.readiness} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {Object.entries(data.readinessDetail?.components ?? {}).map(([k, v]) => <Bar key={k} label={LABEL[k] ?? k} value={v} />)}
          </div>
          <ul className="mt-3 space-y-1 text-sm text-ink/90">{data.readinessDetail?.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </Panel>
      )}
      <Panel>
        <Heading>{data ? "Update today's check-in" : "Today's check-in"}</Heading>
        <CheckInForm initial={data} onSaved={() => void reload()} />
      </Panel>
    </div>
  );
}
