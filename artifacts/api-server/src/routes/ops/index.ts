import type { Express } from "express";
import { requireAdmin, opsLogin, opsMe } from "./auth.js";
import { getOverviewMetrics, getOpsFunnel } from "./overview.js";
import { listUsers, getUserDetail, setUserRole } from "./users.js";
import { listPantryItems, flagPantryItem } from "./pantry.js";
import {
  listProducts,
  listUnknownBarcodes,
  listProductProposals,
  decideProductProposal,
} from "./products.js";
import {
  listRecipes,
  setRecipeQuality,
  listUserCreatedRecipes,
  decideUserRecipe,
  listRecipeReports,
} from "./recipes.js";
import { listModeration, decideModeration } from "./moderation.js";
import { listAnalyticsEvents, getAnalyticsSummary } from "./analytics.js";
import {
  listNotificationTemplates,
  listNotificationLog,
} from "./notifications.js";
import { getSystemHealth, listJobRuns } from "./system.js";
import { listAuditLog } from "./auditLog.js";
import { getAiUsageSummary, listAiInteractions } from "./aiUsage.js";
import { listCookSessions, listPantryDeductionReviews } from "./cookSessions.js";
import { listReceipts, getReceiptDetail } from "./receipts.js";
import { listHouseholds, getHouseholdMembers } from "./households.js";
import { getSearchSummary, getRecsysSummary } from "./searchRecsys.js";
import { listFlags, updateFlag } from "./flags.js";

export function registerOpsRoutes(app: Express): void {
  // ── Auth (no admin middleware) ───────────────────────────────────────────
  app.post("/api/ops/auth/login", opsLogin);
  app.get("/api/ops/auth/me", requireAdmin, opsMe);

  // ── Overview ─────────────────────────────────────────────────────────────
  app.get("/api/ops/overview/metrics", requireAdmin, getOverviewMetrics);
  app.get("/api/ops/overview/funnel", requireAdmin, getOpsFunnel);

  // ── Users ─────────────────────────────────────────────────────────────────
  app.get("/api/ops/users", requireAdmin, listUsers);
  app.get("/api/ops/users/:userId", requireAdmin, getUserDetail);
  app.patch("/api/ops/users/:userId/role", requireAdmin, setUserRole);

  // ── Pantry ────────────────────────────────────────────────────────────────
  app.get("/api/ops/pantry/items", requireAdmin, listPantryItems);
  app.post("/api/ops/pantry/items/:itemId/flag", requireAdmin, flagPantryItem);

  // ── Products ──────────────────────────────────────────────────────────────
  app.get("/api/ops/products", requireAdmin, listProducts);
  app.get("/api/ops/products/barcodes/unknown", requireAdmin, listUnknownBarcodes);
  app.get("/api/ops/products/proposals", requireAdmin, listProductProposals);
  app.post("/api/ops/products/proposals/:proposalId/decide", requireAdmin, decideProductProposal);

  // ── Recipes ───────────────────────────────────────────────────────────────
  app.get("/api/ops/recipes", requireAdmin, listRecipes);
  app.patch("/api/ops/recipes/:recipeId/quality", requireAdmin, setRecipeQuality);
  app.get("/api/ops/recipes/user-created", requireAdmin, listUserCreatedRecipes);
  app.post("/api/ops/recipes/user-created/:recipeId/decide", requireAdmin, decideUserRecipe);
  app.get("/api/ops/recipes/reports", requireAdmin, listRecipeReports);

  // ── Moderation ────────────────────────────────────────────────────────────
  app.get("/api/ops/moderation", requireAdmin, listModeration);
  app.post("/api/ops/moderation/:reportId/decide", requireAdmin, decideModeration);

  // ── Analytics ─────────────────────────────────────────────────────────────
  app.get("/api/ops/analytics/events", requireAdmin, listAnalyticsEvents);
  app.get("/api/ops/analytics/summary", requireAdmin, getAnalyticsSummary);
  app.get("/api/ops/analytics/search", requireAdmin, getSearchSummary);
  app.get("/api/ops/analytics/recsys", requireAdmin, getRecsysSummary);

  // ── Notifications ─────────────────────────────────────────────────────────
  app.get("/api/ops/notifications/templates", requireAdmin, listNotificationTemplates);
  app.get("/api/ops/notifications/log", requireAdmin, listNotificationLog);

  // ── AI / LLM Usage ────────────────────────────────────────────────────────
  app.get("/api/ops/ai/summary", requireAdmin, getAiUsageSummary);
  app.get("/api/ops/ai/interactions", requireAdmin, listAiInteractions);

  // ── Cook Sessions ─────────────────────────────────────────────────────────
  app.get("/api/ops/cook-sessions", requireAdmin, listCookSessions);
  app.get("/api/ops/cook-sessions/deduction-reviews", requireAdmin, listPantryDeductionReviews);

  // ── Receipts ──────────────────────────────────────────────────────────────
  app.get("/api/ops/receipts", requireAdmin, listReceipts);
  app.get("/api/ops/receipts/:receiptId", requireAdmin, getReceiptDetail);

  // ── Households ────────────────────────────────────────────────────────────
  app.get("/api/ops/households", requireAdmin, listHouseholds);
  app.get("/api/ops/households/:householdId/members", requireAdmin, getHouseholdMembers);

  // ── System ────────────────────────────────────────────────────────────────
  app.get("/api/ops/system/health", requireAdmin, getSystemHealth);
  app.get("/api/ops/system/jobs", requireAdmin, listJobRuns);
  app.get("/api/ops/system/flags", requireAdmin, listFlags);
  app.patch("/api/ops/system/flags/:scopeId", requireAdmin, updateFlag);

  // ── Audit ─────────────────────────────────────────────────────────────────
  app.get("/api/ops/audit", requireAdmin, listAuditLog);
}
