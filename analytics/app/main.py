"""FastAPI wrapper around apex_engine. Internal service: called only by the backend.

Validation lives in apex_engine.serialization so it is tested without FastAPI.
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import Body, Depends, FastAPI, Header, HTTPException

from apex_engine import MockAnalyzer, UnifiedRecommendationEngine, WeeklyAnalyzer, compute_readiness
from apex_engine.serialization import parse_mocks, parse_plan_request, parse_weekly, to_json
from apex_engine.topic_report import topic_report
from apex_engine.types import CheckIn

app = FastAPI(title="APEX analytics", version="0.1.0")
engine = UnifiedRecommendationEngine()
SERVICE_TOKEN = os.environ.get("ANALYTICS_SERVICE_TOKEN", "")


def require_service_token(x_service_token: str = Header(default="")) -> None:
    if not SERVICE_TOKEN or x_service_token != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="invalid service token")


def _guard(fn, *args):
    try:
        return fn(*args)
    except (ValueError, KeyError, TypeError) as e:
        raise HTTPException(status_code=422, detail=str(e)) from e


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/recommend/daily-plan", dependencies=[Depends(require_service_token)])
def daily_plan(body: dict[str, Any] = Body(...)) -> Any:
    req = _guard(parse_plan_request, body)
    return to_json(engine.generate(req))


@app.post("/recommend/rank", dependencies=[Depends(require_service_token)])
def rank(body: dict[str, Any] = Body(...)) -> Any:
    req = _guard(parse_plan_request, body)
    return to_json(engine.rank(req))


@app.post("/analyze/topic", dependencies=[Depends(require_service_token)])
def analyze_topics(body: dict[str, Any] = Body(...)) -> Any:
    req = _guard(parse_plan_request, body)
    return topic_report(req)


@app.post("/analyze/mock", dependencies=[Depends(require_service_token)])
def analyze_mocks(body: dict[str, Any] = Body(...)) -> Any:
    return MockAnalyzer().analyze(_guard(parse_mocks, body.get("mocks", [])))


@app.post("/analyze/weekly", dependencies=[Depends(require_service_token)])
def analyze_weekly(body: dict[str, Any] = Body(...)) -> Any:
    w = _guard(parse_weekly, body)
    if body.get("plan_request"):
        w.ranking = engine.rank(_guard(parse_plan_request, body["plan_request"]))
    return WeeklyAnalyzer().analyze(w)


@app.post("/calculate/readiness", dependencies=[Depends(require_service_token)])
def readiness(body: dict[str, Any] = Body(...)) -> Any:
    fields = {k: body.get(k) for k in ("sleep_hours", "sleep_quality", "energy", "stress", "mental_fatigue")}
    return to_json(compute_readiness(CheckIn(**fields)))
