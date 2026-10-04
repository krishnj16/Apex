# Recommendation engine

Code: `analytics/apex_engine/`. It is a pure function of stored facts: no database access, no clock, no randomness. `today` is passed in, so any past plan can be reproduced from the same data. No LLM is involved in any decision.

## Pipeline

1. **Assess.** `PerformanceAnalyzer` builds per-topic stats from logged questions (mocks and practice, last 120 days loaded). Older answers count less: weights halve every 21 days.
2. **Score.** `PriorityScorer` gives every active topic of every active exam one score. CAT and CDS are not special-cased; they are just exams with different dates.
3. **Diagnose.** `diagnosis.py` decides what *kind* of work the topic needs from its error types.
4. **Select.** `UnifiedRecommendationEngine._select` picks tasks greedily, with diminishing returns per subject and a cognitive-load ceiling.
5. **Place.** `ConstraintSolver` fits blocks around classes, rehab, commitments and pinned blocks.
6. **Explain.** Every task keeps the reasons and factor values that produced it.

## Score

```
base  = weighted geometric mean of six factors, each in [0.05, 1]
score = 100 × base × user_priority × consistency × carryover
```

A geometric mean keeps the "urgency × weakness × …" multiplicative intent (one low factor pulls the score down) while making weights tunable: a weight is an exponent. Default weights (`ScoringConfig.weights`):

| Factor | Weight | Meaning |
|---|---|---|
| urgency | 2.0 | `exp(-days_to_exam / 75)`; 1.0 within 7 days; 0 once the exam has passed (the exam drops out) |
| importance | 1.0 | `topic.importance / 5 × subject.importance` |
| need | 2.0 | `1 − mastery`, plus up to 0.25 if accuracy is declining, minus 0.05 if improving, plus 0.1 if ≥1.25× slower than expected |
| recency | 1.0 | `1 − exp(−days_since / (1 + 6 × mastery))`; strong topics tolerate longer gaps. Never practised in APEX = 0.6 (unknown, not maximally overdue) |
| benefit | 1.0 | mid-mastery topics improve fastest: `0.4 + 0.6·4·m(1−m)`; unfinished syllabus uses `0.5 + 0.4(1−coverage)` |
| prerequisite | 0.5 | lower if a prerequisite topic is weak; small bonus if other topics depend on this one |

Multipliers outside the mean:

- **user_priority** = topic × subject × exam priority, clamped to 0.3–2.0.
- **consistency**: up to ×1.6 when a subject has gone beyond its target cadence (`Subject.cadenceDays`). This is what keeps CDS English and GS from being forgotten.
- **carryover**: ×1.1 if the topic was skipped in the last 3 days, unless the reason was "too tired". It is a nudge to re-evaluate, not a copy of yesterday.

**Mastery** = `0.7 × accuracy + 0.3 × min(coverage, accuracy + 0.2)`, so high coverage alone never counts as mastery. Accuracy is recency-weighted and shrunk toward your self-assessment with a prior worth 6 pseudo-questions (not started 0.10, learning 0.35, familiar 0.60, strong 0.80). With no data, only your self-assessment counts.

### Maintenance mode

If an exam's urgency is below 35% of the most urgent exam's, its topics are in *maintenance*: short (25 min) tasks, at most one block per subject per day. When the nearer exam passes, the other becomes the most urgent and leaves maintenance automatically. Nothing is hard-coded.

## What kind of work (diagnosis)

| Evidence | Gap | Task |
|---|---|---|
| Low coverage / knowledge or concept-confusion errors dominate | Knowledge | Concept learning or revision |
| Application or interpretation errors dominate (≥40% of ≥3 classified errors) | Application | Mixed application practice |
| Calculation or careless errors dominate | Execution | Timed accuracy drill |
| Accurate but ≥1.25× slower than expected | Speed | Timed drill |
| Selection, time-management or guessing errors dominate | Selection | Question-selection practice |
| Not enough data | none | Practice, based on self-assessment |

Execution is kept apart from application because they need different drills. For knowledge-type subjects (e.g. General Studies) the tasks become reading and PYQ practice instead.

## Time and workload

- Study budget = min(your daily maximum, time you entered for today, feasible free time − protected rejuvenation − breaks). It is never filled "just because".
- If the budget is below your daily minimum, the plan is shorter and says why.
- **Readiness** (weighted average of the check-in fields you filled in; sleep 30%, energy 25%, quality 15%, stress 15%, fatigue 15%) below 0.4 swaps heavy formats for lighter ones and caps blocks at 45 min. The total stays the same.
- **Calibration**: after 10 timed sessions, durations are scaled by the median actual ÷ planned ratio, shrunk toward 1.0 and clamped to 0.8–1.5×.
- Pinned blocks (moved by hand, started or finished) are kept; the rest is re-planned around them.

## Mock analysis loop

Mock questions with topic, outcome, time and error type become topic attempts. They change accuracy, trend, speed and the error mix, so the next plan changes. A mock with `analysedAt = null` produces a *Mock analysis* task, scored with the same urgency and decaying with age.

## Honesty rules

- Accuracy is labelled "not enough data" below 5 answered questions. A trend needs 3 mocks (or 3 practice sessions) of 2+ questions each, and compares the first and last of the latest three; a change of 5 points or more counts as improving or declining.
- Mock trajectories are descriptive ("last 5 mocks changed by X"). No predictions.
- Every metric in the UI shows its formula and sample size, or says "Not enough data yet".

## Tuning

Change `ScoringConfig` (weights, tau, thresholds). Tests in `analytics/tests/test_engine.py` pin the behaviours above.
