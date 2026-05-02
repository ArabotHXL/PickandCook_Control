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
- **System → Feature Flags** — view & toggle boolean flags per scope (optimistic UI; mutation audited)
- **CSV export** — Recipes (catalog + user-submissions tabs), Users, Cook Sessions, Receipts list endpoints accept `?format=csv`. Helper `lib/csv.ts` triggers an authenticated browser download. Backend escapes CSV cells and prefix-neutralizes `=+-@\t\r` to prevent formula injection in spreadsheets.

## Object Storage

- `POST /api/storage/uploads/request-url` (admin-only) returns a signed PUT URL plus a persistent `objectPath` (`/objects/<uuid>`) to save as `imageUrl`.
- `GET /api/storage/objects/*` is public (intentional — `<img>` tags cannot send Bearer tokens; identifiers are unguessable UUIDs and the bucket only stores ops-uploaded recipe imagery).
- Frontend helpers: `lib/upload.ts` exports `uploadImageFile(file)` (does request-url + PUT) and `resolveImageSrc(url)` which prefixes `/objects/...` with `/api/storage` for display.

## Auth & Login

- Admin login: `POST /api/ops/auth/login` → `{ token }`. Frontend stores in `localStorage["ops_token"]` and sends as `Authorization: Bearer …`.
- Default admin (dev seed): `admin@pickandcook.dev` / `Admin123!`.
