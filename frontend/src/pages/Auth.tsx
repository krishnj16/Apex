import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api/client";
import { useAuth } from "../lib/auth";
import { Button, ErrorNote } from "../components/ui/primitives";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center p-6">
      <p className="font-display text-2xl font-semibold tracking-wide">APEX</p>
      <p className="mb-8 text-sm text-dim">Your daily path to peak performance.</p>
      <h1 className="mb-4 text-lg font-medium">{title}</h1>
      {children}
    </main>
  );
}

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { me, refresh } = useAuth();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (me) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await api.post(`/auth/${mode}`, mode === "register" ? { ...f, timezone } : { email: f.email, password: f.password });
      await refresh();
      nav(mode === "register" ? "/onboarding" : "/");
    } catch (x) { setErr(x instanceof ApiError ? x.message : "Could not reach the server"); }
    finally { setBusy(false); }
  }

  return (
    <Shell title={mode === "login" ? "Sign in" : "Create your account"}>
      <form onSubmit={submit} className="space-y-4">
        {mode === "register" && <label className="block"><span className="label">Name</span>
          <input className="field" autoComplete="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>}
        <label className="block"><span className="label">Email</span>
          <input className="field" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="block"><span className="label">Password{mode === "register" && " (10+ characters)"}</span>
          <input className="field" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required
            minLength={mode === "register" ? 10 : 1} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
        {err && <ErrorNote message={err} />}
        <Button variant="primary" type="submit" className="w-full" disabled={busy}>{mode === "login" ? "Sign in" : "Create account"}</Button>
      </form>
      <p className="mt-6 text-sm text-dim">
        {mode === "login" ? <>New here? <Link className="text-ridge" to="/register">Create an account</Link></>
          : <>Have an account? <Link className="text-ridge" to="/login">Sign in</Link></>}
      </p>
    </Shell>
  );
}
