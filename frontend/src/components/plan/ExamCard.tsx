import type { ExamProgress } from "../../api/types";
import { Bar } from "../ui/primitives";

const DIMENSIONS: Array<[keyof ExamProgress["metrics"], string]> = [
  ["coverage", "Syllabus"], ["mastery", "Mastery"], ["performance", "Performance"], ["consistency", "Consistency"],
];

/** Four separate dimensions; there is deliberately no single "progress %". */
export function ExamCard({ exam }: { exam: ExamProgress }) {
  const passed = exam.daysLeft < 0;
  return (
    <article className="panel p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="font-display text-xl font-semibold">{exam.name}</h3>
        <p className="num text-sm text-dim">{passed ? "Exam date has passed" : exam.daysLeft === 0 ? "Today" : `${exam.daysLeft} days`}</p>
      </div>
      <div className="space-y-3">
        {DIMENSIONS.map(([k, label]) => {
          const m = exam.metrics[k];
          return <Bar key={k} label={label} value={m.value} hint={`${m.formula}. ${m.sample}.`} emptyText={m.sample} />;
        })}
      </div>
      {exam.subjects.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer text-dim">Coverage by subject</summary>
          <div className="mt-3 space-y-2">{exam.subjects.map((s) => <Bar key={s.id} label={s.name} value={s.coverage} />)}</div>
        </details>
      )}
    </article>
  );
}
