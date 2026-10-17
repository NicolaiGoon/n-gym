# n-gym

A personal workout tracker for Android: Jefit-style logging without the social features, with
progression built in, Jefit history import, and an on-device AI coach.

## Plan

| Area | Choice |
| --- | --- |
| App | React Native + Expo (SDK 58), Expo Router, TypeScript. Android first. |
| Data | SQLite on the device via `expo-sqlite` + Drizzle ORM. Offline, no account. |
| Progression | `src/progression`: pure TypeScript, unit tested. Double progression, linear with deloads, RPE-based. |
| Jefit import | CSV parser that maps Jefit exercise names to the library (needs a sample export). |
| Coach | On-device LLM through `llama.rn` (llama.cpp). The model proposes changes as tool calls; the app shows a preview and only writes after you approve. |
| MCP | Not in v1. Coach tools use MCP-style JSON schemas so a desktop MCP server can expose them later. |

The phased roadmap is in [docs/PLAN.md](docs/PLAN.md).

## Layout

```
src/app/           screens (Expo Router tabs: Workout, History, Exercises, Coach)
src/components/    shared UI
src/db/            Drizzle schema, client, migrations runner, seed data, queries
src/progression/   progression engine and stats (no React Native imports)
drizzle/           generated SQL migrations
```

## Running it

```bash
npm install
npm test               # unit tests
npm run typecheck
npm run lint
npm run db:check       # migrations match the schema
```

CI (`.github/workflows/ci.yml`) runs the same checks plus a compile of the Android JavaScript
bundle on every PR. It doesn't build APKs or run emulators, to keep CI minutes low.

The app uses native modules (SQLite now, llama.cpp later), so it runs in a development build
rather than Expo Go:

```bash
npx expo run:android   # needs Android Studio / SDK and a phone over USB or an emulator
# or build an installable APK in the cloud, no Android Studio needed:
npm run android:apk
```

## Changing the database

Edit `src/db/schema.ts`, then run `npm run db:generate` and commit the new files in `drizzle/`.
Migrations run automatically on app start.
