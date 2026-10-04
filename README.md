# APEX: your daily path to peak performance

An adaptive study, performance and recovery planner. One deterministic engine decides what to do today from your stored data (exam dates, topic accuracy, error types, recency, missed tasks, readiness, classes, rehab) and explains every choice with a Why?. It works without any LLM.

CAT, CDS and any future exam are the same thing to the engine: an exam date plus subjects and topics. Heavy CAT work before CAT and the shift to CDS afterwards come from exam urgency, not from special cases. See `RECOMMENDATION_ENGINE.md` and `ARCHITECTURE.md`.

## Stack
React + Vite + TypeScript + Tailwind + Recharts · Node/Express + Zod + Prisma · PostgreSQL · Python FastAPI with a framework-free engine (`analytics/apex_engine`).

## Setup (local)
Requires Node 20+, Python 3.12, PostgreSQL 16.

```bash
cp .env.example .env            # then fill in the values
cp backend/.env.example backend/.env

# 1. database + backend
cd backend && npm install
npx prisma migrate dev --name init
npm run dev                     # :4000

# 2. analytics service (new terminal)
cd analytics && pip install -r requirements.txt
ANALYTICS_SERVICE_TOKEN=<same as backend> uvicorn app.main:app --port 8000

# 3. frontend (new terminal)
cd frontend && npm install && npm run dev   # :5173
```

Open http://localhost:5173, create an account, and confirm your exam dates in onboarding. The starter profile (CAT + CDS syllabus, your 12 leg exercises) is only an initial suggestion; everything is editable.

### Docker
`cp .env.example .env`, fill it in, then `docker compose up --build` and open http://localhost:8080. Migrations run on backend start.

### Demo mode
`DEMO_PASSWORD=... npm --prefix backend run seed:demo` creates `demo@apex.local`, a separate account with five mocks, practice history, skipped tasks and rehab logs. It shows a DEMO MODE banner and is never mixed with real accounts.

## Tests
```bash
cd analytics && python -m pytest -q     # or: python -m unittest discover -s tests
cd backend && npm test
```
The engine suite covers time limits, rejuvenation, exam urgency and the post-CAT shift, weakness and recency, error-type to task mapping, missed-task re-evaluation, readiness, calibration, determinism, and randomised days checked against every hard constraint.

## API (all under `/api`, session cookie + `X-Apex-Client: web` header)
| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /auth/me` |
| Onboarding | `GET/POST /onboarding/starter`, `POST /onboarding/complete` |
| Syllabus | `GET/POST /exams`, `PATCH/DELETE /exams/:id`, `GET /subjects`, `GET /topics`, subject/topic/subtopic create, `PATCH/DELETE /subjects/:id`, `/topics/:id` |
| Day | `GET /dashboard`, `GET /today`, `POST /checkins`, `GET /checkins/today`, `POST /generate-plan` |
| Tasks | `POST /tasks/:id/start`, `/complete`, `/skip`, `PATCH /tasks/:id` (move), `POST /sessions`, `POST /attempts` |
| Mocks | `GET/POST /mocks`, `GET /mocks/:id`, `POST /mocks/:id/questions`, `GET /mocks/analytics?examId=` |
| Performance | `GET /performance`, `/performance/topics`, `/performance/priorities` |
| Rehab | `GET /rehab`, `POST /rehab/session`, programme and exercise create/edit |
| Schedule | `/classes`, `/commitments`, `GET/PATCH /preferences`, `GET /calendar?from&to` |
| Review / export | `GET /weekly-review?week=`, `GET /export/:kind` (CSV) |

Analytics service (internal, `X-Service-Token`): `POST /recommend/daily-plan`, `/recommend/rank`, `/analyze/topic`, `/analyze/mock`, `/analyze/weekly`, `/calculate/readiness`.

## Rehabilitation
APEX schedules and tracks your existing routine. It does not diagnose, prescribe or adjust exercises, and pain notes never feed the planner.

## Known gaps
Not built yet: CSV *import*, JSON backup, notification delivery, the optional LLM explanation layer, and a task creation endpoint for manual one-off tasks. Section names in the mock form are free text.
