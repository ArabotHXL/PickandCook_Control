# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

- **api-server** (`/api`) — Express + Drizzle backend. Routes mounted under `/api/ops/*` are gated by `requireAdmin` (JWT in `Authorization: Bearer …`, admin role required). `auth.ts` fails fast at import time if `SESSION_SECRET` is unset or shorter than 16 chars.
- **ops-dashboard** (`/`) — Internal admin dashboard (React + Vite + React Query + Tailwind).
- **mockup-sandbox** — Component preview sandbox.

## Ops Dashboard Modules

Sidebar grouped into Overview, People, Inventory, Cooking, Insights, Operations.

- Overview, Users, Pantry/Inventory, Recipes, Audit Log (pre-existing)
- **Recipe Detail** (`/recipes/:id`) — full edit form (title, basics, tags, ingredient IDs, instructions), image upload via signed URL, side panel of revisions with one-click restore. Every save snapshots prior state into `recipe_revisions`.
- **UGC Detail Modal** — clicking a row in Recipes › User Submissions opens a modal with full content, author summary (other-published / pending counts, total reports), reports list, and Approve / Reject actions.
- **User Detail Drawer** — clicking a row on Users opens a drawer with merged event timeline (`user_events` + `analytics_events`).
- **AI / LLM Usage** — token spend & latency, broken down by model / endpoint / day. Top of page shows live cost-alert banner (green / orange / red) backed by `system_flags.flags['ai_daily_cost_threshold_usd']` (default $5); admins can edit threshold inline.
- **Cook Sessions** — active and historical cook sessions with progress, review status, recipe + user join
- **Receipts** — uploaded receipts with extracted-items modal
- **Households** — households with member count and member-detail modal (allergies, allergy groups, dislikes, dietary restrictions normalized to display strings)
- **Analytics → Search** — top queries, zero-result rate
- **Analytics → Recommendations** — recsys events by surface / event type / algo version
- **System → Overview** — auto-discovers every job that has ever run (no hardcoded list); flags any job whose last successful run is older than 2 days as "stale" and any `running` job older than 1 hour as a "zombie". Shows an amber banner with one-click **Clear stuck jobs** button (POST `/api/ops/system/jobs/clear-stuck` — admin-only, audited).
- **System → Feature Flags** — view & toggle boolean flags per scope (optimistic UI; mutation audited)
- **CSV export** — Recipes (catalog + user-submissions tabs), Users, Cook Sessions, Receipts list endpoints accept `?format=csv`. Helper `lib/csv.ts` triggers an authenticated browser download. Backend escapes CSV cells and prefix-neutralizes `=+-@\t\r` to prevent formula injection in spreadsheets.

## Object Storage

- `POST /api/storage/uploads/request-url` (admin-only) returns a signed PUT URL plus a persistent `objectPath` (`/objects/<uuid>`) to save as `imageUrl`.
- `GET /api/storage/objects/*` is public (intentional — `<img>` tags cannot send Bearer tokens; identifiers are unguessable UUIDs and the bucket only stores ops-uploaded recipe imagery).
- Frontend helpers: `lib/upload.ts` exports `uploadImageFile(file)` (does request-url + PUT) and `resolveImageSrc(url)` which prefixes `/objects/...` with `/api/storage` for display.

## Query-Param Validation

All `/api/ops/*` list endpoints share `routes/ops/queryParams.ts` (`parseLimit`, `parsePage`, `parseDays`). Invalid values (`limit=abc`, `page=-1`, out-of-range `days`) throw `HttpError(400, …)` (`lib/httpError.ts`) which is caught by the global error middleware in `app.ts` and returned as `{"error":"…"}` JSON — no stack trace leaks. Add new list endpoints by importing from `queryParams.js` rather than re-implementing `parseInt(...)` patterns.

## Data Pipeline (Embedded Worker)

A lightweight in-process scheduler runs **inside api-server** (`src/jobs/`) using `node-cron`. There is no separate worker artifact — one process, one DB pool. Gated on `NODE_ENV !== "test"` and `WORKER_ENABLED !== "false"`. All schedules in **UTC**.

| Job | Schedule | Handler | Behaviour |
| --- | --- | --- | --- |
| `products:nightly` | `0 3 * * *` | `handlers/productsNightly.ts` | Lints products (counts missing kcal/brand/allergens/ingredients_text) + backfills allergens & ingredients_text from cached `barcode_meta` for products with empty allergens, joined via `product_barcodes`. Hard cap of 500 backfills/run. |
| `recipes:nightly` | `0 4 * * *` | `handlers/recipesNightly.ts` | Reads cursor from `recipe_sync_state` (source `themealdb`), fetches `https://www.themealdb.com/api/json/v1/1/search.php?f=<letter>`, dedupes by `source_recipe_id`, inserts into `imported_recipes_staging` with mapping_rate computed by ILIKE-matching ingredient names against `products.name` + `synonyms`, advances cursor a→b→…→z→a. |
| `wikibooks:weekly` | `0 5 * * 0` | `handlers/wikibooksWeekly.ts` | **Stub**. Wikibooks scraper is genuinely deferred — the cookbook tree is hand-curated XHTML and brittle to scrape; we'll revisit when there's a stronger product need. Logs `{deferred: true}`, finishes success so the dashboard stays green. |

**Lifecycle code:**
- `src/jobs/runner.ts` — `runJob(name, triggeredBy)` writes `job_runs` start/finish/fail rows. Locking is **atomic**: a partial unique index `job_runs_one_running_per_name ON job_runs(job_name) WHERE status='running'` (created by `migrations.ts` at boot) means `startJob` can `INSERT … ON CONFLICT DO NOTHING` and detect "already running" without a SELECT-then-INSERT race. Stale rows (locked_until expired) are reaped per-job before each claim.
- `src/jobs/migrations.ts` — `ensureJobSchema()` creates the partial unique index idempotently at boot; reaps stale rows and retries if the create fails.
- `src/jobs/registry.ts` — single source of truth: `name`, `cronExpr`, `description`, `handler`.
- `src/jobs/scheduler.ts` — wires cron schedules at boot + exposes `triggerJobAsync(name, triggeredBy)` for manual runs.

**Manual trigger:**
- `GET /api/ops/system/jobs/available` — list registered jobs (admin-only).
- `POST /api/ops/system/jobs/:jobName/trigger` — fire-and-forget; returns 202 immediately, runner records the row. Launch errors logged via `req.log`. Audited as `system.trigger_job`. Surfaced as a **Run** button next to each tracked job on `/system`.

**Deploy caveat (multi-replica):** The atomic lock works across multiple processes hitting the same DB, so horizontal scaling is safe — only one replica wins the `INSERT ON CONFLICT` per job. However, every replica's cron will *attempt* to fire at the same UTC minute, so expect "skipped (already running)" warning logs on the loser replicas. If this becomes noisy, set `WORKER_ENABLED=false` on all but one replica.

**OpenAPI status:** Ops routes (`/api/ops/*`) are NOT yet in the OpenAPI spec — only `/api/healthz` is. Migrating them is a deliberate follow-up (large surface area, would 3× the spec). For now they stay hand-rolled with shared validation in `routes/ops/queryParams.ts`.

## Auth & Login

- Admin login: `POST /api/ops/auth/login` → `{ token }`. Frontend stores in `localStorage["ops_token"]` and sends as `Authorization: Bearer …`.
- Login is throttled by `express-rate-limit`: **10 attempts per IP per 15 minutes** → HTTP 429. `app.set("trust proxy", 1)` so the limiter sees the real client IP behind Replit's shared proxy.
- Default admin (dev seed): `admin@pickandcook.dev` / `Admin123!`.
