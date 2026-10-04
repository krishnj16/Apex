import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import type { Exam } from "../api/types";
import { useAuth } from "../lib/auth";
import { useApi } from "../hooks/useApi";
import { Button, ErrorNote, Heading, Panel } from "../components/ui/primitives";
import { PreferencesForm } from "./Settings";

const STATUSES: Array<[string, string]> = [["not_started", "Not started"], ["learning", "Learning"], ["familiar", "Familiar"], ["strong", "Strong"]];
const STEPS = ["Exams", "Your day", "Self-assessment", "First plan"];

export function OnboardingPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dates, setDates] = useState<Record<string, string>>({ "CAT 2026": "2026-11-29", "CDS 2027": "2027-04-11" });
  const exams = useApi<Exam[]>(step >= 2 ? "/exams" : null);

  const run = async (fn: () => Promise<unknown>, next?: number) => {
    setBusy(true); setErr(null);
    try { await fn(); if (next !== undefined) setStep(next); } catch (e) { setErr(e instanceof ApiError ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="font-display text-3xl font-semibold">Set up APEX</h1>
        <ol className="mt-3 flex flex-wrap gap-4 text-sm" aria-label="Steps">
          {STEPS.map((s, i) => <li key={s} aria-current={i === step ? "step" : undefined} className={i === step ? "text-ridge" : i < step ? "text-ink" : "text-dim"}>{i + 1}. {s}</li>)}
        </ol>
      </header>
      {err && <ErrorNote message={err} />}

      {step === 0 && (
        <Panel>
          <Heading>Your exams</Heading>
          <p className="mb-4 text-sm text-dim">
            Start from a CAT + CDS profile: CAT Quant, VARC, LRDI and CDS Mathematics, English, General Studies, with Arithmetic,
            Algebra and Geometry marked as substantially covered, plus your leg rehab exercises. Every value stays editable. Confirm the exam dates first.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(dates).map(([name, d]) => (
              <label key={name}><span className="label">{name} date</span>
                <input className="field" type="date" value={d} onChange={(e) => setDates({ ...dates, [name]: e.target.value })} /></label>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={() => run(() => api.post("/onboarding/starter", { examDates: dates }), 1)}>Use this profile</Button>
            <Button disabled={busy} onClick={() => setStep(1)}>Start empty, I'll add exams myself</Button>
          </div>
        </Panel>
      )}

      {step === 1 && (
        <Panel>
          <Heading>Your day</Heading>
          <p className="mb-4 text-sm text-dim">APEX never plans more study than your maximum and always keeps your rejuvenation minimum free. Classes and rehab times can be set in Settings and Rehabilitation at any time.</p>
          <PreferencesForm onSaved={() => setStep(2)} submitLabel="Save and continue" />
        </Panel>
      )}

      {step === 2 && (
        <Panel>
          <Heading>Where are you with each topic?</Heading>
          <p className="mb-4 text-sm text-dim">This is only a starting point. Once you log questions, measured accuracy takes over.</p>
          {(exams.data ?? []).length === 0 && <p className="text-sm text-dim">No exams yet. You can add them under Exams & syllabus after setup.</p>}
          {(exams.data ?? []).map((e) => (
            <div key={e.id} className="mb-6">
              <h3 className="mb-2 font-medium">{e.name}</h3>
              {e.subjects.map((s) => (
                <div key={s.id} className="mb-3">
                  <p className="mb-1 text-sm text-dim">{s.name}</p>
                  <ul className="divide-y divide-rule rounded-md border border-rule">
                    {s.topics.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span>{t.name}</span>
                        <select className="field w-40" aria-label={`${t.name} status`} defaultValue={t.status}
                          onChange={(ev) => void api.patch(`/topics/${t.id}`, { status: ev.target.value }).catch(() => setErr(`Could not save ${t.name}`))}>
                          {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
          <Button variant="primary" onClick={() => setStep(3)}>Continue</Button>
        </Panel>
      )}

      {step === 3 && (
        <Panel>
          <Heading>Generate your first plan</Heading>
          <p className="mb-4 text-sm text-dim">The first plans lean on your self-assessment and exam dates. They sharpen as you log mocks, practice and completed tasks.</p>
          <Button variant="primary" disabled={busy} onClick={() => run(async () => {
            await api.post("/onboarding/complete");
            if ((exams.data ?? []).length) await api.post("/generate-plan");
            await refresh();
            nav("/today");
          })}>Finish and plan today</Button>
        </Panel>
      )}
    </div>
  );
}
