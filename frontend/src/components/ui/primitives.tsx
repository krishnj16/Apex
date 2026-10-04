import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Panel({ children, className = "", as: Tag = "section" }: { children: ReactNode; className?: string; as?: "section" | "div" | "article" }) {
  return <Tag className={`panel p-5 ${className}`}>{children}</Tag>;
}

export function Heading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{children}</h2>
      {aside && <div className="text-sm text-dim">{aside}</div>}
    </div>
  );
}

type Variant = "primary" | "quiet" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-ridge text-ground hover:bg-[#a3c2dc]",
  quiet: "border border-rule text-ink hover:border-dim",
  danger: "border border-fall/50 text-fall hover:border-fall",
};

export function Button({ variant = "quiet", className = "", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...p}
      className={`inline-flex min-h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

/** A labelled bar. `value` null renders an empty track with the reason, never a fake number. */
export function Bar({ label, value, hint, emptyText = "Not enough data yet" }: { label: string; value: number | null; hint?: string; emptyText?: string }) {
  return (
    <div title={hint}>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-dim">{label}</span>
        <span className="num text-ink">{value === null ? <span className="text-dim">{emptyText}</span> : `${Math.round(value * 100)}%`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-rule" role="progressbar" aria-label={label}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={value === null ? undefined : Math.round(value * 100)}>
        {value !== null && <div className="h-1.5 rounded-full bg-ridge" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />}
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-panel border border-dashed border-rule p-6 text-sm">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mt-1 text-dim">{children}</div>}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <p role="alert" className="rounded-md border border-fall/40 px-3 py-2 text-sm text-fall">{message}</p>;
}

export function Loading() {
  return <p className="text-sm text-dim" aria-live="polite">Loading…</p>;
}

const priorityStyle: Record<string, string> = {
  HIGH: "border-ridge text-ridge", MEDIUM: "border-rule text-ink", LOW: "border-rule text-dim", PINNED: "border-caution/60 text-caution",
};
export function PriorityBadge({ priority }: { priority: string }) {
  const text = { HIGH: "High", MEDIUM: "Medium", LOW: "Low", PINNED: "Placed by you" }[priority] ?? priority;
  return <span className={`rounded border px-1.5 py-0.5 text-xs ${priorityStyle[priority] ?? ""}`}>{text}</span>;
}

export function Trend({ trend }: { trend: string | null }) {
  if (trend === "improving") return <span className="text-rise" aria-label="improving">↑</span>;
  if (trend === "declining") return <span className="text-fall" aria-label="declining">↓</span>;
  if (trend === "flat") return <span className="text-dim" aria-label="flat">→</span>;
  return <span className="text-dim" aria-label="not enough data">·</span>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <p className="text-sm text-dim">{label}</p>
      <p className="num font-display text-2xl font-semibold text-ink">{value}</p>
      {sub && <p className="text-xs text-dim">{sub}</p>}
    </div>
  );
}
