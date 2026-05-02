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
- **AI / LLM Usage** — token spend & latency, broken down by model / endpoint / day
- **Cook Sessions** — active and historical cook sessions with progress, review status, recipe + user join
- **Receipts** — uploaded receipts with extracted-items modal
- **Households** — households with member count and member-detail modal (allergies, allergy groups, dislikes, dietary restrictions normalized to display strings)
- **Analytics → Search** — top queries, zero-result rate
- **Analytics → Recommendations** — recsys events by surface / event type / algo version
- **System → Feature Flags** — view & toggle boolean flags per scope (optimistic UI; mutation audited)

## Auth & Login

- Admin login: `POST /api/ops/auth/login` → `{ token }`. Frontend stores in `localStorage["ops_token"]` and sends as `Authorization: Bearer …`.
- Default admin (dev seed): `admin@pickandcook.dev` / `Admin123!`.
