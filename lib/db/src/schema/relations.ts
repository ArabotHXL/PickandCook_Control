import { relations } from "drizzle-orm/relations";
import { users, authAccounts, contributions, cookSessions, abuseReports, llmUsageDaily, notificationLog, pantryDeductionReviews, pantryItemEvents, households, pantryItems, pantrySnapshotDaily, editProposals, profiles, products, productBarcodes, pushTokens, receiptAliasPriors, receiptHeaders, receiptItems, recipeInteractions, userRecipes, recipeLineage, recipeMetricsDaily, recipeReports, recipeSaves, recommendationEvents, recommendationPerformance, reputationLedger, sessions, recipeLikes, shoppingListEvents, userOverrides, userPreferences, userReceiptOverrides, userSegments, shoppingItems, userSettings, variationComments, recipes, householdMembers, produceShelfLife, produceShelfLifeProducts } from "./tables";

export const authAccountsRelations = relations(authAccounts, ({one}) => ({
	user: one(users, {
		fields: [authAccounts.userId],
		references: [users.id]
	}),
}));

export const usersRelations = relations(users, ({many}) => ({
	authAccounts: many(authAccounts),
	contributions: many(contributions),
	cookSessions: many(cookSessions),
	abuseReports: many(abuseReports),
	llmUsageDailies: many(llmUsageDaily),
	notificationLogs: many(notificationLog),
	pantryDeductionReviews: many(pantryDeductionReviews),
	pantryItemEvents: many(pantryItemEvents),
	pantryItems: many(pantryItems),
	pantrySnapshotDailies: many(pantrySnapshotDaily),
	editProposals_createdBy: many(editProposals, {
		relationName: "editProposals_createdBy_users_id"
	}),
	editProposals_reviewedBy: many(editProposals, {
		relationName: "editProposals_reviewedBy_users_id"
	}),
	households: many(households),
	profiles: many(profiles),
	pushTokens: many(pushTokens),
	receiptHeaders: many(receiptHeaders),
	recipeInteractions: many(recipeInteractions),
	recipeReports_reporterUserId: many(recipeReports, {
		relationName: "recipeReports_reporterUserId_users_id"
	}),
	recipeReports_resolvedBy: many(recipeReports, {
		relationName: "recipeReports_resolvedBy_users_id"
	}),
	recipeSaves: many(recipeSaves),
	recommendationEvents: many(recommendationEvents),
	recommendationPerformances: many(recommendationPerformance),
	reputationLedgers: many(reputationLedger),
	sessions: many(sessions),
	recipeLikes: many(recipeLikes),
	shoppingListEvents: many(shoppingListEvents),
	userOverrides: many(userOverrides),
	userPreferences: many(userPreferences),
	userReceiptOverrides: many(userReceiptOverrides),
	userSegments: many(userSegments),
	shoppingItems: many(shoppingItems),
	userSettings: many(userSettings),
	variationComments: many(variationComments),
	userRecipes: many(userRecipes),
}));

export const contributionsRelations = relations(contributions, ({one}) => ({
	user: one(users, {
		fields: [contributions.userId],
		references: [users.id]
	}),
}));

export const cookSessionsRelations = relations(cookSessions, ({one, many}) => ({
	user: one(users, {
		fields: [cookSessions.userId],
		references: [users.id]
	}),
	pantryDeductionReviews: many(pantryDeductionReviews),
}));

export const abuseReportsRelations = relations(abuseReports, ({one}) => ({
	user: one(users, {
		fields: [abuseReports.reporterUserId],
		references: [users.id]
	}),
}));

export const llmUsageDailyRelations = relations(llmUsageDaily, ({one}) => ({
	user: one(users, {
		fields: [llmUsageDaily.userId],
		references: [users.id]
	}),
}));

export const notificationLogRelations = relations(notificationLog, ({one}) => ({
	user: one(users, {
		fields: [notificationLog.userId],
		references: [users.id]
	}),
}));

export const pantryDeductionReviewsRelations = relations(pantryDeductionReviews, ({one}) => ({
	cookSession: one(cookSessions, {
		fields: [pantryDeductionReviews.cookSessionId],
		references: [cookSessions.id]
	}),
	user: one(users, {
		fields: [pantryDeductionReviews.userId],
		references: [users.id]
	}),
}));

export const pantryItemEventsRelations = relations(pantryItemEvents, ({one}) => ({
	user: one(users, {
		fields: [pantryItemEvents.userId],
		references: [users.id]
	}),
}));

export const pantryItemsRelations = relations(pantryItems, ({one}) => ({
	household: one(households, {
		fields: [pantryItems.householdId],
		references: [households.id]
	}),
	user: one(users, {
		fields: [pantryItems.userId],
		references: [users.id]
	}),
}));

export const householdsRelations = relations(households, ({one, many}) => ({
	pantryItems: many(pantryItems),
	user: one(users, {
		fields: [households.ownerUserId],
		references: [users.id]
	}),
	shoppingItems: many(shoppingItems),
	householdMembers: many(householdMembers),
}));

export const pantrySnapshotDailyRelations = relations(pantrySnapshotDaily, ({one}) => ({
	user: one(users, {
		fields: [pantrySnapshotDaily.userId],
		references: [users.id]
	}),
}));

export const editProposalsRelations = relations(editProposals, ({one}) => ({
	user_createdBy: one(users, {
		fields: [editProposals.createdBy],
		references: [users.id],
		relationName: "editProposals_createdBy_users_id"
	}),
	user_reviewedBy: one(users, {
		fields: [editProposals.reviewedBy],
		references: [users.id],
		relationName: "editProposals_reviewedBy_users_id"
	}),
}));

export const profilesRelations = relations(profiles, ({one}) => ({
	user: one(users, {
		fields: [profiles.userId],
		references: [users.id]
	}),
}));

export const productBarcodesRelations = relations(productBarcodes, ({one}) => ({
	product: one(products, {
		fields: [productBarcodes.productId],
		references: [products.id]
	}),
}));

export const productsRelations = relations(products, ({many}) => ({
	productBarcodes: many(productBarcodes),
	receiptAliasPriors: many(receiptAliasPriors),
	receiptItems_finalProductId: many(receiptItems, {
		relationName: "receiptItems_finalProductId_products_id"
	}),
	receiptItems_proposedProductId: many(receiptItems, {
		relationName: "receiptItems_proposedProductId_products_id"
	}),
	userReceiptOverrides: many(userReceiptOverrides),
	produceShelfLifeProducts: many(produceShelfLifeProducts),
}));

export const pushTokensRelations = relations(pushTokens, ({one}) => ({
	user: one(users, {
		fields: [pushTokens.userId],
		references: [users.id]
	}),
}));

export const receiptAliasPriorsRelations = relations(receiptAliasPriors, ({one}) => ({
	product: one(products, {
		fields: [receiptAliasPriors.productId],
		references: [products.id]
	}),
}));

export const receiptHeadersRelations = relations(receiptHeaders, ({one, many}) => ({
	user: one(users, {
		fields: [receiptHeaders.userId],
		references: [users.id]
	}),
	receiptItems: many(receiptItems),
}));

export const receiptItemsRelations = relations(receiptItems, ({one}) => ({
	product_finalProductId: one(products, {
		fields: [receiptItems.finalProductId],
		references: [products.id],
		relationName: "receiptItems_finalProductId_products_id"
	}),
	product_proposedProductId: one(products, {
		fields: [receiptItems.proposedProductId],
		references: [products.id],
		relationName: "receiptItems_proposedProductId_products_id"
	}),
	receiptHeader: one(receiptHeaders, {
		fields: [receiptItems.receiptId],
		references: [receiptHeaders.id]
	}),
}));

export const recipeInteractionsRelations = relations(recipeInteractions, ({one}) => ({
	user: one(users, {
		fields: [recipeInteractions.userId],
		references: [users.id]
	}),
}));

export const recipeLineageRelations = relations(recipeLineage, ({one}) => ({
	userRecipe: one(userRecipes, {
		fields: [recipeLineage.recipeId],
		references: [userRecipes.id]
	}),
}));

export const userRecipesRelations = relations(userRecipes, ({one, many}) => ({
	recipeLineages: many(recipeLineage),
	recipeMetricsDailies: many(recipeMetricsDaily),
	recipeReports: many(recipeReports),
	recipeSaves: many(recipeSaves),
	recipeLikes: many(recipeLikes),
	variationComments: many(variationComments),
	recipe: one(recipes, {
		fields: [userRecipes.parentRecipeId],
		references: [recipes.id]
	}),
	user: one(users, {
		fields: [userRecipes.userId],
		references: [users.id]
	}),
}));

export const recipeMetricsDailyRelations = relations(recipeMetricsDaily, ({one}) => ({
	userRecipe: one(userRecipes, {
		fields: [recipeMetricsDaily.recipeId],
		references: [userRecipes.id]
	}),
}));

export const recipeReportsRelations = relations(recipeReports, ({one}) => ({
	userRecipe: one(userRecipes, {
		fields: [recipeReports.recipeId],
		references: [userRecipes.id]
	}),
	user_reporterUserId: one(users, {
		fields: [recipeReports.reporterUserId],
		references: [users.id],
		relationName: "recipeReports_reporterUserId_users_id"
	}),
	user_resolvedBy: one(users, {
		fields: [recipeReports.resolvedBy],
		references: [users.id],
		relationName: "recipeReports_resolvedBy_users_id"
	}),
}));

export const recipeSavesRelations = relations(recipeSaves, ({one}) => ({
	userRecipe: one(userRecipes, {
		fields: [recipeSaves.recipeId],
		references: [userRecipes.id]
	}),
	user: one(users, {
		fields: [recipeSaves.userId],
		references: [users.id]
	}),
}));

export const recommendationEventsRelations = relations(recommendationEvents, ({one}) => ({
	user: one(users, {
		fields: [recommendationEvents.userId],
		references: [users.id]
	}),
}));

export const recommendationPerformanceRelations = relations(recommendationPerformance, ({one}) => ({
	user: one(users, {
		fields: [recommendationPerformance.userId],
		references: [users.id]
	}),
}));

export const reputationLedgerRelations = relations(reputationLedger, ({one}) => ({
	user: one(users, {
		fields: [reputationLedger.userId],
		references: [users.id]
	}),
}));

export const sessionsRelations = relations(sessions, ({one}) => ({
	user: one(users, {
		fields: [sessions.userId],
		references: [users.id]
	}),
}));

export const recipeLikesRelations = relations(recipeLikes, ({one}) => ({
	userRecipe: one(userRecipes, {
		fields: [recipeLikes.recipeId],
		references: [userRecipes.id]
	}),
	user: one(users, {
		fields: [recipeLikes.userId],
		references: [users.id]
	}),
}));

export const shoppingListEventsRelations = relations(shoppingListEvents, ({one}) => ({
	user: one(users, {
		fields: [shoppingListEvents.userId],
		references: [users.id]
	}),
}));

export const userOverridesRelations = relations(userOverrides, ({one}) => ({
	user: one(users, {
		fields: [userOverrides.userId],
		references: [users.id]
	}),
}));

export const userPreferencesRelations = relations(userPreferences, ({one}) => ({
	user: one(users, {
		fields: [userPreferences.userId],
		references: [users.id]
	}),
}));

export const userReceiptOverridesRelations = relations(userReceiptOverrides, ({one}) => ({
	product: one(products, {
		fields: [userReceiptOverrides.productId],
		references: [products.id]
	}),
	user: one(users, {
		fields: [userReceiptOverrides.userId],
		references: [users.id]
	}),
}));

export const userSegmentsRelations = relations(userSegments, ({one}) => ({
	user: one(users, {
		fields: [userSegments.userId],
		references: [users.id]
	}),
}));

export const shoppingItemsRelations = relations(shoppingItems, ({one}) => ({
	household: one(households, {
		fields: [shoppingItems.householdId],
		references: [households.id]
	}),
	user: one(users, {
		fields: [shoppingItems.userId],
		references: [users.id]
	}),
}));

export const userSettingsRelations = relations(userSettings, ({one}) => ({
	user: one(users, {
		fields: [userSettings.userId],
		references: [users.id]
	}),
}));

export const variationCommentsRelations = relations(variationComments, ({one}) => ({
	user: one(users, {
		fields: [variationComments.authorUserId],
		references: [users.id]
	}),
	userRecipe: one(userRecipes, {
		fields: [variationComments.variationRecipeId],
		references: [userRecipes.id]
	}),
}));

export const recipesRelations = relations(recipes, ({many}) => ({
	userRecipes: many(userRecipes),
}));

export const householdMembersRelations = relations(householdMembers, ({one}) => ({
	household: one(households, {
		fields: [householdMembers.householdId],
		references: [households.id]
	}),
}));

export const produceShelfLifeProductsRelations = relations(produceShelfLifeProducts, ({one}) => ({
	produceShelfLife: one(produceShelfLife, {
		fields: [produceShelfLifeProducts.produceShelfLifeId],
		references: [produceShelfLife.id]
	}),
	product: one(products, {
		fields: [produceShelfLifeProducts.productId],
		references: [products.id]
	}),
}));

export const produceShelfLifeRelations = relations(produceShelfLife, ({many}) => ({
	produceShelfLifeProducts: many(produceShelfLifeProducts),
}));