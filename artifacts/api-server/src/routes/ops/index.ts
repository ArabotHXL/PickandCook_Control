import type { Express } from "express";
import rateLimit from "express-rate-limit";
import { requireAdmin, requireAdminWrite, opsLogin, opsMe, verifyTotpLogin } from "./auth.js";
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
import {
  listStagingRecipes,
  getStagingDetail,
  updateStagingRecipe,
  promoteStagingRecipe,
  rejectStagingRecipe,
  remapStagingIngredients,
} from "./recipesStaging.js";
import {
  getRecipeDetail,
  updateRecipe,
  listRecipeRevisions,
  restoreRecipeRevision,
  getUserRecipeDetail,
} from "./recipeDetail.js";
import { listModeration, decideModeration, bulkDecideModeration } from "./moderation.js";
import { listAnalyticsEvents, getAnalyticsSummary } from "./analytics.js";
import {
  listNotificationTemplates,
  listNotificationLog,
} from "./notifications.js";
import {
  getSystemHealth,
  listJobRuns,
  clearStuckJobs,
  listAvailableJobs,
  triggerJob,
  getExternalHealth,
  sendTestAlert,
} from "./system.js";
import { listAuditLog } from "./auditLog.js";
import { getAiUsageSummary, listAiInteractions } from "./aiUsage.js";
import { getAiAlerts, setAiCostThreshold } from "./aiAlerts.js";
import { listCookSessions, listPantryDeductionReviews } from "./cookSessions.js";
import { listReceipts, getReceiptDetail } from "./receipts.js";
import { listHouseholds, getHouseholdMembers } from "./households.js";
import { getSearchSummary, getRecsysSummary } from "./searchRecsys.js";
import { listFlags, updateFlag } from "./flags.js";
import { getUserTimeline } from "./userTimeline.js";
import {
  getTotpStatus,
  startTotpSetup,
  verifyTotpSetup,
  disableTotp,
} from "./totp.js";

// Throttle login attempts to slow brute-force probing. Counts attempts per IP
// (the global proxy forwards the original client IP via X-Forwarded-For; we
// trust it because all traffic enters through Replit's proxy).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts; please try again later." },
});

export function registerOpsRoutes(app: Express): void {
  // Required for express-rate-limit to read X-Forwarded-For correctly behind
  // the Replit shared proxy.
  app.set("trust proxy", 1);

  // ── Auth (no admin middleware) ───────────────────────────────────────────
  app.post("/api/ops/auth/login", loginLimiter, opsLogin);
  app.post("/api/ops/auth/2fa/verify-login", loginLimiter, verifyTotpLogin);
  app.get("/api/ops/auth/me", requireAdmin, opsMe);
  // ── Self-service 2FA (any admin tier) ────────────────────────────────────
  app.get("/api/ops/auth/2fa/status", requireAdmin, getTotpStatus);
  app.post("/api/ops/auth/2fa/setup", requireAdmin, startTotpSetup);
  app.post("/api/ops/auth/2fa/verify-setup", requireAdmin, verifyTotpSetup);
  app.post("/api/ops/auth/2fa/disable", requireAdmin, disableTotp);

  // ── Overview ─────────────────────────────────────────────────────────────
  app.get("/api/ops/overview/metrics", requireAdmin, getOverviewMetrics);
  app.get("/api/ops/overview/funnel", requireAdmin, getOpsFunnel);

  // ── Users ─────────────────────────────────────────────────────────────────
  app.get("/api/ops/users", requireAdmin, listUsers);
  app.get("/api/ops/users/:userId", requireAdmin, getUserDetail);
  app.get("/api/ops/users/:userId/timeline", requireAdmin, getUserTimeline);
  app.patch("/api/ops/users/:userId/role", requireAdminWrite, setUserRole);

  // ── Pantry ────────────────────────────────────────────────────────────────
  app.get("/api/ops/pantry/items", requireAdmin, listPantryItems);
  app.post("/api/ops/pantry/items/:itemId/flag", requireAdminWrite, flagPantryItem);

  // ── Products ──────────────────────────────────────────────────────────────
  app.get("/api/ops/products", requireAdmin, listProducts);
  app.get("/api/ops/products/barcodes/unknown", requireAdmin, listUnknownBarcodes);
  app.get("/api/ops/products/proposals", requireAdmin, listProductProposals);
  app.post("/api/ops/products/proposals/:proposalId/decide", requireAdminWrite, decideProductProposal);

  // ── Recipes ───────────────────────────────────────────────────────────────
  app.get("/api/ops/recipes", requireAdmin, listRecipes);
  // NOTE: order matters – static segments before :recipeId
  app.get("/api/ops/recipes/user-created", requireAdmin, listUserCreatedRecipes);
  app.post("/api/ops/recipes/user-created/:recipeId/decide", requireAdminWrite, decideUserRecipe);
  app.get("/api/ops/recipes/user-created/:recipeId", requireAdmin, getUserRecipeDetail);
  app.get("/api/ops/recipes/reports", requireAdmin, listRecipeReports);
  // Staging promotion (TheMealDB / Wikibooks imports waiting for human review)
  app.get("/api/ops/recipes/staging", requireAdmin, listStagingRecipes);
  app.post("/api/ops/recipes/staging/remap", requireAdminWrite, remapStagingIngredients);
  app.get("/api/ops/recipes/staging/:stagingId", requireAdmin, getStagingDetail);
  app.patch("/api/ops/recipes/staging/:stagingId", requireAdminWrite, updateStagingRecipe);
  app.post("/api/ops/recipes/staging/:stagingId/promote", requireAdminWrite, promoteStagingRecipe);
  app.post("/api/ops/recipes/staging/:stagingId/reject", requireAdminWrite, rejectStagingRecipe);
  app.get("/api/ops/recipes/:recipeId/revisions", requireAdmin, listRecipeRevisions);
  app.post(
    "/api/ops/recipes/:recipeId/revisions/:revisionId/restore",
    requireAdminWrite,
    restoreRecipeRevision
  );
  app.get("/api/ops/recipes/:recipeId", requireAdmin, getRecipeDetail);
  app.patch("/api/ops/recipes/:recipeId", requireAdminWrite, updateRecipe);
  app.patch("/api/ops/recipes/:recipeId/quality", requireAdminWrite, setRecipeQuality);

  // ── Moderation ────────────────────────────────────────────────────────────
  app.get("/api/ops/moderation", requireAdmin, listModeration);
  app.post("/api/ops/moderation/bulk-decide", requireAdminWrite, bulkDecideModeration);
  app.post("/api/ops/moderation/:reportId/decide", requireAdminWrite, decideModeration);

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
  app.get("/api/ops/ai/alerts", requireAdmin, getAiAlerts);
  app.patch("/api/ops/ai/alerts/threshold", requireAdminWrite, setAiCostThreshold);

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
  app.get("/api/ops/system/external-health", requireAdmin, getExternalHealth);
  app.get("/api/ops/system/jobs", requireAdmin, listJobRuns);
  app.post("/api/ops/system/jobs/clear-stuck", requireAdminWrite, clearStuckJobs);
  app.get("/api/ops/system/jobs/available", requireAdmin, listAvailableJobs);
  app.post("/api/ops/system/jobs/:jobName/trigger", requireAdminWrite, triggerJob);
  app.get("/api/ops/system/flags", requireAdmin, listFlags);
  app.patch("/api/ops/system/flags/:scopeId", requireAdminWrite, updateFlag);
  app.post("/api/ops/system/alerts/test", requireAdminWrite, sendTestAlert);

  // ── Audit ─────────────────────────────────────────────────────────────────
  app.get("/api/ops/audit", requireAdmin, listAuditLog);
}
