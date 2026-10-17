# n-gym roadmap

Each phase is one pull request. A phase is merged only when `npm test` and `npm run typecheck` pass
and the app has been tried on an Android phone or emulator. Phases are ordered so that the app is
usable for real training as early as possible, and so the coach (which only automates what the app
can already do) comes last.

| Phase | PR | Status |
| --- | --- | --- |
| 0 | App skeleton: Expo, SQLite + Drizzle, progression engine | Done |
| 1 | Test-only CI and first installable build | Next |
| 2 | Exercises and routines | |
| 3 | Workout logging | |
| 4 | Backup and restore | |
| 5 | History and statistics | |
| 6 | Jefit import | |
| 7 | More progression techniques | |
| 8 | Coach actions with approval | |
| 9 | On-device LLM coach | |
| 10 | Desktop MCP server (optional) | |

---

## Phase 0: App skeleton (done)

Expo SDK 58 app for Android with Expo Router tabs (Workout, History, Exercises, Coach), an offline
SQLite database through Drizzle with migrations and a seeded exercise library, and a tested
progression engine (double, linear with deloads, RPE-based).

## Phase 1: Test-only CI and first installable build

Goal: every later PR is checked automatically, and the app is on the phone.

- Lightweight GitHub Actions workflow: one job that runs `npm ci` (with the npm cache) and
  `npm test` on every PR. No app builds, emulators or lint in CI; typecheck and lint stay local
  checks before merging.
- ESLint config committed (Expo's default) for local use.
- Development build profile verified: `eas build --profile development` produces an APK that installs
  and opens, and the database migrates and seeds on first start.
- App name, package id (`com.nicolaigoon.ngym`), icon and splash set.

Done when: the test job is green on the PR and the dev build runs on the phone.

## Phase 2: Exercises and routines

Goal: build your training plan in the app.

- Exercise library: search, filter by muscle group, add and edit custom exercises (name, muscle
  group, equipment, weight increment).
- Routines: create, rename, archive; add days (e.g. Push A); add exercises to a day and reorder them.
- Per-exercise progression settings: pick a rule (double, linear, RPE) and its numbers, plus rest time
  and starting weight.
- Settings screen: weight unit (kg or lb), default increment.
- Data functions live in `src/db/` with tests that run against an in-memory SQLite database, so the
  coach can reuse them later.

Done when: a full Push/Pull/Legs routine can be built and edited on the phone.

## Phase 3: Workout logging

Goal: train with the app. This is the core of the product.

- Start a workout from a routine day, or start an empty one.
- Each exercise shows the progression engine's suggestion (weight, sets, reps) and why.
- Log sets: weight, reps, optional RPE, warm-up flag; quick +/- steppers; copy previous set.
- Add, remove, swap and reorder exercises mid-workout.
- Rest timer that starts after each set, with a notification and vibration when it ends.
- Screen stays on during a workout; an unfinished workout survives the app being closed.
- Finish screen with a summary (duration, volume, personal records hit) and notes.

Done when: a real gym session can be logged end to end without touching another app.

## Phase 4: Backup and restore

Goal: never lose training data, since everything lives only on the phone.

- Export the whole database to a JSON file and share it (Drive, email, files).
- Import that file back, with a preview and a choice to replace or merge.
- Optional automatic weekly backup to a folder the user picks.

Done when: data survives uninstalling and reinstalling the app.

## Phase 5: History and statistics

Goal: see progress.

- History list with a calendar view; workout detail screen; edit or delete past workouts.
- Exercise detail: chart of estimated 1RM, best set and volume over time; personal records.
- Overview: workouts per week, weekly volume per muscle group, streaks.
- Stats queries live in `src/db/stats.ts` with tests, so the coach can answer questions with them.

Done when: progress on any lift can be read at a glance.

## Phase 6: Jefit import

Goal: bring the full Jefit history over. Needs a sample Jefit export to start.

- Parse the Jefit CSV export (format confirmed against the sample).
- Match Jefit exercise names to the library automatically, with a screen to fix or create the ones
  that don't match; remember the choices.
- Preview before import (number of workouts, sets, date range); import is repeatable without making
  duplicates.
- Imported workouts are marked with `source = 'jefit'`.
- Parser tests use a trimmed copy of the real export.

Done when: the full Jefit history appears in History and drives progression suggestions.

## Phase 7: More progression techniques

Goal: go beyond the three basic rules.

- Scheduled deload weeks and automatic deload suggestions when several lifts stall.
- Wave/percentage programs (5/3/1-style) based on a training max.
- Top set plus back-off sets.
- Warm-up set generator and plate calculator.
- Stall detection surfaced on the Workout and Exercise screens.

Done when: each technique can be chosen per exercise and is covered by engine tests.

## Phase 8: Coach actions with approval

Goal: the safe layer the AI will use, built and tested before any model is added.

- A set of actions with JSON schemas in the MCP tool format, e.g. `create_routine`,
  `add_exercise_to_day`, `update_progression_rule`, `get_exercise_stats`, `list_recent_workouts`.
- Read actions run immediately; write actions produce a proposal.
- Proposal card showing exactly what will change (before and after), with Approve and Reject.
  Nothing is written until Approve.
- Tests run actions with scripted inputs, with no model involved.

Done when: every action works and is approved through the card, driven by a test harness.

## Phase 9: On-device LLM coach

Goal: create workouts and change things by chatting, fully offline.

- `llama.rn` (llama.cpp) added; model download manager with size, progress and a recommended model
  for the phone's RAM (e.g. Qwen 3 4B or Gemma 3n, quantized).
- Coach chat screen with a tool-calling loop over the Phase 8 actions; every write goes through the
  proposal card.
- System prompt includes the user's settings and a short training summary.
- Works in airplane mode.

Done when: "build me a 4-day upper/lower routine" produces a routine that can be approved and used.

## Phase 10: Desktop MCP server (optional)

Goal: use the same actions from Claude Desktop or a bigger model on a PC.

- Small Node MCP server that reads a backup file (or a synced copy) and exposes the Phase 8 actions.
- Write actions produce a change file the app imports with the same approval card.

Done when: a desktop MCP client can read stats and propose a routine that the phone accepts.
