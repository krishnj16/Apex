import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { titleCase } from "../../lib/format";

const AXIS = { stroke: "#8E959E", fontSize: 12 };
const GRID = "#2B3036";
const SERIES = ["#8DB1CF", "#86B79C", "#C9A66B", "#B9A3D1", "#CC7A72"];
const tooltip = { contentStyle: { background: "#1A1D21", border: "1px solid #2B3036", borderRadius: 8, color: "#E6E8EB" } };

export interface TrajectoryPoint {
  name: string; date: string; score: number; accuracy: number | null; avg_time_sec: number | null; attempted: number;
  sections: Record<string, { score: number; accuracy: number | null; attempted: number }>;
}

export function ScoreTrajectory({ points }: { points: TrajectoryPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} stroke={GRID} /><YAxis tick={AXIS} stroke={GRID} />
        <Tooltip {...tooltip} />
        <Line type="monotone" dataKey="score" name="Total score" stroke={SERIES[0]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SectionTrajectory({ points }: { points: TrajectoryPoint[] }) {
  const names = [...new Set(points.flatMap((p) => Object.keys(p.sections)))];
  const rows = points.map((p) => ({ name: p.name, ...Object.fromEntries(names.map((n) => [n, p.sections[n]?.score ?? null])) }));
  if (!names.length) return <p className="text-sm text-dim">Add section scores to see section trajectories.</p>;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={rows} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="name" tick={AXIS} stroke={GRID} /><YAxis tick={AXIS} stroke={GRID} />
        <Tooltip {...tooltip} /><Legend wrapperStyle={{ fontSize: 12 }} />
        {names.map((n, i) => <Line key={n} dataKey={n} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ErrorDistribution({ counts }: { counts: Record<string, number> }) {
  const rows = Object.entries(counts).map(([k, v]) => ({ type: titleCase(k), count: v }));
  if (!rows.length) return <p className="text-sm text-dim">Tag error types on wrong answers to see where marks are lost.</p>;
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, rows.length * 30)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, left: 24, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={AXIS} stroke={GRID} />
        <YAxis type="category" dataKey="type" width={120} tick={AXIS} stroke={GRID} />
        <Tooltip {...tooltip} cursor={{ fill: "#2B303655" }} />
        <Bar dataKey="count" name="Errors" fill={SERIES[0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
