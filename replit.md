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
-   **Database Interactions**: Drizzle ORM is used for PostgreSQL interactions, including schema migrations and data manipulation. Query parameter validation for list endpoints is centralized to prevent common errors.
-   **Data Pipeline**: A lightweight, in-process scheduler runs within the `api-server` for background jobs using `node-cron`. This worker shares the same process and database pool as the API server, with atomic locking mechanisms for job execution across multiple replicas.
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
-   **System Monitoring**: External API health checks, job monitoring (stale/zombie job detection), and feature flag management.
-   **Alerting**: Outbound alert webhook integration for critical system events (job failures, cost thresholds).
-   **Bulk Moderation**: Functionality for bulk approval or rejection of user-generated content.
-   **Ingredient Mapping Service** (`api-server/src/services/ingredientMapping.ts`): Shared three-tier matcher used by the TheMealDB nightly scraper, the Wikibooks weekly scraper, and the staging "Re-map ingredients" admin action. Tier 1 = exact name/synonym; Tier 2 = exact match against a normalized noun phrase (`normalizeIngredientName` strips quantities, units, parentheticals, prep adjectives, and singularizes plurals); Tier 3 = word-boundary substring fallback (gated to ≥4 chars, ≤4 words to limit false positives), tie-broken by shortest product name. Boosted Wikibooks-import mapping rate from ~7% to ~74% in our test corpus.
-   **Staging Re-map**: `POST /api/ops/recipes/staging/remap` re-runs ingredient mapping over `imported`/`needs_review` rows (capped at 200 per call, audited as a single rollup). Recomputes status (`ready` if mapping_rate ≥ 0.5). Surfaced as a header button on `/recipes/staging`.

# External Dependencies

-   **TheMealDB**: Used for importing recipes into a staging area.
-   **OpenFoodFacts**: Pinged for external health checks.
-   **MediaWiki API (Wikibooks)**: Used as a real scraper for recipe content, with cursor-based fetching.
-   **FDC (FoodData Central) API**: Used for external health checks if an API key is configured.
-   **qrcode package**: Used for generating QR codes for TOTP setup.
-   **otplib**: Used for TOTP 2FA implementation.
-   **node-cron**: Used for scheduling in-process background jobs.
-   **express-rate-limit**: Used for API rate limiting on login and TOTP verification endpoints.