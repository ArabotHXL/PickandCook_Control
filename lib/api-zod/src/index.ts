// `api.ts` exports Zod schemas (values + their inferred types) for every
// endpoint. The TS interfaces in `generated/types/` collide with several
// schema names (e.g. `OpsLoginBody` exists as both a Zod value in `api.ts`
// and a TS interface in `types/opsLoginBody.ts`). Since no external consumer
// currently uses the type-only interfaces, we only re-export the Zod side
// here. Consumers needing the raw TS interfaces can import them directly
// from `@workspace/api-zod/dist/generated/types/<file>`.
export * from "./generated/api";
export * from "./generated/types";
