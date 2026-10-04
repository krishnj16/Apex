# Architecture

```
React (Vite) ──/api──▶ Express API ──▶ PostgreSQL (Prisma)
                          │
                          └──▶ FastAPI analytics ── apex_engine (pure Python)
```

**Frontend** (`frontend/`): React, TypeScript, Tailwind, Recharts. Pages call the API only; there is no scoring logic in the browser. The one piece of browser state is the running study timer (localStorage, so a refresh does not lose it).

**Backend** (`backend/`): Express + Zod validation + Prisma. Responsibilities: authentication (bcrypt, httpOnly JWT cookie, CSRF header), ownership checks on every query, assembling a `PlanRequest` from stored facts (`services/planInput.ts`), persisting plans and task outcomes, CSV export. It contains no recommendation logic.

**Database** (`backend/prisma/schema.prisma`): Exam → Subject → Topic → Subtopic; raw facts (MockQuestion, QuestionAttempt, StudySession, DailyCheckIn, RehabSession, DailyPlanItem). Derived numbers are computed by the analytics service and cached only where noted (DailyCheckIn.readiness, WeeklyReview).

**Analytics** (`analytics/`): FastAPI endpoints are thin wrappers; all logic lives in `apex_engine`, which has no framework dependencies and is tested directly. The service is internal and requires `X-Service-Token`.

**Data flow, one day**
1. Check-in saved → readiness computed by analytics → plan regenerated.
2. `buildPlanRequest` reads exams, topics, 120 days of attempts and sessions, recent skips, unanalysed mocks, classes, rehab, preferences.
3. Engine returns items with reasons; backend stores a new plan version. Earlier versions are kept.
4. Completing a task writes a StudySession, which updates recency, practice minutes and duration calibration.
5. Logging a mock or practice questions changes next generation's scores.

**Demo mode**: `npm run seed:demo` creates a separate account flagged `isDemo`; the UI shows a DEMO MODE banner. Real accounts never contain generated data.

**Design language**: dark ground, one cool accent for plan and focus, green/red only for improving/declining. Tokens live in `frontend/tailwind.config.js`.

**Assumptions**: exam dates in the starter profile are placeholders confirmed during onboarding; all times are minutes since midnight in the user's timezone; the LLM layer is not built (explanations are generated deterministically), and when added it must only rephrase numbers returned by the API.

**Notifications**: preference flags exist (default off); no delivery is built. A scheduler would read the same plans, mocks and rehab tables.
