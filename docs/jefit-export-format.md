# Jefit export format

Notes from a real Jefit export (October 2026, app data version as exported then). The export is
not a single CSV table, so a plain CSV reader can't load it directly.

## Layout

- The file is split into sections, each starting with a line like
  `### EXERCISE LOGS ##########` and ending with a line of `#` characters.
- Inside a section, records come as blocks separated by blank lines. Each block starts with its own
  header row. Most sections repeat the same header for one big block; ROUTINES mixes three
  different headers (routine, routine day, routine exercise), one record per block.
- Text fields are double-quoted when needed and are UTF-8 (notes can be in any language).
- `TIMESTAMP` columns are export/sync times, not workout times.

## Sections

| Section | Use | Key columns |
| --- | --- | --- |
| SETTING | Units | `mass` (" kg" or " lb"), `length` |
| PROFILE | Body measurements | `mydate`, `weight`, `fatpercent`, `chest`, `arms`, `waist`, … (0 = not recorded) |
| ROUTINES, routine block | Routine | `_id`, `name`, `dayaweek`, `description` |
| ROUTINES, day block | Routine day | `_id`, `package` (routine id), `name`, `dayIndex` |
| ROUTINES, exercise block | Exercise in a day | `exercise_id`, `belongSys`, `belongplan` (day id), `exercisename`, `setcount`, `timer` (rest seconds), `targetrep` ("8,8,8"), `mysort`, `superset` |
| WORKOUT SESSIONS | Workouts | `_id`, `day_id`, `starttime`, `endtime` (unix seconds), `total_time`, `total_weight` |
| EXERCISE LOGS | Sets per exercise per workout | `belongsession` (session id), `eid`, `belongSys`, `ename`, `mydate`, `logs` ("40x8,40x8,40x5"), `record` (Epley 1RM) |
| EXERCISE SET LOGS | Per-set detail, recent workouts only | `exercise_log_id`, `set_index`, `weight_lbs`, `reps`, `log_time` |
| EXERCISE RECORDS | Best 1RM per exercise | `eid`, `belongSys`, `record` |
| CARDIO LOGS | Cardio | `eid`, `duration`, `distance` |
| CUSTOM EXERCISES | User-made exercises | `_id`, `name`, `bodypart`, `equip1` |
| FAVORITE EXERCISES | Favorites | `exercise_id`, `belongSys` |
| NOTES | Exercise notes | `eid`, `belongSys`, `title` (exercise name), `mynote`, `mydate` |

## Exercises

- An exercise is identified by `(eid, belongSys)`: `belongSys = 1` is Jefit's built-in library,
  `belongSys = 0` is a custom exercise whose `eid` is the CUSTOM EXERCISES `_id`.
- The same id can appear under several `ename` values over the years (Jefit renamed exercises), and
  occasionally with an empty name. Match on the id and use the most recent non-empty name.
- `bodypart` codes seen: 0 abs, 1 back, 2 biceps, 3 chest, 5 glutes, 6 shoulders, 7 triceps,
  8 upper legs, 9 lower legs, 11 other. These are inferred from the exercises they appear on.

## Sets

- `logs` in EXERCISE LOGS is the full history: comma-separated `weightxreps`, in the unit from
  SETTING. It may end with a trailing comma.
- Weight 0 means bodyweight.
- Cardio-style entries look like `0x0.0,0x10,...` and are skipped.
- EXERCISE SET LOGS has the same sets converted to pounds (`weight_lbs`, e.g. 40 kg → 88.185) and
  only exists for recent workouts, so it is only used for cross-checks.
