export const hm = (min: number | null | undefined): string => {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
};
export const clock = (minOfDay: number): string =>
  `${String(Math.floor(minOfDay / 60)).padStart(2, "0")}:${String(minOfDay % 60).padStart(2, "0")}`;
export const parseClock = (v: string): number => {
  const [h, m] = v.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const pct = (x: number | null | undefined, digits = 0): string =>
  x === null || x === undefined ? "—" : `${(x * 100).toFixed(digits)}%`;
export const longDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
export const shortDate = (iso: string): string =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
export const titleCase = (s: string): string => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
