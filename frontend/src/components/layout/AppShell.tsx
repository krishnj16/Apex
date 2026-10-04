import { NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../lib/auth";
import { Loading } from "../ui/primitives";

const NAV: Array<[string, string]> = [
  ["/", "Dashboard"], ["/today", "Today's plan"], ["/syllabus", "Exams & syllabus"], ["/mocks", "Mocks"],
  ["/performance", "Performance"], ["/calendar", "Calendar"], ["/wellness", "Wellness"], ["/rehab", "Rehabilitation"],
  ["/history", "History"], ["/review", "Weekly review"], ["/settings", "Settings"],
];
// On phones the bar keeps only the daily actions.
const MOBILE = new Set(["/", "/today", "/wellness", "/mocks", "/rehab"]);

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-5 w-5" aria-hidden>
      <path d="M3 27 L16 5 L29 27" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

export function AppShell() {
  const { me, ready, logout } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="p-8"><Loading /></div>;
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!me.onboarded && loc.pathname !== "/onboarding") return <Navigate to="/onboarding" replace />;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-panel focus:p-2">Skip to content</a>
      <aside className="hidden border-r border-rule md:flex md:flex-col md:justify-between md:p-5">
        <div>
          <div className="mb-8 flex items-center gap-2 text-ridge"><Mark /><span className="font-display text-xl font-semibold tracking-wide text-ink">APEX</span></div>
          <nav aria-label="Main">
            <ul className="space-y-0.5">
              {NAV.map(([to, label]) => (
                <li key={to}>
                  <NavLink to={to} end={to === "/"} className={({ isActive }) =>
                    `block rounded-md px-3 py-1.5 text-sm ${isActive ? "bg-panel text-ink" : "text-dim hover:text-ink"}`}>
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className="text-sm text-dim">
          <p className="truncate">{me.name}</p>
          <button className="mt-1 hover:text-ink" onClick={() => void logout()}>Sign out</button>
        </div>
      </aside>

      <div className="min-w-0 pb-20 md:pb-0">
        {me.isDemo && (
          <div className="border-b border-caution/40 bg-caution/10 px-5 py-2 text-sm text-caution" role="status">
            DEMO MODE. This account holds generated sample data and is kept apart from real accounts.
          </div>
        )}
        <main id="main" className="mx-auto max-w-6xl p-4 md:p-8"><Outlet /></main>
      </div>

      <nav aria-label="Daily actions" className="fixed inset-x-0 bottom-0 border-t border-rule bg-ground pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="grid grid-cols-5">
          {NAV.filter(([to]) => MOBILE.has(to)).map(([to, label]) => (
            <li key={to}>
              <NavLink to={to} end={to === "/"} className={({ isActive }) =>
                `block px-1 py-3 text-center text-xs ${isActive ? "text-ridge" : "text-dim"}`}>
                {label.replace("Today's plan", "Today").replace("Rehabilitation", "Rehab")}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
