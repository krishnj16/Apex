import type { FixedBlock, PlanItem } from "../../api/types";
import { clock, hm } from "../../lib/format";

/**
 * The day at a glance: one strip from day start to day end. Study blocks are the accent;
 * classes and rehab are fixed; the gaps are protected rejuvenation and breaks.
 */
export function DayStrip({ items, fixed, dayStart = 420, dayEnd = 1380 }: { items: PlanItem[]; fixed: FixedBlock[]; dayStart?: number; dayEnd?: number }) {
  const span = dayEnd - dayStart;
  const x = (m: number) => `${((Math.max(dayStart, Math.min(dayEnd, m)) - dayStart) / span) * 100}%`;
  const w = (a: number, b: number) => `${((Math.min(dayEnd, b) - Math.max(dayStart, a)) / span) * 100}%`;
  const hours = [];
  for (let h = Math.ceil(dayStart / 60); h * 60 <= dayEnd; h += 2) hours.push(h * 60);
  const nonPinnedFixed = fixed.filter((f) => f.kind !== "pinned_study");

  return (
    <figure aria-label="Today's timeline">
      <div className="relative h-14 overflow-hidden rounded-md border border-rule bg-ground">
        {nonPinnedFixed.map((f) => (
          <div key={`${f.kind}-${f.start}`} title={`${f.label ?? f.kind} ${clock(f.start)}–${clock(f.end)}`}
            className={`absolute inset-y-0 border-x border-ground ${f.kind === "rehab" ? "bg-caution/25" : "bg-rule"}`}
            style={{ left: x(f.start), width: w(f.start, f.end) }} />
        ))}
        {items.map((i) => (
          <div key={i.id} title={`${i.title} ${clock(i.startMin)}–${clock(i.endMin)}`}
            className={`absolute inset-y-2 rounded-sm ${i.status === "skipped" ? "bg-fall/40" : i.status === "completed" || i.status === "partial" ? "bg-rise/70" : "bg-ridge"}`}
            style={{ left: x(i.startMin), width: w(i.startMin, i.endMin) }} />
        ))}
      </div>
      <div className="relative mt-1 h-4 text-xs text-dim" aria-hidden>
        {hours.map((m) => <span key={m} className="num absolute -translate-x-1/2" style={{ left: x(m) }}>{clock(m)}</span>)}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
        <Key className="bg-ridge" label="Study" /> <Key className="bg-rise/70" label="Done" />
        <Key className="bg-rule" label="Class / commitment" /> <Key className="bg-caution/25" label="Rehab" />
        <Key className="border border-rule bg-ground" label="Free: rejuvenation and breaks" />
        <span className="sr-only">
          {items.map((i) => `${clock(i.startMin)} ${i.title}, ${hm(i.plannedMin)}. `).join("")}
        </span>
      </figcaption>
    </figure>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`inline-block h-2.5 w-4 rounded-sm ${className}`} />{label}</span>;
}
