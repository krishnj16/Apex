import { useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import { useApi } from "../hooks/useApi";
import { clock, hm, parseClock, shortDate } from "../lib/format";
import { Button, ErrorNote, Loading, Panel } from "../components/ui/primitives";
import { AddTaskForm, type TopicOption } from "../components/plan/AddTaskForm";

interface CalEvent { kind: string; id?: string; title: string; start: number; end: number; status?: string; priority?: string;
  source?: "class" | "commitment" | "rehab"; refId?: string; programId?: string; overridden?: boolean; cancelled?: boolean }
interface CalDay { date: string; events: CalEvent[]; mocks: Array<{ id: string; name: string }> }
type View = "day" | "week" | "month";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const add = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const monday = (s: string) => add(s, -((new Date(`${s}T00:00:00Z`).getUTCDay() + 6) % 7));
const KIND_STYLE: Record<string, string> = {
  study: "border-l-ridge", class: "border-l-dim", rehab: "border-l-caution", commitment: "border-l-dim", pinned_study: "border-l-ridge",
};
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function CalendarPage() {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(localToday());
  const range = useMemo(() => {
    if (view === "day") return [anchor, anchor];
    if (view === "week") return [monday(anchor), add(monday(anchor), 6)];
    const first = `${anchor.slice(0, 8)}01`;
    return [monday(first), add(monday(first), 41)];
  }, [view, anchor]);
  const { data, error, loading, reload } = useApi<CalDay[]>(`/calendar?from=${range[0]}&to=${range[1]}`);
  const topics = useApi<TopicOption[]>("/topics");
  const step = view === "day" ? 1 : view === "week" ? 7 : 30;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">Calendar</h1>
        <div className="flex flex-wrap gap-2">
          <div role="group" aria-label="View" className="flex gap-1">
            {(["day", "week", "month"] as const).map((v) => <Button key={v} variant={view === v ? "primary" : "quiet"} onClick={() => setView(v)} aria-pressed={view === v}>{v[0]!.toUpperCase() + v.slice(1)}</Button>)}
          </div>
          <Button onClick={() => setAnchor(add(anchor, -step))} aria-label="Previous">‹</Button>
          <Button onClick={() => setAnchor(localToday())}>Today</Button>
          <Button onClick={() => setAnchor(add(anchor, step))} aria-label="Next">›</Button>
        </div>
      </header>
      {error && <ErrorNote message={error.message} />}
      {loading && !data && <Loading />}
      {data && view === "day" && data[0] && <DayView day={data[0]} today={localToday()} topics={topics.data ?? []} onMoved={reload} />}
      {data && view === "week" && (
        <div className="grid gap-3 md:grid-cols-7">
          {data.map((d) => (
            <Panel key={d.date} as="div" className={`!p-3 ${d.date === localToday() ? "border-ridge/50" : ""}`}>
              <button className="mb-2 text-sm font-medium hover:text-ridge" onClick={() => { setAnchor(d.date); setView("day"); }}>{shortDate(d.date)}</button>
              {d.mocks.map((m) => <p key={m.id} className="mb-1 text-xs text-caution">{m.name}</p>)}
              <ul className="space-y-1">{d.events.map((e, i) => (
                <li key={i} className={`border-l-2 pl-2 text-xs ${KIND_STYLE[e.kind] ?? "border-l-rule"} ${e.status === "skipped" || e.cancelled ? "text-fall line-through" : e.status === "completed" ? "text-dim" : ""}`}>
                  <span className="num text-dim">{clock(e.start)}</span> {e.title}
                </li>))}</ul>
            </Panel>
          ))}
        </div>
      )}
      {data && view === "month" && (
        <div className="grid grid-cols-7 gap-1 text-xs">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="p-1 text-dim">{d}</div>)}
          {data.map((d) => {
            const study = d.events.filter((e) => e.kind === "study");
            const done = study.filter((e) => e.status === "completed" || e.status === "partial").reduce((a, e) => a + e.end - e.start, 0);
            const planned = study.reduce((a, e) => a + e.end - e.start, 0);
            return (
              <button key={d.date} onClick={() => { setAnchor(d.date); setView("day"); }}
                className={`min-h-16 rounded border p-1 text-left ${d.date.slice(0, 7) === anchor.slice(0, 7) ? "border-rule" : "border-transparent text-dim"} ${d.date === localToday() ? "border-ridge/60" : ""}`}>
                <span className="num">{Number(d.date.slice(8))}</span>
                {planned > 0 && <span className="num block text-dim">{hm(done)} / {hm(planned)}</span>}
                {d.mocks.length > 0 && <span className="block text-caution">Mock</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Day view. Build the day yourself: click any block to change or remove it for this date only,
 * drag study blocks to a new time, and add your own tasks. Nothing is re-planned behind your back;
 * use "Re-plan the rest of today" on the Today page if you want suggestions rebuilt.
 */
function DayView({ day, today, topics, onMoved }: { day: CalDay; today: string; topics: TopicOption[]; onMoved: () => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [editing, setEditing] = useState<CalEvent | null>(null);
  const canPlan = day.date >= today;
  const slots: number[] = [];
  for (let m = 6 * 60; m < 24 * 60; m += 30) slots.push(m);
  const at = (m: number) => day.events.filter((e) => e.start >= m && e.start < m + 30);

  async function change(fn: () => Promise<unknown>, hint?: string) {
    setErr(null); setNote(null);
    try { await fn(); setEditing(null); if (hint) setNote(hint); onMoved(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Could not save the change"); }
  }
  const drop = (slot: number, id: string) => { setOver(null); void change(() => api.patch(`/tasks/${id}`, { startMin: slot })); };

  return (
    <div className="space-y-4">
      <Panel>
        {err && <ErrorNote message={err} />}
        {note && <p className="mb-3 text-sm text-rise" role="status">{note}</p>}
        <p className="mb-3 text-sm text-dim">
          {canPlan ? "Click any block to edit or remove it for this day. Drag study blocks to move them." : "Past day: view only."}
        </p>
        <ol>
          {slots.map((s) => (
            <li key={s} className={`flex min-h-9 gap-3 border-t border-rule/60 py-1 ${over === s ? "bg-ridge/10" : ""}`}
              onDragOver={(e) => { if (canPlan) { e.preventDefault(); setOver(s); } }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { const id = e.dataTransfer.getData("text/plain"); if (id) drop(s, id); }}>
              <span className="num w-12 shrink-0 text-xs text-dim">{clock(s)}</span>
              <div className="flex flex-1 flex-wrap gap-2">
                {at(s).map((e, i) => {
                  const study = e.kind === "study" && !!e.id;
                  const clickable = canPlan && (study || !!e.source);
                  const draggable = canPlan && study && e.status === "planned";
                  const cls = `rounded border-l-2 bg-panel px-2 py-1 text-left text-sm ${KIND_STYLE[e.kind] ?? "border-l-rule"} ${draggable ? "cursor-grab" : ""} ${clickable ? "cursor-pointer hover:bg-rule/40" : ""} ${e.status === "completed" || e.cancelled ? "opacity-60" : ""} ${e.cancelled ? "line-through" : ""}`;
                  return (
                    <div key={i} className={cls} draggable={draggable} role={clickable ? "button" : undefined} tabIndex={clickable ? 0 : undefined}
                      onClick={() => clickable && setEditing(e)} onKeyDown={(ev) => { if (clickable && ev.key === "Enter") setEditing(e); }}
                      onDragStart={(ev) => e.id && ev.dataTransfer.setData("text/plain", e.id)}>
                      {e.title} <span className="num text-dim">{clock(e.start)}–{clock(e.end)}</span>
                      {e.overridden && <span className="ml-1 text-xs text-caution">changed today</span>}
                      {e.cancelled && <span className="ml-1 text-xs text-caution no-underline">cancelled today</span>}
                      {e.status && e.status !== "planned" && <span className="ml-1 text-xs text-dim">{e.status}</span>}
                    </div>
                  );
                })}
              </div>
            </li>))}
        </ol>
      </Panel>

      {editing && <BlockEditor day={day.date} block={editing} onClose={() => setEditing(null)} change={change} />}
      {canPlan && (
        <>
          <Panel>
            <h3 className="mb-3 font-medium">Add your own task on {shortDate(day.date)}</h3>
            <AddTaskForm date={day.date} topics={topics} onAdded={() => { setNote("Task added."); onMoved(); }} />
          </Panel>
          <AddCommitment day={day.date} change={change} />
        </>
      )}
    </div>
  );
}

function BlockEditor({ day, block, onClose, change }: {
  day: string; block: CalEvent; onClose: () => void; change: (fn: () => Promise<unknown>, hint?: string) => Promise<void>;
}) {
  const [start, setStart] = useState(clock(block.start));
  const [minutes, setMinutes] = useState(block.end - block.start);
  const rehab = block.source === "rehab";

  if (block.kind === "study") {
    const worked = block.status !== "planned";
    return (
      <Panel>
        <h3 className="mb-3 font-medium">{block.title}</h3>
        {worked ? <p className="text-sm text-dim">This task is {block.status}, so it can't be changed here.</p> : (
          <div className="flex flex-wrap items-end gap-3">
            <label><span className="label">Move to</span><input className="field w-32" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <Button variant="primary" onClick={() => void change(() => api.patch(`/tasks/${block.id}`, { startMin: parseClock(start) }))}>Move</Button>
            <Button variant="danger" onClick={() => void change(() => api.del(`/tasks/${block.id}`), "Removed. It won't be suggested again today.")}>Remove from this day</Button>
            <Button onClick={onClose}>Close</Button>
          </div>
        )}
        {worked && <div className="mt-3"><Button onClick={onClose}>Close</Button></div>}
      </Panel>
    );
  }

  if (block.source === "class") {
    return (
      <Panel>
        <h3 className="mb-3 font-medium">{block.title} on {shortDate(day)}</h3>
        <div className="flex flex-wrap gap-2">
          {block.cancelled
            ? <Button variant="primary" onClick={() => void change(() => api.del(`/classes/${block.refId}/cancel/${day}`), "Class restored for this day.")}>Restore this class</Button>
            : <Button variant="danger" onClick={() => void change(() => api.put(`/classes/${block.refId}/cancel`, { date: day }), "Class cancelled for this day only. Use Re-plan on the Today page to use the free time.")}>Cancel for this day only</Button>}
          <Button onClick={onClose}>Close</Button>
        </div>
        <p className="mt-2 text-xs text-dim">Only {shortDate(day)} changes. The class returns on its other days. To change the timetable itself, use Settings.</p>
      </Panel>
    );
  }

  return (
    <Panel>
      <h3 className="mb-3 font-medium">{block.title} on {shortDate(day)}</h3>
      {rehab ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label><span className="label">Start</span><input className="field w-32" type="time" value={start} onChange={(e) => setStart(e.target.value)} /></label>
            <label><span className="label">Minutes</span><input className="field w-24" type="number" min={5} max={240} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} /></label>
            <Button variant="primary" onClick={() => void change(() => api.put("/rehab/overrides", { programId: block.programId, date: day, startMin: parseClock(start), durationMin: minutes, skip: false }), "Saved for this day only.")}>Save for this day</Button>
            <Button onClick={() => void change(() => api.patch(`/rehab/programs/${block.programId}`, { preferredStartMin: parseClock(start), dailyMin: minutes }), "This is now your usual time.")}>Make this my usual time</Button>
            <Button onClick={() => void change(() => api.put("/rehab/overrides", { programId: block.programId, date: day, skip: true }), "Skipped for this day.")}>Not today</Button>
            {block.overridden && <Button onClick={() => void change(() => api.del(`/rehab/overrides/${block.programId}/${day}`))}>Back to normal schedule</Button>}
            <Button onClick={onClose}>Close</Button>
          </div>
          <p className="mt-2 text-xs text-dim">"Save for this day" changes only {shortDate(day)}. "Make this my usual time" changes every day you do this rehab.</p>
        </>
      ) : (
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => void change(() => api.del(`/commitments/${block.refId}`))}>Remove commitment</Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      )}
    </Panel>
  );
}

function AddCommitment({ day, change }: { day: string; change: (fn: () => Promise<unknown>, hint?: string) => Promise<void> }) {
  const [f, setF] = useState({ title: "", start: "13:00", end: "14:00" });
  return (
    <Panel>
      <h3 className="mb-3 font-medium">Block time on {shortDate(day)} (not study)</h3>
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => {
        e.preventDefault();
        void change(() => api.post("/commitments", { title: f.title, startMin: parseClock(f.start), endMin: parseClock(f.end), weekdays: [], date: day }), "Added.").then(() => setF({ ...f, title: "" }));
      }}>
        <label><span className="label">What</span><input className="field w-56" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Appointment, travel, event" /></label>
        <label><span className="label">From</span><input className="field w-32" type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
        <label><span className="label">To</span><input className="field w-32" type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        <Button variant="primary" type="submit">Add</Button>
      </form>
    </Panel>
  );
}
