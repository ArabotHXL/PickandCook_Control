import type { JobHandler } from "./runner.js";
import { recipesNightly } from "./handlers/recipesNightly.js";
import { productsNightly } from "./handlers/productsNightly.js";
import { wikibooksWeekly } from "./handlers/wikibooksWeekly.js";

export interface JobDefinition {
  name: string;
  cronExpr: string;
  description: string;
  handler: JobHandler;
}

export const JOB_DEFINITIONS: JobDefinition[] = [
  {
    name: "products:nightly",
    cronExpr: "0 3 * * *",
    description: "Lint products + backfill missing allergens/ingredients from cached barcode_meta",
    handler: productsNightly,
  },
  {
    name: "recipes:nightly",
    cronExpr: "0 4 * * *",
    description: "Pull next letter from TheMealDB → imported_recipes_staging",
    handler: recipesNightly,
  },
  {
    name: "wikibooks:weekly",
    cronExpr: "0 5 * * 0",
    description: "Wikibooks Cookbook scraper — wikitext-based ingredient extraction → imported_recipes_staging",
    handler: wikibooksWeekly,
  },
];

export function getJob(name: string): JobDefinition | undefined {
  return JOB_DEFINITIONS.find((j) => j.name === name);
}
