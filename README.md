# Pick & Cook Ops

Internal operations platform for the Pick & Cook recipe app. A pnpm + TypeScript monorepo containing an Express API server, an admin dashboard, an in-process job scheduler, and a component sandbox.

## What it does

- **Catalog management** — recipes, products, barcodes, ingredient mapping, image uploads, revision history
- **User-generated content moderation** — staging queue for imported recipes (TheMealDB, Wikibooks), promote/reject flow, edit proposals, abuse reports
- **User & household admin** — user detail timelines, role management (`admin`, `read_only_admin`), 2FA, audit logs
- **Insights** — analytics events, search/recsys summaries, AI/LLM usage, cook sessions, receipts
- **System ops** — job scheduling (cron expressions hot-editable from the UI), feature flags, alert webhooks, external health checks
- **Daily NEON sync** — pulls upstream reference + user data from a shadow NEON Postgres into the local DB on a 02:00 UTC cron, additive only, per-table conflict policy

## Repo layout

```
artifacts/
  api-server/        Express 5 API + in-process job scheduler
  ops-dashboard/     React + Vite + React Query admin UI
  mockup-sandbox/    Vite preview server for canvas component mockups
lib/
  api-spec/          OpenAPI source of truth + Orval codegen
  api-client-react/  Generated React Query hooks (do not edit by hand)
  api-zod/           Generated Zod schemas (do not edit by hand)
scripts/             Ad-hoc utility scripts
pnpm-workspace.yaml
tsconfig.base.json
```

## Stack

| Layer | Choice |
|------|--------|
| Runtime | Node.js 24 |
| Package manager | pnpm workspaces |
| Language | TypeScript 5.9 (strict) |
| API | Express 5 |
| DB | PostgreSQL + raw `pg` (Drizzle for schema/migrations) |
| Validation | Zod (`zod/v4`) + `drizzle-zod` |
| API contract | OpenAPI → Orval (React Query hooks + Zod schemas) |
| Frontend | React + Vite + React Query + Tailwind |
| Build | esbuild (CJS bundle) |
| Tests | Vitest |
| Scheduler | `node-cron`, in-process, atomic per-job locking |

## Architectural conventions

### Contract-first API (OpenAPI → Orval)

New endpoints **must** be declared in `lib/api-spec/openapi.yaml` first. Then run:

```bash
pnpm --filter @workspace/api-spec run codegen
```

This regenerates two consumer libs:

- `@workspace/api-client-react` — typed React Query hooks (`useListOpsStaging`, `usePromoteOpsStaging`, …) plus helpers like `getXxxQueryKey` and enum constants like `ListOpsStagingStatus`
- `@workspace/api-zod` — Zod request/response schemas

The `recipe-staging` slice (`/api/ops/recipes/staging*`, 7 endpoints) is the canonical exemplar — every other module follows the same pattern.

The dashboard wires the generated client at `App.tsx` boot:

```ts
setBaseUrl(import.meta.env.BASE_URL.replace(/\/$/, ''));
setAuthTokenGetter(() => getToken());
```

so generated `/api/...` URLs survive path-based proxy routing and pick up the JWT bearer from `localStorage`.

### TypeScript layout

- `lib/*` packages are **composite** and emit declarations via `tsc --build`
- `artifacts/*` and `scripts` are leaf packages, type-checked with `tsc --noEmit`
- Artifacts must not import each other — share via a `lib/`
- `pnpm run typecheck` is the canonical full check; trust it over editor state

### Authentication & authorization

- Email/password login at `/api/ops/auth/login` issues a JWT (bearer in `Authorization` header)
- Optional TOTP 2FA, secrets encrypted at rest
- Login + TOTP routes rate-limited
- Two roles enforced server-side: `admin` (write) and `read_only_admin` (read). Every write route uses `requireAdminWrite`
- Client-side controls are not authorization

### Background jobs

In-process scheduler in `api-server/src/jobs/scheduler.ts`. Currently registered:

| Job | Cron (default) | What it does |
|-----|---------------|--------------|
| `products:nightly` | `0 3 * * *` | Lint products, backfill allergens/ingredients from cached barcode_meta |
| `recipes:nightly` | `0 4 * * *` | Pull next letter from TheMealDB → `imported_recipes_staging` |
| `wikibooks:weekly` | `0 5 * * 0` | Wikibooks Cookbook scraper (wikitext-based extraction) → staging |
| `neon:daily` | `0 2 * * *` | Pull upstream NEON reference + user data into local DB |
| `opsReverseSync:periodic` | `*/15 * * * *` | Push operator-edited rows (recipes, products, moderation decisions) to deployed prod via `/api/admin/ops-sync/*` |

Cron expressions are editable per-job at runtime via System Health → Job Schedules (persisted in `system_flags`, hot-reloaded). Manual triggers, run history, and stale/zombie detection are surfaced in the dashboard.

### NEON daily sync — quick reference

Pulls `NEON_DATABASE_URL` → local DB, additive only.

- **Catalog tables** (products, barcode_meta, product_barcodes, recipes, recipe_provider_cache, produce_shelf_life*, notification_templates, app_state, recipe_sync_state) → `DO UPDATE` (NEON wins)
- **User/transactional tables** (users, profiles, user_segments, receipt_headers, receipt_items, pantry_item_events) → `DO NOTHING` (preserve local writes)
- `products_dept_backup_*` → always skipped
- Unknown tables → `DO NOTHING` + flagged in `summary.unknownTables`
- Idempotent: `WHERE (cols) IS DISTINCT FROM (EXCLUDED.cols)` so unchanged rows produce zero affected rows on a rerun
- Source pinned to `REPEATABLE READ READ ONLY` for snapshot-stable pagination
- Dst session uses `session_replication_role='replica'` to bypass FK ordering
- No-ops gracefully when `NEON_DATABASE_URL` is unset

### Logging

**Never use `console.log` in server code.** Use `req.log` in route handlers and the singleton `logger` from `pnpm-workspace`'s server reference for non-request code.

### SQL safety

- Values are always parameterized
- Dynamic identifiers (table/column names, `ORDER BY` fragments) go through fixed allowlists or `quoteIdent` before interpolation — never raw user input
- See `STAGING_SORT_COLUMNS` in `routes/ops/recipesStaging.ts` for the allowlist pattern

## Running locally

This repo runs via Replit workflows, not root-level `pnpm dev`. The artifact services bind to `PORT` env vars wired up by the workflow config.

To restart a service after code changes:

- API server: restart workflow `artifacts/api-server: API Server`
- Dashboard: restart workflow `artifacts/ops-dashboard: web`
- Mockup sandbox: restart workflow `artifacts/mockup-sandbox: Component Preview Server`

To verify code (no need to run `build` — that needs workflow env):

```bash
pnpm --filter @workspace/api-server run typecheck
pnpm --filter @workspace/api-server run test
pnpm run typecheck    # full repo
```

To regenerate the API client/schemas after editing the OpenAPI spec:

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Required environment

| Var | Used for | Required? |
|-----|---------|-----------|
| `DATABASE_URL` | Local Postgres | yes |
| `SESSION_SECRET` | JWT signing | yes |
| `NEON_DATABASE_URL` | `neon:daily` upstream sync | optional (job no-ops) |
| `FDC_API_KEY` | FoodData Central health check | optional |
| `OBJECT_STORAGE_*` | Replit object storage sidecar | yes (for image uploads) |
| `ALERT_WEBHOOK_URL` | Outbound alert webhook | optional |
| `OPS_REVERSE_SYNC_TOKEN` | Bearer token for `opsReverseSync:periodic` POSTs to prod | required for the job (job fails fast otherwise) |
| `PROD_API_BASE` | Prod API base URL the reverse-sync cron POSTs to (e.g. `https://pickandcook.replit.app`) | required for the job |

## External services

- **TheMealDB** — recipe imports into staging
- **OpenFoodFacts** — health check (cached server-side 30s; aggressive 429 if hit too often)
- **Wikibooks (MediaWiki API)** — recipe scraper (cursor-based, wikitext extraction)
- **FDC (FoodData Central)** — optional health check
- **Replit Object Storage** — image uploads via signed PUT URLs, public GET via `/api/storage/objects/*`

## Common tasks

**Add a new admin endpoint**: declare in `lib/api-spec/openapi.yaml` → `pnpm --filter @workspace/api-spec run codegen` → implement route in `artifacts/api-server/src/routes/ops/` (use `requireAdminWrite` for mutations) → add Zod validation using the generated schema → consume in dashboard via the generated React Query hook.

**Add a new background job**: create handler in `artifacts/api-server/src/jobs/handlers/` → register in `artifacts/api-server/src/jobs/registry.ts` with default cron → add tests in the same dir → restart api-server.

**Run the reverse-sync cron manually**: `pnpm --filter @workspace/api-server run ops-sync -- --dry-run` (or `--since=ISO`, `--table=recipes|products|moderation-decisions`, `--omit-control-updated-at`). Requires `OPS_REVERSE_SYNC_TOKEN` and `PROD_API_BASE`. The CLI runs once and exits; output is the same JobSummary the cron writes to `job_runs.summary` and per-endpoint detail to `ops_sync_runs`.

**Schema change**: alter Drizzle schema → generate migration → apply to local DB; for production, use the database skill (`environment: "production"`) or the Deployment SQL console.

## Deployment

The project is published to Replit. Pushing to main triggers a Replit deployment build. The dashboard, API, and scheduler all run inside a single deployment — the scheduler runs in-process inside the API server.

To check production logs or query the prod DB read-only, use the deployment / database skills rather than connecting from local.

## Security model

See `threat_model.md` for the full threat model. Highlights:

- All `/api/ops/*` routes require admin role; mutations require `requireAdminWrite`
- Public storage routes (`/api/storage/objects/*`, `/api/storage/public-objects/*`) only serve deliberately public objects
- CSV exports prefix-neutralize cells to prevent formula injection
- TOTP secrets encrypted at rest; sensitive request bodies excluded from logs
- External fetches have timeouts; manual job triggers gated by single-running-job locks
