# Overview

This is a pnpm workspace monorepo utilizing TypeScript, designed for a modern web application stack. It comprises an API server, an internal administration dashboard, and a component sandbox. The project aims to streamline development with a unified toolchain and robust features for managing recipes, users, and system operations.

The business vision is to provide a comprehensive platform for recipe management, user engagement, and efficient internal operations, with a strong focus on data integrity, administrative control, and scalability. Key capabilities include user-generated content moderation, detailed analytics, system health monitoring, and secure access controls.

# User Preferences

I prefer concise and accurate responses. Please prioritize delivering functional code and focus on task completion. When making changes, ensure they align with the existing architectural patterns and maintain a high standard of code quality. I value clear communication about significant architectural decisions or potential risks before implementation.

# System Architecture

The project is structured as a pnpm monorepo with separate packages for different functionalities.

## Stack

-   **Monorepo tool**: pnpm workspaces
-   **Node.js version**: 24
-   **Package manager**: pnpm
-   **TypeScript version**: 5.9
-   **API framework**: Express 5
-   **Database**: PostgreSQL + Drizzle ORM
-   **Validation**: Zod (`zod/v4`), `drizzle-zod`
-   **API codegen**: Orval (from OpenAPI spec)
-   **Build**: esbuild (CJS bundle)
-   **Testing**: Vitest

## Core Architectural Decisions

-   **Monorepo Structure**: Uses pnpm workspaces for managing multiple packages (`api-server`, `ops-dashboard`, `mockup-sandbox`) within a single repository, promoting code sharing and consistent tooling.
-   **Type Safety**: TypeScript is used extensively across all packages to ensure type safety and improve code maintainability.
-   **API Design**: The API server uses Express and Drizzle ORM. Admin routes (`/api/ops/*`) are protected with JWT authentication and role-based access control (`admin`, `read_only_admin`).
-   **Contract-First API (OpenAPI → Orval)**: New endpoints must be declared in `lib/api-spec/openapi.yaml` first. `pnpm --filter @workspace/api-spec run codegen` regenerates two consumer libs: `@workspace/api-client-react` (typed React Query hooks + helpers like `getXxxQueryKey`, plus enum constants like `ListOpsStagingStatus`) and `@workspace/api-zod` (Zod request/response schemas). The recipe-staging slice (`/api/ops/recipes/staging*`, 7 endpoints) is the canonical exemplar — every other module should follow the same pattern. The dashboard wires the generated client at `App.tsx` boot via `setBaseUrl(import.meta.env.BASE_URL.replace(/\/$/, ''))` and `setAuthTokenGetter(() => getToken())`, so generated `/api/...` URLs survive path-based proxy routing and pick up the JWT bearer from `localStorage`. Pages then consume the hooks directly (e.g. `useListOpsStaging`, `usePromoteOpsStaging`) and invalidate via `qc.invalidateQueries({ queryKey: getListOpsStagingQueryKey().slice(0, 1) })` to match all paginated/filtered variants of the list. Note: `lib/api-zod/src/index.ts` only re-exports `./generated/api` (the Zod side); the parallel `./generated/types` interfaces collide with Zod schema names and must be imported directly when needed.
-   **Database Interactions**: Drizzle ORM is used for PostgreSQL interactions, including schema migrations and data manipulation. Query parameter validation for list endpoints is centralized to prevent common errors.
-   **Data Pipeline**: A lightweight, in-process scheduler runs within the `api-server` for background jobs using `node-cron`. This worker shares the same process and database pool as the API server, with atomic locking mechanisms for job execution across multiple replicas. Job cron expressions are configurable per-job at runtime via the System Health → Job Schedules UI; overrides are persisted in `system_flags` (id `job_schedules`) and applied with hot-reload (no server restart).
-   **Frontend (Admin Dashboard)**: The `ops-dashboard` is built with React, Vite, React Query, and Tailwind CSS, providing a responsive and interactive user interface for administrative tasks.
-   **Image Storage**: Object storage is managed via signed PUT URLs for uploads, and public GET access for `/api/storage/objects/*` for displaying images.
-   **Security**:
    -   Admin authentication includes optional TOTP 2FA.
    -   Login attempts are rate-limited to prevent brute-force attacks.
    -   Role-based access control (`admin` and `read_only_admin`) is strictly enforced for API operations.
    -   CSV exports perform prefix neutralization to prevent formula injection.
    -   Sensitive data like TOTP secrets are encrypted at rest.

## Feature Specifications

-   **Ops Dashboard Modules**: Includes modules for Overview, Users, Inventory (Pantry, Recipes), Cooking, Insights (AI/LLM Usage, Cook Sessions, Receipts, Analytics), and Operations (System, Feature Flags).
-   **Recipe Management**: Detailed recipe editing, image uploads, revision history, and a user-generated content (UGC) moderation flow with promotion/rejection capabilities.
-   **User Management**: User detail drawers with merged event timelines and role management.
-   **System Monitoring**: External API health checks (TheMealDB, OpenFoodFacts, Wikibooks, optional FDC) cached server-side for 30s in-memory to avoid tripping downstream rate limits (OpenFoodFacts in particular is aggressive at 429-ing repeat callers); job monitoring (stale/zombie job detection); and feature flag management.
-   **Alerting**: Outbound alert webhook integration for critical system events (job failures, cost thresholds).
-   **Bulk Moderation**: Functionality for bulk approval or rejection of user-generated content.
-   **Ingredient Mapping Service** (`api-server/src/services/ingredientMapping.ts`): Shared three-tier matcher used by the TheMealDB nightly scraper, the Wikibooks weekly scraper, and the staging "Re-map ingredients" admin action. Tier 1 = exact name/synonym; Tier 2 = exact match against a normalized noun phrase (`normalizeIngredientName` strips quantities, units, parentheticals, prep adjectives, and singularizes plurals); Tier 3 = word-boundary substring fallback (gated to ≥4 chars, ≤4 words to limit false positives), tie-broken by shortest product name. Boosted Wikibooks-import mapping rate from ~7% to ~74% in our test corpus.
-   **Staging Re-map**: `POST /api/ops/recipes/staging/remap` re-runs ingredient mapping over `imported`/`needs_review` rows (capped at 200 per call, audited as a single rollup). Recomputes status (`ready` if mapping_rate ≥ 0.5). Surfaced as a header button on `/recipes/staging`.
-   **Wikibooks Wikitext Extraction**: The Wikibooks weekly scraper fetches both the `extracts` plain text (used for instructions) and the raw `revisions[content]` wikitext (used for structured ingredient extraction). `extractIngredientsFromWikitext` parses the `==Ingredients==` section, pulls `*` bullet lines, and strips MediaWiki templates: `{{convert|...}}` (drop), `{{cb|name}}` (keep `name`), `[[Page|text]]` and `[[Page]]` (keep display text), `<ref>...</ref>`, HTML, comments, and bold/italic markers. Falls back to the legacy plain-text heuristic when no `==Ingredients==` heading is present so a row never lands with zero ingredients. Switching from plain-text to wikitext lifted average mapping rate on real cookbook pages from ~7% to ~50%+.
-   **Staging Re-extract**: `POST /api/ops/recipes/staging/reextract` (currently scoped to `source: "wikibooks"`) re-fetches each row's wikitext by `source_recipe_id` and re-runs the structured extractor + mapping. Capped at 50 per call, per-row network errors isolated, audited as a single rollup. Surfaced as a header button on `/recipes/staging` that only appears when the source filter is set to `wikibooks`. Lets us upgrade old staging rows in place after the extractor improves, instead of re-importing from MediaWiki.
-   **Recent Failed Jobs Window**: `/system` health surfaces only `failed` job runs from the last 7 days, so historical "Cleaned up from timeout" rows from prior weeks don't pollute the on-call view.
-   **Staging List Sorting**: `GET /api/ops/recipes/staging` accepts `sort` + `dir` query params. Sort keys are resolved through an allowlist (`STAGING_SORT_COLUMNS` in `routes/ops/recipesStaging.ts`) to fixed SQL fragments — unknown keys silently fall back to `createdAt` so the param can never inject SQL. `unmappedCount` sorts on `jsonb_array_length(unmapped_ingredient_names)`. A deterministic `created_at DESC` tiebreaker is always appended for stable pagination. Wired to `SortableHeader` on the staging page.
-   **Sidebar Active-State**: `Sidebar.tsx` picks the longest matching nav href as the active row (instead of any-prefix matches), so `/recipes/staging` no longer double-highlights both "Recipes" and "Recipe Staging". Generalises to any future nested route.
-   **NEON Daily Sync** (`api-server/src/jobs/handlers/neonDaily.ts`): Daily cron job (`neon:daily`, default `0 2 * * *`) that pulls upstream data from `NEON_DATABASE_URL` into the local DB. Per-table conflict policy is encoded in a single constant map: reference/catalog tables (`products`, `barcode_meta`, `product_barcodes`, `recipes`, `recipe_provider_cache`, `produce_shelf_life*`, `notification_templates`, `app_state`, `recipe_sync_state`) use `ON CONFLICT DO UPDATE` (NEON wins); user/transactional tables (`users`, `profiles`, `user_segments`, `receipt_headers`, `receipt_items`, `pantry_item_events`) use `ON CONFLICT DO NOTHING` (preserve local writes). `products_dept_backup_*` is always skipped; unknown tables default to DO NOTHING and are flagged in `summary.unknownTables`. Additive only — never deletes local rows. Sets `session_replication_role='replica'` on the destination connection to bypass FK-order issues, JSON-stringifies json/jsonb columns, batches 500 rows at a time with deterministic `ORDER BY pk`, and resets all public sequences via `setval(MAX(col))` so subsequent local inserts don't collide. No-ops gracefully (not failed) when `NEON_DATABASE_URL` is unset. Per-table errors are isolated so one bad table doesn't poison the run.
-   **Analytics Page**: All filters (day pill, view chip, event/userId text, date pickers, tab switch) reset pagination to page 1 via small setter helpers. Free-text inputs (event name, user id) are debounced 300ms via the shared `hooks/useDebounced.ts` hook (also used by `CookSessionsPage`). The events table honors the `days` rolling window — the backend `listAnalyticsEvents` accepts an optional `days` (1–90) param; explicit `from`/`to` always override. Tab queries are `enabled` only when their tab is active so switching tabs doesn't keep stale queries alive. Response types (`AnalyticsSummary`, `AnalyticsEvent`, `SearchSummaryResponse`, `RecsysSummaryResponse`) are typed end-to-end.

# External Dependencies

-   **TheMealDB**: Used for importing recipes into a staging area.
-   **OpenFoodFacts**: Pinged for external health checks.
-   **MediaWiki API (Wikibooks)**: Used as a real scraper for recipe content, with cursor-based fetching.
-   **FDC (FoodData Central) API**: Used for external health checks if an API key is configured.
-   **qrcode package**: Used for generating QR codes for TOTP setup.
-   **otplib**: Used for TOTP 2FA implementation.
-   **node-cron**: Used for scheduling in-process background jobs.
-   **express-rate-limit**: Used for API rate limiting on login and TOTP verification endpoints.