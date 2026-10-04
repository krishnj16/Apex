import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const AXIS = { stroke: "#6B727A", fontSize: 12 };
const GRID = <CartesianGrid stroke="#33383E" strokeDasharray="2 4" vertical={false} />;
const TIP = { contentStyle: { background: "#25292E", border: "1px solid #33383E", borderRadius: 6 }, labelStyle: { color: "#9AA1A9" } };
const SERIES = ["#9CC3E6", "#B9A6D6", "#86B79C", "#D9B77E"];

export function TrajectoryChart({ data, keys, percent = false }: { data: Array<Record<string, unknown>>; keys: string[]; percent?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        {GRID}
        <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={false} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={percent ? (v: number) => `${Math.round(v * 100)}%` : undefined} />
        <Tooltip {...TIP} formatter={(v: number) => (percent ? `${Math.round(v * 100)}%` : v)} />
        {keys.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {keys.map((k, i) => <Line key={k} dataKey={k} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function HBarChart({ data, percent = false }: { data: Array<{ name: string; value: number }>; percent?: boolean }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 30)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" hide domain={percent ? [0, 1] : undefined} />
        <YAxis type="category" dataKey="name" width={150} tick={AXIS} tickLine={false} axisLine={false} />
        <Tooltip {...TIP} formatter={(v: number) => (percent ? `${Math.round(v * 100)}%` : v)} cursor={{ fill: "#25292E" }} />
        <Bar dataKey="value" fill="#9CC3E6" radius={[0, 3, 3, 0]} barSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}
