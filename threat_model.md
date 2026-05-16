# Threat Model

## Project Overview

This project is a pnpm workspace TypeScript monorepo for a recipe-management operations platform. The production application consists primarily of an Express 5 API server (`artifacts/api-server`) with PostgreSQL access through `pg`/Drizzle-related tooling, an in-process scheduler for import and maintenance jobs, Replit Object Storage integration for uploaded images, and a React/Vite administrative dashboard (`artifacts/ops-dashboard`). Generated OpenAPI clients and Zod schemas live under `lib/`. The `artifacts/mockup-sandbox` package is development-only and is not treated as production-reachable.

## Assets

- **Admin accounts and sessions** -- admin/read-only-admin credentials, JWT bearer tokens, optional TOTP secrets, and role claims. Compromise allows access to user data and operational controls.
- **User and household data** -- user emails, roles, pantry data, households, cook sessions, receipts, analytics events, notification logs, and timelines. This data can contain PII and behavioral history.
- **Recipe and moderation data** -- catalog recipes, user-created recipes, staging imports, moderation reports, edit proposals, and revision history. Tampering can affect public content and operational decisions.
- **Operational controls and audit logs** -- job schedules, manual job triggers, feature flags, alert webhooks, AI cost thresholds, and admin audit logs. Compromise can disrupt imports, hide activity, or send sensitive alerts to an attacker.
- **Application secrets and infrastructure credentials** -- `DATABASE_URL`, `SESSION_SECRET`, Object Storage sidecar credentials, optional FDC key, and alert webhook URLs. Leakage can lead to database compromise, forged sessions, or abuse of external services.
- **Uploaded object data** -- ops-uploaded images and public object assets served through API routes. Object identifiers and ACL metadata govern practical access.

## Trust Boundaries

- **Browser to API** -- all dashboard-originated requests cross from an untrusted browser into Express. The API must authenticate and authorize every `/api/ops/*` operation server-side; the client and local storage are not trusted security boundaries.
- **Public internet to storage read endpoints** -- `/api/storage/objects/*` and `/api/storage/public-objects/*` are publicly reachable. They must not expose objects that require true access control, and object paths must remain constrained to intended storage prefixes.
- **API to PostgreSQL** -- the API constructs SQL and sends it to PostgreSQL. All user-controlled values must be parameterized or resolved through fixed allowlists before interpolation.
- **Admin read vs admin write boundary** -- `read_only_admin` may view data but must not mutate users, recipes, flags, jobs, alerts, or moderation state. Mutating routes require `requireAdminWrite`.
- **API to external services** -- background jobs and health checks call TheMealDB, OpenFoodFacts, Wikibooks/MediaWiki, FDC, Replit Object Storage sidecar, and alert webhooks. URLs must be fixed or administrator-controlled in appropriate contexts, with timeouts and no exposure of secrets.
- **Scheduler / API shared process boundary** -- the scheduler runs in the API process and shares the database pool. Manual triggers and job schedule changes are write-tier admin actions and must avoid uncontrolled job names or cron expressions.
- **Production vs development boundary** -- `mockup-sandbox`, attached assets, tests, and local skills/tasks are not production surfaces unless imported by the API or dashboard build.

## Scan Anchors

- Production API entry points: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/index.ts`, `artifacts/api-server/src/routes/index.ts`, `artifacts/api-server/src/routes/storage.ts`, `artifacts/api-server/src/routes/ops/index.ts`.
- High-risk API modules: `routes/ops/auth.ts`, `routes/ops/totp.ts`, `routes/ops/users.ts`, `routes/ops/recipeDetail.ts` (includes `approveRecipe`, which sets `forceOverrideOrigin` downstream via the `[approve-flow]` audit marker), `routes/ops/recipesStaging.ts`, `routes/ops/reverseSync.ts` (dead-letter list + operator retry — retry re-POSTs through the same mapper as the cron), `routes/ops/system.ts`, `routes/ops/flags.ts`, `routes/ops/csv.ts`, `lib/objectStorage.ts`, `lib/alerts.ts`, and `jobs/scheduler.ts` (also `jobs/handlers/opsReverseSync.ts` — cursor advancement gated on `summary.errors === 0`, with non-`no_change` skips routed to `ops_sync_dead_letter` so rejections cannot silently advance past the audit cursor).
- SQL construction review should prioritize route modules using `query(...)` and helpers such as `buildOrderBy`; allowlisted `ORDER BY` fragments are acceptable, but raw request input must never be interpolated.
- Frontend token handling and API calls live in `artifacts/ops-dashboard/src/lib/auth.ts`, `lib/query-client.ts`, `App.tsx`, and generated client bootstrapping.
- Dev-only/out-of-scope for production scans unless proven reachable: `artifacts/mockup-sandbox`, tests (`*.test.ts`), `.local`, `.cache`, `attached_assets`, generated build artifacts, and local development scripts.

## Threat Categories

### Spoofing

Admins authenticate by email/password, optional TOTP, and JWT bearer tokens signed with `SESSION_SECRET`. The API must validate token signatures and expiry on every protected route, must not accept untrusted role claims without signature verification, and must ensure TOTP challenge tokens are never accepted by protected-route middleware as admin session tokens. TOTP seeds are long-lived second-factor credentials and must be encrypted or otherwise protected outside the database trust boundary. Login and TOTP verification endpoints require rate limiting to slow brute-force attacks.

### Tampering

Write-tier admin routes can change user roles, recipes, moderation decisions, staging imports, feature flags, job schedules, alert settings, and object storage contents through signed upload URLs. The server must enforce `requireAdminWrite` on all mutating routes, validate request bodies and route parameters, perform business-rule checks server-side, and record meaningful audit logs for sensitive mutations. Client-side controls in the dashboard are not sufficient authorization.

### Repudiation

Administrative changes and moderation decisions need audit records tying the action to the acting admin, target object, old/new values where practical, timestamp, and decision note. Missing audit logs on sensitive write endpoints would make abuse or mistakes hard to investigate.

### Information Disclosure

Admin routes expose user PII, household data, analytics events, receipts, AI usage, notifications, job errors, and audit logs. All `/api/ops/*` data endpoints must require at least read-tier admin access. Error responses must avoid stack traces and secret values. Logs must avoid request bodies containing passwords, TOTP codes, bearer tokens, and webhook URLs. Public object routes must only serve deliberately public/unguessable image objects, not confidential uploads.

### Denial of Service

Public login/TOTP endpoints, authenticated listing/export endpoints, object download routes, external health probes, and manual job triggers can consume CPU, database connections, storage bandwidth, or downstream API quotas. Limits, pagination caps, rate limits, request body limits, external fetch timeouts, and single-running-job locks are required to prevent abuse.

### Elevation of Privilege

The strongest risks are broken admin/write authorization, user-role changes, SQL injection, forged JWTs, TOTP bypass, path traversal in object storage paths, unsafe alert webhook handling, and scheduler/job manipulation. The API must use fixed allowlists for dynamic SQL fragments, parameterized queries for values, server-side role checks for every route, and constrained object/job identifiers.