// Source of truth: pulled from the live database via `drizzle-kit pull`.
// To regenerate after schema changes:
//   pnpm --filter @workspace/db exec drizzle-kit pull
// then move drizzle/schema.ts -> src/schema/tables.ts and drizzle/relations.ts
// -> src/schema/relations.ts. Keeping these in sync ensures the next
// `drizzle-kit push` is a no-op instead of trying to drop tables that were
// created by raw-SQL boot scripts (`ensureOpsSchema`, `ensureJobSchema`).
export * from "./tables";
export * as relations from "./relations";
