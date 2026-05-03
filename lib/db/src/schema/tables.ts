import { pgTable, index, uuid, varchar, text, jsonb, timestamp, check, uniqueIndex, foreignKey, integer, boolean, real, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const opsAuditLog = pgTable("ops_audit_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	adminUserId: varchar("admin_user_id").notNull(),
	actionType: text("action_type").notNull(),
	targetType: text("target_type").notNull(),
	targetId: text("target_id"),
	oldValue: jsonb("old_value"),
	newValue: jsonb("new_value"),
	decisionNote: text("decision_note"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("ops_audit_log_admin_idx").using("btree", table.adminUserId.asc().nullsLast().op("text_ops")),
	index("ops_audit_log_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("ops_audit_log_target_idx").using("btree", table.targetType.asc().nullsLast().op("text_ops"), table.targetId.asc().nullsLast().op("text_ops")),
]);

export const recipeRevisions = pgTable("recipe_revisions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeKind: text("recipe_kind").notNull(),
	recipeId: text("recipe_id").notNull(),
	snapshot: jsonb().notNull(),
	editedByUserId: varchar("edited_by_user_id"),
	editedByEmail: text("edited_by_email"),
	note: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("recipe_revisions_kind_id_created_idx").using("btree", table.recipeKind.asc().nullsLast().op("timestamp_ops"), table.recipeId.asc().nullsLast().op("text_ops"), table.createdAt.desc().nullsFirst().op("timestamp_ops")),
	check("recipe_revisions_recipe_kind_check", sql`recipe_kind = ANY (ARRAY['official'::text, 'user'::text])`),
]);

export const adminTotp = pgTable("admin_totp", {
	userId: varchar("user_id").primaryKey().notNull(),
	secret: text().notNull(),
	enabledAt: timestamp("enabled_at", { mode: 'string' }),
	lastVerifiedAt: timestamp("last_verified_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
});

export const authAccounts = pgTable("auth_accounts", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	provider: text().notNull(),
	providerAccountId: text("provider_account_id").notNull(),
	email: text(),
	displayName: text("display_name"),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	tokenExpiresAt: timestamp("token_expires_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("auth_accounts_provider_unique").using("btree", table.provider.asc().nullsLast().op("text_ops"), table.providerAccountId.asc().nullsLast().op("text_ops")),
	index("auth_accounts_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "auth_accounts_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const aiInteractions = pgTable("ai_interactions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id"),
	interactionType: text("interaction_type").notNull(),
	prompt: text(),
	intentParsed: jsonb("intent_parsed"),
	resultCount: integer("result_count"),
	model: text(),
	latencyMs: integer("latency_ms"),
	success: boolean().default(true),
	errorMessage: text("error_message"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("ai_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("ai_interaction_type_idx").using("btree", table.interactionType.asc().nullsLast().op("text_ops")),
	index("ai_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const analyticsEvents = pgTable("analytics_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	event: text().notNull(),
	userId: varchar("user_id"),
	sessionId: varchar("session_id"),
	properties: jsonb().default({}),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("ae_event_created_idx").using("btree", table.event.asc().nullsLast().op("timestamp_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("ae_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
	index("ae_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const analyticsPageViews = pgTable("analytics_page_views", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: varchar("session_id"),
	userId: varchar("user_id"),
	screenName: text("screen_name").notNull(),
	enteredAt: timestamp("entered_at", { mode: 'string' }).defaultNow(),
	exitedAt: timestamp("exited_at", { mode: 'string' }),
	duration: integer(),
}, (table) => [
	index("apv_screen_entered_idx").using("btree", table.screenName.asc().nullsLast().op("text_ops"), table.enteredAt.asc().nullsLast().op("text_ops")),
	index("apv_session_id_idx").using("btree", table.sessionId.asc().nullsLast().op("text_ops")),
]);

export const analyticsSessions = pgTable("analytics_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id"),
	deviceId: varchar("device_id"),
	platform: text(),
	appVersion: text("app_version"),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow(),
	endedAt: timestamp("ended_at", { mode: 'string' }),
	duration: integer(),
}, (table) => [
	index("as_device_id_idx").using("btree", table.deviceId.asc().nullsLast().op("text_ops")),
	index("as_started_at_idx").using("btree", table.startedAt.asc().nullsLast().op("timestamp_ops")),
	index("as_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const appState = pgTable("app_state", {
	key: text().primaryKey().notNull(),
	value: text().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const contributions = pgTable("contributions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	type: text().notNull(),
	objectType: text("object_type").notNull(),
	objectId: text("object_id").notNull(),
	payload: jsonb(),
	status: text().default('submitted').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("contributions_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "contributions_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const barcodeMeta = pgTable("barcode_meta", {
	barcode: text().primaryKey().notNull(),
	source: text().default('off').notNull(),
	brand: text(),
	ingredientsText: text("ingredients_text"),
	allergens: jsonb().default([]),
	servingSize: text("serving_size"),
	imageUrl: text("image_url"),
	nutritionGrade: text("nutrition_grade"),
	novaGroup: integer("nova_group"),
	categories: jsonb().default([]),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	packageSize: text("package_size"),
	brandChecksum: text("brand_checksum"),
	nameChecksum: text("name_checksum"),
}, (table) => [
	index("barcode_meta_nutrition_grade_idx").using("btree", table.nutritionGrade.asc().nullsLast().op("text_ops")),
	index("barcode_meta_updated_at_idx").using("btree", table.updatedAt.asc().nullsLast().op("timestamp_ops")),
]);

export const cookSessions = pgTable("cook_sessions", {
	id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	recipeId: varchar("recipe_id", { length: 50 }).notNull(),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow(),
	finishedAt: timestamp("finished_at", { mode: 'string' }),
	totalSteps: integer("total_steps").default(0).notNull(),
	completedSteps: integer("completed_steps").default(0).notNull(),
	status: text().default('in_progress').notNull(),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	servings: integer().default(1),
}, (table) => [
	index("cs_recipe_id_idx").using("btree", table.recipeId.asc().nullsLast().op("text_ops")),
	index("cs_started_at_idx").using("btree", table.startedAt.asc().nullsLast().op("timestamp_ops")),
	index("cs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("cs_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "cook_sessions_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const abuseReports = pgTable("abuse_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	reporterUserId: varchar("reporter_user_id").notNull(),
	contentType: text("content_type").notNull(),
	contentId: uuid("content_id").notNull(),
	reason: text().notNull(),
	details: text(),
	status: text().default('pending').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("abuse_reports_content_idx").using("btree", table.contentType.asc().nullsLast().op("text_ops"), table.contentId.asc().nullsLast().op("text_ops")),
	uniqueIndex("abuse_reports_reporter_content_unique_idx").using("btree", table.reporterUserId.asc().nullsLast().op("uuid_ops"), table.contentType.asc().nullsLast().op("text_ops"), table.contentId.asc().nullsLast().op("text_ops")),
	index("abuse_reports_reporter_idx").using("btree", table.reporterUserId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.reporterUserId],
			foreignColumns: [users.id],
			name: "abuse_reports_reporter_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const importedRecipesStaging = pgTable("imported_recipes_staging", {
	id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
	source: text().notNull(),
	sourceRecipeId: text("source_recipe_id").notNull(),
	title: text().notNull(),
	rawPayload: jsonb("raw_payload"),
	cuisineTags: jsonb("cuisine_tags").default([]),
	moods: jsonb().default([]),
	constraints: jsonb().default([]),
	budget: text().default('$'),
	estimatedTimeMin: real("estimated_time_min").default(20),
	difficulty: text().default('Easy'),
	nutritionSummary: jsonb("nutrition_summary"),
	instructionsSummary: text("instructions_summary").default(''),
	instructionsSteps: jsonb("instructions_steps").default([]),
	requiredIngredientIds: jsonb("required_ingredient_ids").default([]),
	optionalIngredientIds: jsonb("optional_ingredient_ids").default([]),
	unmappedIngredientNames: jsonb("unmapped_ingredient_names").default([]),
	sourceUrl: text("source_url"),
	imageUrl: text("image_url"),
	status: text().default('imported').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	normalizedTitle: text("normalized_title"),
	duplicateStatus: text("duplicate_status").default('unique'),
	qualityScore: real("quality_score"),
	mappingRate: real("mapping_rate"),
	importBatchId: text("import_batch_id"),
	reviewStatus: text("review_status").default('pending'),
	servingTemperature: text("serving_temperature"),
	sweetSavoryProfile: text("sweet_savory_profile"),
	dishType: jsonb("dish_type").default([]),
	convenienceTags: jsonb("convenience_tags").default([]),
	promotedRecipeId: varchar("promoted_recipe_id"),
}, (table) => [
	uniqueIndex("imported_recipes_staging_promoted_unique").using("btree", table.promotedRecipeId.asc().nullsLast().op("text_ops")).where(sql`(promoted_recipe_id IS NOT NULL)`),
	uniqueIndex("imported_recipes_staging_source_id_idx").using("btree", table.source.asc().nullsLast().op("text_ops"), table.sourceRecipeId.asc().nullsLast().op("text_ops")),
]);

export const llmUsageDaily = pgTable("llm_usage_daily", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id"),
	usageDate: text("usage_date").notNull(),
	feature: text().notNull(),
	model: text().notNull(),
	inputTokens: integer("input_tokens").default(0).notNull(),
	outputTokens: integer("output_tokens").default(0).notNull(),
	costUsd: real("cost_usd").default(0).notNull(),
	requestCount: integer("request_count").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("llm_usage_daily_date_idx").using("btree", table.usageDate.asc().nullsLast().op("text_ops")),
	index("llm_usage_daily_feature_date_idx").using("btree", table.feature.asc().nullsLast().op("text_ops"), table.usageDate.asc().nullsLast().op("text_ops")),
	uniqueIndex("llm_usage_daily_unique_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.usageDate.asc().nullsLast().op("text_ops"), table.feature.asc().nullsLast().op("text_ops"), table.model.asc().nullsLast().op("text_ops")),
	index("llm_usage_daily_user_date_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.usageDate.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "llm_usage_daily_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const notificationLog = pgTable("notification_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	templateId: uuid("template_id"),
	category: text().notNull(),
	tone: text().notNull(),
	title: text().notNull(),
	body: text().notNull(),
	status: text().default('sent').notNull(),
	sentAt: timestamp("sent_at", { mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("notif_log_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("notif_log_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("notif_log_user_sent_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.sentAt.asc().nullsLast().op("timestamp_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "notification_log_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const jobRuns = pgTable("job_runs", {
	id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
	jobName: text("job_name").notNull(),
	runKey: text("run_key"),
	status: text().default('queued').notNull(),
	startedAt: timestamp("started_at", { mode: 'string' }),
	finishedAt: timestamp("finished_at", { mode: 'string' }),
	durationMs: integer("duration_ms"),
	summary: jsonb(),
	errorMessage: text("error_message"),
	triggeredBy: text("triggered_by").default('manual'),
	lockedUntil: timestamp("locked_until", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("job_runs_job_name_idx").using("btree", table.jobName.asc().nullsLast().op("text_ops")),
	uniqueIndex("job_runs_one_running_per_name").using("btree", table.jobName.asc().nullsLast().op("text_ops")).where(sql`(status = 'running'::text)`),
	index("job_runs_started_at_idx").using("btree", table.startedAt.asc().nullsLast().op("timestamp_ops")),
	index("job_runs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const learnedUpcMappings = pgTable("learned_upc_mappings", {
	upc: varchar({ length: 20 }).primaryKey().notNull(),
	ingredientId: text("ingredient_id").notNull(),
	productLabel: text("product_label").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const pantryDeductionReviews = pgTable("pantry_deduction_reviews", {
	id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	cookSessionId: varchar("cook_session_id"),
	suggestedItems: jsonb("suggested_items").default([]),
	confirmedItems: jsonb("confirmed_items").default([]),
	skippedItems: jsonb("skipped_items").default([]),
	adjustedItems: jsonb("adjusted_items").default([]),
	status: text().default('pending').notNull(),
	confirmedAt: timestamp("confirmed_at", { mode: 'string' }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	recipeIdSnapshot: text("recipe_id_snapshot"),
}, (table) => [
	index("pdr_cook_session_id_idx").using("btree", table.cookSessionId.asc().nullsLast().op("text_ops")),
	index("pdr_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("pdr_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("pdr_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.cookSessionId],
			foreignColumns: [cookSessions.id],
			name: "pantry_deduction_reviews_cook_session_id_cook_sessions_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "pantry_deduction_reviews_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const localNotificationTemplates = pgTable("local_notification_templates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	stage: text().notNull(),
	title: text().notNull(),
	body: text().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("local_notif_templates_stage_idx").using("btree", table.stage.asc().nullsLast().op("text_ops")),
	unique("local_notif_templates_stage_title_uniq").on(table.stage, table.title),
]);

export const mealHistory = pgTable("meal_history", {
	id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
	recipeId: varchar("recipe_id", { length: 50 }).notNull(),
	eatenAt: text("eaten_at").notNull(),
	servings: real().default(1),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const pantryItemEvents = pgTable("pantry_item_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	eventType: text("event_type").notNull(),
	ingredientId: text("ingredient_id"),
	ingredientName: text("ingredient_name"),
	sourceType: text("source_type"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("pie_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("pie_event_type_idx").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("pie_ingredient_id_idx").using("btree", table.ingredientId.asc().nullsLast().op("text_ops")),
	index("pie_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "pantry_item_events_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const notificationTemplates = pgTable("notification_templates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	category: text().notNull(),
	tone: text().notNull(),
	title: text().notNull(),
	body: text().notNull(),
	contextVars: jsonb("context_vars").default([]),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("notif_templates_category_tone_idx").using("btree", table.category.asc().nullsLast().op("text_ops"), table.tone.asc().nullsLast().op("text_ops")),
]);

export const pantryItems = pgTable("pantry_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	ingredientId: text("ingredient_id").notNull(),
	quantity: real(),
	unit: text(),
	expiryDate: text("expiry_date"),
	addedAt: timestamp("added_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	ingredientMeta: jsonb("ingredient_meta"),
	purchaseDate: text("purchase_date"),
	storageMethod: text("storage_method"),
	produceState: text("produce_state"),
	locationInHome: text("location_in_home"),
	sourceType: text("source_type").default('manual'),
	confidenceScore: real("confidence_score"),
	deletedAt: timestamp("deleted_at", { mode: 'string' }),
	householdId: uuid("household_id"),
}, (table) => [
	index("pantry_household_id_idx").using("btree", table.householdId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("pantry_user_ingredient_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.ingredientId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.householdId],
			foreignColumns: [households.id],
			name: "pantry_items_household_id_households_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "pantry_items_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const pantrySnapshotDaily = pgTable("pantry_snapshot_daily", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	snapshotDate: text("snapshot_date").notNull(),
	totalItems: integer("total_items").default(0).notNull(),
	expiringWithin3Days: integer("expiring_within_3_days").default(0),
	expiredCount: integer("expired_count").default(0),
	departmentBreakdown: jsonb("department_breakdown"),
	ingredientIds: jsonb("ingredient_ids").default([]),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	healthScore: real("health_score"),
	commonIngredients: jsonb("common_ingredients").default([]),
	expiryRate: real("expiry_rate"),
	updateFrequency: integer("update_frequency"),
}, (table) => [
	index("psd_snapshot_date_idx").using("btree", table.snapshotDate.asc().nullsLast().op("text_ops")),
	uniqueIndex("psd_user_date_unique").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.snapshotDate.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "pantry_snapshot_daily_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const editProposals = pgTable("edit_proposals", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	proposalType: text("proposal_type").notNull(),
	riskLevel: text("risk_level").notNull(),
	objectType: text("object_type").notNull(),
	objectId: text("object_id").notNull(),
	payload: jsonb().notNull(),
	status: text().default('pending').notNull(),
	createdBy: varchar("created_by").notNull(),
	reviewedBy: varchar("reviewed_by"),
	reviewNote: text("review_note"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	reviewedAt: timestamp("reviewed_at", { mode: 'string' }),
	evidence: jsonb(),
	dedupeKey: varchar("dedupe_key"),
	priorSnapshot: jsonb("prior_snapshot"),
	visibility: varchar().default('public'),
}, (table) => [
	index("edit_proposals_created_by_idx").using("btree", table.createdBy.asc().nullsLast().op("text_ops")),
	index("edit_proposals_dedupe_key_idx").using("btree", table.dedupeKey.asc().nullsLast().op("text_ops")),
	index("edit_proposals_reviewed_by_idx").using("btree", table.reviewedBy.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: "edit_proposals_created_by_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reviewedBy],
			foreignColumns: [users.id],
			name: "edit_proposals_reviewed_by_users_id_fk"
		}).onDelete("set null"),
]);

export const households = pgTable("households", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().default('My household').notNull(),
	ownerUserId: varchar("owner_user_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("households_owner_user_id_idx").using("btree", table.ownerUserId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.ownerUserId],
			foreignColumns: [users.id],
			name: "households_owner_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const products = pgTable("products", {
	id: varchar({ length: 20 }).primaryKey().notNull(),
	name: text().notNull(),
	synonyms: jsonb().default([]),
	department: text().notNull(),
	defaultUnit: text("default_unit").notNull(),
	cultureTags: jsonb("culture_tags").default([]),
	kcal: real().default(0),
	protein: real().default(0),
	carbs: real().default(0),
	fat: real().default(0),
	sodium: real().default(0),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	brand: text(),
	allergens: jsonb().default([]),
	ingredientsText: text("ingredients_text"),
	servingSize: text("serving_size"),
	fiber: real(),
	sugar: real(),
	densityGPerMl: real("density_g_per_ml"),
	edibleRatio: real("edible_ratio"),
	drainedRatio: real("drained_ratio"),
	unitGramOverrides: jsonb("unit_gram_overrides"),
	brandedFoodCategory: text("branded_food_category"),
}, (table) => [
	index("products_search_haystack_trgm_idx").using("gin", sql`(((((lower(name) || ' '::text) || COALESCE(lower(brand), ''::te`),
]);

export const profiles = pgTable("profiles", {
	userId: varchar("user_id").primaryKey().notNull(),
	displayName: text("display_name").notNull(),
	avatarUrl: text("avatar_url"),
	bio: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	featureFlags: jsonb("feature_flags").default({}),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "profiles_user_id_users_id_fk"
		}),
]);

export const productBarcodes = pgTable("product_barcodes", {
	barcode: varchar({ length: 30 }).primaryKey().notNull(),
	barcodeType: text("barcode_type").notNull(),
	productId: varchar("product_id", { length: 20 }).notNull(),
	productLabel: text("product_label"),
	source: text().default('seed').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	createdBy: varchar("created_by"),
}, (table) => [
	index("product_barcodes_label_trgm_idx").using("gin", sql`lower(COALESCE(product_label, ''::text))`),
	index("product_barcodes_product_id_idx").using("btree", table.productId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "product_barcodes_product_id_products_id_fk"
		}).onDelete("cascade"),
]);

export const productsDeptBackup20260426 = pgTable("products_dept_backup_20260426", {
	id: text().primaryKey().notNull(),
	department: text().notNull(),
	snapshottedAt: timestamp("snapshotted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const productsDeptBackup20260428 = pgTable("products_dept_backup_20260428", {
	id: text().primaryKey().notNull(),
	department: text().notNull(),
	snapshottedAt: timestamp("snapshotted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const productsDeptBackup20260428GruyereBlackpudding = pgTable("products_dept_backup_20260428_gruyere_blackpudding", {
	id: text().primaryKey().notNull(),
	department: text().notNull(),
	snapshottedAt: timestamp("snapshotted_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const pushTokens = pgTable("push_tokens", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	token: text().notNull(),
	platform: text().notNull(),
	lifecycleEnabled: boolean("lifecycle_enabled").default(true),
	lastRegisteredAt: timestamp("last_registered_at", { mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("push_tokens_token_unique").using("btree", table.token.asc().nullsLast().op("text_ops")),
	index("push_tokens_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "push_tokens_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const receiptAliasPriors = pgTable("receipt_alias_priors", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeName: text("store_name"),
	rawName: text("raw_name").notNull(),
	productId: varchar("product_id", { length: 20 }).notNull(),
	count: integer().default(1).notNull(),
	lastSeenAt: timestamp("last_seen_at", { mode: 'string' }).defaultNow(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	confidenceScore: real("confidence_score").default(0).notNull(),
}, (table) => [
	index("receipt_alias_priors_lookup_idx").using("btree", table.storeName.asc().nullsLast().op("text_ops"), table.rawName.asc().nullsLast().op("text_ops")),
	uniqueIndex("receipt_alias_priors_nullsafe_unique_idx").using("btree", sql`COALESCE(store_name, ''::text)`, sql`raw_name`, sql`product_id`),
	index("receipt_alias_priors_product_id_idx").using("btree", table.productId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "receipt_alias_priors_product_id_products_id_fk"
		}).onDelete("cascade"),
]);

export const receiptAliasPriorVoters = pgTable("receipt_alias_prior_voters", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	storeName: text("store_name"),
	rawName: text("raw_name").notNull(),
	productId: varchar("product_id", { length: 20 }).notNull(),
	userId: text("user_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("receipt_alias_prior_voters_unique_idx").using("btree", sql`COALESCE(store_name, ''::text)`, sql`raw_name`, sql`product_id`, sql`user_id`),
]);

export const receiptHeaders = pgTable("receipt_headers", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	imageUrl: text("image_url"),
	storeName: text("store_name"),
	purchasedAt: text("purchased_at"),
	subtotalCents: integer("subtotal_cents"),
	taxCents: integer("tax_cents"),
	totalCents: integer("total_cents"),
	status: text().default('uploaded').notNull(),
	structuredExtractionJson: jsonb("structured_extraction_json"),
	llmModel: text("llm_model"),
	llmCostUsd: real("llm_cost_usd"),
	llmInputTokens: integer("llm_input_tokens"),
	llmOutputTokens: integer("llm_output_tokens"),
	llmLatencyMs: integer("llm_latency_ms"),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	rawOcrText: text("raw_ocr_text"),
	imageStorageKeys: jsonb("image_storage_keys"),
	contentFingerprint: text("content_fingerprint"),
	processingPhase: text("processing_phase").default('uploaded'),
}, (table) => [
	index("receipt_headers_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("receipt_headers_user_created_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("text_ops")),
	index("receipt_headers_user_fingerprint_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.contentFingerprint.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "receipt_headers_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const receiptItems = pgTable("receipt_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	receiptId: uuid("receipt_id").notNull(),
	rawName: text("raw_name").notNull(),
	rawQty: real("raw_qty"),
	rawUnit: text("raw_unit"),
	rawPriceCents: integer("raw_price_cents"),
	normalizedName: text("normalized_name"),
	proposedProductId: varchar("proposed_product_id", { length: 20 }),
	proposedConfidence: real("proposed_confidence"),
	proposedBand: text("proposed_band"),
	finalProductId: varchar("final_product_id", { length: 20 }),
	finalAction: text("final_action"),
	barcode: varchar({ length: 30 }),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("receipt_items_final_product_id_idx").using("btree", table.finalProductId.asc().nullsLast().op("text_ops")),
	index("receipt_items_normalized_name_idx").using("btree", table.normalizedName.asc().nullsLast().op("text_ops")),
	index("receipt_items_proposed_band_idx").using("btree", table.proposedBand.asc().nullsLast().op("text_ops")),
	index("receipt_items_proposed_product_id_idx").using("btree", table.proposedProductId.asc().nullsLast().op("text_ops")),
	index("receipt_items_receipt_id_idx").using("btree", table.receiptId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.finalProductId],
			foreignColumns: [products.id],
			name: "receipt_items_final_product_id_products_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.proposedProductId],
			foreignColumns: [products.id],
			name: "receipt_items_proposed_product_id_products_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.receiptId],
			foreignColumns: [receiptHeaders.id],
			name: "receipt_items_receipt_id_receipt_headers_id_fk"
		}).onDelete("cascade"),
]);

export const recipeInteractions = pgTable("recipe_interactions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	recipeId: varchar("recipe_id", { length: 50 }).notNull(),
	interactionType: text("interaction_type").notNull(),
	rating: integer(),
	mealSlot: text("meal_slot"),
	isNomiSuggestion: boolean("is_nomi_suggestion").default(false),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("recipe_interactions_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("recipe_interactions_recipe_id_idx").using("btree", table.recipeId.asc().nullsLast().op("text_ops")),
	index("recipe_interactions_type_idx").using("btree", table.interactionType.asc().nullsLast().op("text_ops")),
	index("recipe_interactions_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "recipe_interactions_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const recipeAnalyticsDaily = pgTable("recipe_analytics_daily", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	snapshotDate: text("snapshot_date").notNull(),
	recipeId: varchar("recipe_id", { length: 50 }).notNull(),
	viewCount: integer("view_count").default(0),
	cookCount: integer("cook_count").default(0),
	skipCount: integer("skip_count").default(0),
	saveCount: integer("save_count").default(0),
	avgRating: real("avg_rating"),
	cuisineTags: jsonb("cuisine_tags").default([]),
	difficulty: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("rad_date_recipe_unique").using("btree", table.snapshotDate.asc().nullsLast().op("text_ops"), table.recipeId.asc().nullsLast().op("text_ops")),
	index("rad_recipe_id_idx").using("btree", table.recipeId.asc().nullsLast().op("text_ops")),
	index("rad_snapshot_date_idx").using("btree", table.snapshotDate.asc().nullsLast().op("text_ops")),
]);

export const produceShelfLife = pgTable("produce_shelf_life", {
	id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
	normalizedKey: text("normalized_key").notNull(),
	displayName: text("display_name").notNull(),
	category: text().default('uncategorized').notNull(),
	defaultStorage: text("default_storage").notNull(),
	roomTempMinDays: integer("room_temp_min_days"),
	roomTempMaxDays: integer("room_temp_max_days"),
	refrigeratedMinDays: integer("refrigerated_min_days"),
	refrigeratedMaxDays: integer("refrigerated_max_days"),
	frozenMinDays: integer("frozen_min_days"),
	frozenMaxDays: integer("frozen_max_days"),
	specialRule: text("special_rule").default('normal').notNull(),
	cutModifier: real("cut_modifier").default(0.55).notNull(),
	washedModifier: real("washed_modifier").default(0.85).notNull(),
	ripeModifier: real("ripe_modifier").default(0.85).notNull(),
	overripeModifier: real("overripe_modifier").default(0.65).notNull(),
	sourcePrimary: text("source_primary"),
	sourceSecondary: text("source_secondary"),
	sourceNote: text("source_note"),
	notes: text(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	unique("produce_shelf_life_normalized_key_unique").on(table.normalizedKey),
]);

export const recipeLineage = pgTable("recipe_lineage", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeId: uuid("recipe_id").notNull(),
	parentRecipeId: text("parent_recipe_id").notNull(),
	parentRecipeType: text("parent_recipe_type").notNull(),
	rootRecipeId: text("root_recipe_id").notNull(),
	rootRecipeType: text("root_recipe_type").notNull(),
	rootAuthorUserId: varchar("root_author_user_id"),
	variationDepth: integer("variation_depth").default(1).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("recipe_lineage_parent_idx").using("btree", table.parentRecipeId.asc().nullsLast().op("text_ops")),
	uniqueIndex("recipe_lineage_recipe_idx").using("btree", table.recipeId.asc().nullsLast().op("uuid_ops")),
	index("recipe_lineage_root_idx").using("btree", table.rootRecipeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [userRecipes.id],
			name: "recipe_lineage_recipe_id_user_recipes_id_fk"
		}).onDelete("cascade"),
]);

export const recipeMetricsDaily = pgTable("recipe_metrics_daily", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeId: uuid("recipe_id").notNull(),
	date: text().notNull(),
	impressions: integer().default(0).notNull(),
	detailOpens: integer("detail_opens").default(0).notNull(),
	saves: integer().default(0).notNull(),
	forks: integer().default(0).notNull(),
	shares: integer().default(0).notNull(),
	openReports: integer("open_reports").default(0).notNull(),
	resolvedReports: integer("resolved_reports").default(0).notNull(),
}, (table) => [
	index("recipe_metrics_daily_recipe_idx").using("btree", table.recipeId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("recipe_metrics_daily_unique_idx").using("btree", table.recipeId.asc().nullsLast().op("text_ops"), table.date.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [userRecipes.id],
			name: "recipe_metrics_daily_recipe_id_user_recipes_id_fk"
		}).onDelete("cascade"),
]);

export const recipeReports = pgTable("recipe_reports", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeId: uuid("recipe_id").notNull(),
	reporterUserId: varchar("reporter_user_id").notNull(),
	reason: text().notNull(),
	details: text(),
	status: text().default('open').notNull(),
	resolutionAction: text("resolution_action"),
	resolvedBy: varchar("resolved_by"),
	resolvedAt: timestamp("resolved_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("recipe_reports_one_per_user_idx").using("btree", table.recipeId.asc().nullsLast().op("text_ops"), table.reporterUserId.asc().nullsLast().op("text_ops")),
	index("recipe_reports_recipe_idx").using("btree", table.recipeId.asc().nullsLast().op("uuid_ops")),
	index("recipe_reports_recipe_status_idx").using("btree", table.recipeId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
	index("recipe_reports_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [userRecipes.id],
			name: "recipe_reports_recipe_id_user_recipes_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.reporterUserId],
			foreignColumns: [users.id],
			name: "recipe_reports_reporter_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.resolvedBy],
			foreignColumns: [users.id],
			name: "recipe_reports_resolved_by_users_id_fk"
		}).onDelete("set null"),
]);

export const recipeProviderCache = pgTable("recipe_provider_cache", {
	recipeId: text("recipe_id").primaryKey().notNull(),
	source: text().notNull(),
	sourceId: text("source_id").notNull(),
	rawHash: text("raw_hash").notNull(),
	rawJson: jsonb("raw_json").notNull(),
	fetchedAt: timestamp("fetched_at", { mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	uniqueIndex("recipe_provider_cache_source_source_id_idx").using("btree", table.source.asc().nullsLast().op("text_ops"), table.sourceId.asc().nullsLast().op("text_ops")),
]);

export const recipeSaves = pgTable("recipe_saves", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeId: uuid("recipe_id").notNull(),
	userId: varchar("user_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("recipe_saves_recipe_id_idx").using("btree", table.recipeId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("recipe_saves_user_recipe_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.recipeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [userRecipes.id],
			name: "recipe_saves_recipe_id_user_recipes_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "recipe_saves_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const recommendationEvents = pgTable("recommendation_events", {
	id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	surface: text().notNull(),
	entityType: text("entity_type").notNull(),
	entityId: text("entity_id").notNull(),
	eventType: text("event_type").notNull(),
	sessionId: varchar("session_id"),
	requestId: varchar("request_id"),
	rankPosition: integer("rank_position"),
	contextJson: jsonb("context_json"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	algoVersion: text("algo_version"),
}, (table) => [
	index("rec_events_algo_version_idx").using("btree", table.algoVersion.asc().nullsLast().op("text_ops")),
	index("rec_events_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("rec_events_entity_idx").using("btree", table.entityType.asc().nullsLast().op("text_ops"), table.entityId.asc().nullsLast().op("text_ops")),
	index("rec_events_event_type_idx").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("rec_events_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "recommendation_events_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const recipeShares = pgTable("recipe_shares", {
	token: text().primaryKey().notNull(),
	recipeId: uuid("recipe_id").notNull(),
	title: text().notNull(),
	servings: real().default(1),
	template: text(),
	ingredients: jsonb().default([]).notNull(),
	steps: jsonb().default([]).notNull(),
	notes: text(),
	nutritionCache: jsonb("nutrition_cache"),
	showAuthor: boolean("show_author").default(false).notNull(),
	authorDisplay: text("author_display"),
	likesCount: integer("likes_count").default(0).notNull(),
	revoked: boolean().default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
});

export const recipeSyncState = pgTable("recipe_sync_state", {
	source: text().primaryKey().notNull(),
	cursor: jsonb().default({}).notNull(),
	lastRunStats: jsonb("last_run_stats"),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow().notNull(),
});

export const recommendationPerformance = pgTable("recommendation_performance", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id"),
	section: text().notNull(),
	recipeId: varchar("recipe_id", { length: 50 }),
	action: text().notNull(),
	surfaceType: text("surface_type"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("rp_action_idx").using("btree", table.action.asc().nullsLast().op("text_ops")),
	index("rp_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("rp_recipe_id_idx").using("btree", table.recipeId.asc().nullsLast().op("text_ops")),
	index("rp_section_idx").using("btree", table.section.asc().nullsLast().op("text_ops")),
	index("rp_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "recommendation_performance_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const reputationLedger = pgTable("reputation_ledger", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	delta: integer().notNull(),
	reason: text().notNull(),
	refContributionId: uuid("ref_contribution_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("reputation_ledger_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "reputation_ledger_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const sessions = pgTable("sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	deviceId: text("device_id"),
	platform: text(),
	appVersion: text("app_version"),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	startedAt: timestamp("started_at", { mode: 'string' }).defaultNow(),
	lastActiveAt: timestamp("last_active_at", { mode: 'string' }).defaultNow(),
	endedAt: timestamp("ended_at", { mode: 'string' }),
	isActive: boolean("is_active").default(true),
}, (table) => [
	index("sessions_device_id_idx").using("btree", table.deviceId.asc().nullsLast().op("text_ops")),
	index("sessions_is_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	index("sessions_started_at_idx").using("btree", table.startedAt.asc().nullsLast().op("timestamp_ops")),
	index("sessions_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "sessions_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const searchEvents = pgTable("search_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id"),
	query: text().notNull(),
	resultCount: integer("result_count"),
	searchType: text("search_type").notNull(),
	filters: jsonb(),
	selectedResultId: text("selected_result_id"),
	durationMs: integer("duration_ms"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("se_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("se_search_type_idx").using("btree", table.searchType.asc().nullsLast().op("text_ops")),
	index("se_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const recipes = pgTable("recipes", {
	id: varchar({ length: 50 }).primaryKey().notNull(),
	title: text().notNull(),
	cuisineTags: jsonb("cuisine_tags").default([]),
	moods: jsonb().default([]),
	constraints: jsonb().default([]),
	budget: text().default('$').notNull(),
	requiredIngredientIds: jsonb("required_ingredient_ids").default([]),
	optionalIngredientIds: jsonb("optional_ingredient_ids").default([]),
	estimatedTimeMin: real("estimated_time_min").default(20).notNull(),
	difficulty: text().default('Easy').notNull(),
	nutritionSummary: jsonb("nutrition_summary"),
	instructionsSummary: text("instructions_summary").default('').notNull(),
	lighterVersion: jsonb("lighter_version"),
	sourceUrl: text("source_url"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	imageUrl: text("image_url"),
	servingTemperature: text("serving_temperature"),
	sweetSavoryProfile: text("sweet_savory_profile"),
	dishType: jsonb("dish_type").default([]),
	convenienceTags: jsonb("convenience_tags").default([]),
	qualityTier: text("quality_tier").default('unrated').notNull(),
	qualityIssues: jsonb("quality_issues").default([]),
	requiredQuantities: jsonb("required_quantities").default({}),
	defaultServings: integer("default_servings").default(4),
}, (table) => [
	index("recipes_constraints_idx").using("gin", table.constraints.asc().nullsLast().op("jsonb_ops")),
	index("recipes_cuisine_tags_idx").using("gin", table.cuisineTags.asc().nullsLast().op("jsonb_ops")),
	index("recipes_dish_type_idx").using("gin", table.dishType.asc().nullsLast().op("jsonb_ops")),
	index("recipes_moods_idx").using("gin", table.moods.asc().nullsLast().op("jsonb_ops")),
	index("recipes_quality_tier_idx").using("btree", table.qualityTier.asc().nullsLast().op("text_ops")),
	index("recipes_title_idx").using("btree", table.title.asc().nullsLast().op("text_ops")),
]);

export const recipeLikes = pgTable("recipe_likes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	recipeId: uuid("recipe_id").notNull(),
	userId: varchar("user_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("recipe_likes_recipe_id_idx").using("btree", table.recipeId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("recipe_likes_user_recipe_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.recipeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [userRecipes.id],
			name: "recipe_likes_recipe_id_user_recipes_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "recipe_likes_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const shoppingListEvents = pgTable("shopping_list_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	eventType: text("event_type").notNull(),
	ingredientId: text("ingredient_id"),
	ingredientName: text("ingredient_name"),
	sourceType: text("source_type"),
	metadata: jsonb(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("sle_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("sle_event_type_idx").using("btree", table.eventType.asc().nullsLast().op("text_ops")),
	index("sle_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "shopping_list_events_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const userOverrides = pgTable("user_overrides", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	overrideType: text("override_type").notNull(),
	key: text().notNull(),
	value: jsonb().notNull(),
	sourceProposalId: uuid("source_proposal_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	uniqueIndex("user_overrides_unique_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.overrideType.asc().nullsLast().op("text_ops"), table.key.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_overrides_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const systemFlags = pgTable("system_flags", {
	id: text().primaryKey().notNull(),
	flags: jsonb().default({}).notNull(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	updatedBy: varchar("updated_by"),
});

export const userEvents = pgTable("user_events", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id"),
	eventName: text("event_name").notNull(),
	eventCategory: text("event_category").notNull(),
	objectType: text("object_type"),
	objectId: text("object_id"),
	metadata: jsonb(),
	sessionId: varchar("session_id"),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("ue_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamp_ops")),
	index("ue_event_category_idx").using("btree", table.eventCategory.asc().nullsLast().op("text_ops")),
	index("ue_event_name_idx").using("btree", table.eventName.asc().nullsLast().op("text_ops")),
	index("ue_object_type_id_idx").using("btree", table.objectType.asc().nullsLast().op("text_ops"), table.objectId.asc().nullsLast().op("text_ops")),
	index("ue_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const userPreferences = pgTable("user_preferences", {
	userId: varchar("user_id").primaryKey().notNull(),
	derivedCuisines: jsonb("derived_cuisines").default([]),
	derivedIngredients: jsonb("derived_ingredients").default([]),
	derivedMealPatterns: jsonb("derived_meal_patterns"),
	avgCookTime: integer("avg_cook_time"),
	preferredDifficulty: text("preferred_difficulty"),
	cookFrequencyWeekly: real("cook_frequency_weekly"),
	lastDerivedAt: timestamp("last_derived_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	cravingFeedback: jsonb("craving_feedback"),
	shoppingBehavior: jsonb("shopping_behavior"),
	aiEngagement: jsonb("ai_engagement"),
	segmentTags: jsonb("segment_tags").default([]),
	interactionAffinity: jsonb("interaction_affinity"),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_preferences_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const userReceiptOverrides = pgTable("user_receipt_overrides", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	storeName: text("store_name"),
	rawName: text("raw_name").notNull(),
	productId: varchar("product_id", { length: 20 }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	usageCount: integer("usage_count").default(0).notNull(),
	lastUsedAt: timestamp("last_used_at", { mode: 'string' }),
}, (table) => [
	uniqueIndex("user_receipt_overrides_nullsafe_unique_idx").using("btree", sql`user_id`, sql`COALESCE(store_name, ''::text)`, sql`raw_name`),
	index("user_receipt_overrides_product_id_idx").using("btree", table.productId.asc().nullsLast().op("text_ops")),
	index("user_receipt_overrides_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "user_receipt_overrides_product_id_products_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_receipt_overrides_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const userSegments = pgTable("user_segments", {
	userId: varchar("user_id").primaryKey().notNull(),
	segments: jsonb().default([]),
	segmentScores: jsonb("segment_scores").default({}),
	lastComputedAt: timestamp("last_computed_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_segments_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const shoppingItems = pgTable("shopping_items", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	ingredientId: text("ingredient_id").notNull(),
	quantity: real(),
	unit: text(),
	checked: boolean().default(false),
	source: text(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	ingredientMeta: jsonb("ingredient_meta"),
	reasonTag: text("reason_tag"),
	priorityLevel: text("priority_level").default('normal'),
	status: text().default('active'),
	householdId: uuid("household_id"),
}, (table) => [
	uniqueIndex("shopping_user_ingredient_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.ingredientId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.householdId],
			foreignColumns: [households.id],
			name: "shopping_items_household_id_households_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "shopping_items_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const userSettings = pgTable("user_settings", {
	userId: varchar("user_id").primaryKey().notNull(),
	goalPreset: text("goal_preset"),
	customTargets: jsonb("custom_targets"),
	healthkitEnabled: boolean("healthkit_enabled").default(false),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	allergies: jsonb().default([]),
	allergyGroups: jsonb("allergy_groups").default([]),
	cookingPreferences: jsonb("cooking_preferences").default({"jumpStart":{"dismissed":false,"completedAt":null,"cookedRecipe":false,"browsedRecipe":false,"scannedBarcode":false,"addedShoppingItem":false,"addedFirstIngredient":false},"dishStyles":[],"timeBudget":30,"onboardingV2":true,"avoidCategories":[],"householdStaples":[],"staplePreference":"no_preference","firstPantryItemAt":null,"preferredCuisines":[],"shoppingTolerance":"flexible","complexityTolerance":"any","onboardingCompleted":false,"walkthroughCompleted":false}),
}, (table) => [
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_settings_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const variationComments = pgTable("variation_comments", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	variationRecipeId: uuid("variation_recipe_id").notNull(),
	authorUserId: varchar("author_user_id").notNull(),
	body: text().notNull(),
	status: text().default('active').notNull(),
	reportCount: integer("report_count").default(0).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("variation_comments_author_user_id_idx").using("btree", table.authorUserId.asc().nullsLast().op("text_ops")),
	index("variation_comments_recipe_id_idx").using("btree", table.variationRecipeId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.authorUserId],
			foreignColumns: [users.id],
			name: "variation_comments_author_user_id_users_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.variationRecipeId],
			foreignColumns: [userRecipes.id],
			name: "variation_comments_variation_recipe_id_user_recipes_id_fk"
		}).onDelete("cascade"),
]);

export const userStaples = pgTable("user_staples", {
	ingredientId: varchar("ingredient_id", { length: 20 }).primaryKey().notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
});

export const userRecipes = pgTable("user_recipes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: varchar("user_id").notNull(),
	title: text().notNull(),
	servings: real().default(1),
	template: text(),
	tags: jsonb().default([]),
	ingredients: jsonb().default([]).notNull(),
	steps: jsonb().default([]).notNull(),
	notes: text(),
	nutritionCache: jsonb("nutrition_cache"),
	status: text().default('private').notNull(),
	shareToken: text("share_token"),
	showAuthor: boolean("show_author").default(false).notNull(),
	authorDisplay: text("author_display"),
	likesCount: integer("likes_count").default(0).notNull(),
	publishedAt: timestamp("published_at", { mode: 'string' }),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
	recipeType: text("recipe_type").default('original').notNull(),
	parentRecipeId: varchar("parent_recipe_id", { length: 50 }),
	variationSummary: text("variation_summary"),
	whatChangedText: text("what_changed_text"),
	whyChangedText: text("why_changed_text"),
	pantryBenefitText: text("pantry_benefit_text"),
	timeOrBudgetBenefitText: text("time_or_budget_benefit_text"),
	ingredientChangesJson: jsonb("ingredient_changes_json"),
	stepChangesJson: jsonb("step_changes_json"),
	submissionStatus: text("submission_status").default('draft').notNull(),
	coverImageUrl: text("cover_image_url"),
	commentCount: integer("comment_count").default(0).notNull(),
	saveCount: integer("save_count").default(0).notNull(),
	reportCount: integer("report_count").default(0).notNull(),
	sourceType: text("source_type").default('user_created').notNull(),
	visibilityState: text("visibility_state").default('private').notNull(),
	parentUserRecipeId: uuid("parent_user_recipe_id"),
	canaryEnteredAt: timestamp("canary_entered_at", { mode: 'string' }),
	archivedAt: timestamp("archived_at", { mode: 'string' }),
	removedAt: timestamp("removed_at", { mode: 'string' }),
	exposureCount: integer("exposure_count").default(0).notNull(),
	positiveSignalCount: integer("positive_signal_count").default(0).notNull(),
}, (table) => [
	index("user_recipes_parent_recipe_id_idx").using("btree", table.parentRecipeId.asc().nullsLast().op("text_ops")),
	index("user_recipes_parent_user_recipe_idx").using("btree", table.parentUserRecipeId.asc().nullsLast().op("uuid_ops")),
	index("user_recipes_source_type_idx").using("btree", table.sourceType.asc().nullsLast().op("text_ops")),
	index("user_recipes_submission_parent_idx").using("btree", table.submissionStatus.asc().nullsLast().op("text_ops"), table.parentRecipeId.asc().nullsLast().op("text_ops")),
	index("user_recipes_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("user_recipes_visibility_canary_entered_idx").using("btree", table.visibilityState.asc().nullsLast().op("text_ops"), table.canaryEnteredAt.asc().nullsLast().op("text_ops")),
	index("user_recipes_visibility_idx").using("btree", table.visibilityState.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.parentRecipeId],
			foreignColumns: [recipes.id],
			name: "user_recipes_parent_recipe_id_recipes_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "user_recipes_user_id_users_id_fk"
		}).onDelete("cascade"),
]);

export const users = pgTable("users", {
	id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
	username: text().notNull(),
	password: text(),
	role: text().default('user').notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	provider: text().default('local').notNull(),
	providerId: text("provider_id"),
	lastLoginAt: timestamp("last_login_at", { mode: 'string' }),
	preferredLanguage: text("preferred_language").default('en'),
	country: text(),
	timezone: text(),
	isGuest: boolean("is_guest").default(false),
	onboardingCompleted: boolean("onboarding_completed").default(false),
	email: text(),
	emailVerifiedAt: timestamp("email_verified_at", { mode: 'string' }),
	emailVerificationToken: text("email_verification_token"),
	emailVerificationTokenExpiresAt: timestamp("email_verification_token_expires_at", { mode: 'string' }),
	passwordResetToken: text("password_reset_token"),
	passwordResetTokenExpiresAt: timestamp("password_reset_token_expires_at", { mode: 'string' }),
	tokensInvalidatedAt: timestamp("tokens_invalidated_at", { mode: 'string' }),
	passwordResetSendCount: integer("password_reset_send_count").default(0).notNull(),
	passwordResetWindowStartedAt: timestamp("password_reset_window_started_at", { mode: 'string' }),
}, (table) => [
	uniqueIndex("users_email_unique_idx").using("btree", table.email.asc().nullsLast().op("text_ops")),
	uniqueIndex("users_provider_provider_id_idx").using("btree", table.provider.asc().nullsLast().op("text_ops"), table.providerId.asc().nullsLast().op("text_ops")).where(sql`(provider_id IS NOT NULL)`),
	unique("users_username_unique").on(table.username),
]);

export const householdMembers = pgTable("household_members", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	householdId: uuid("household_id").notNull(),
	displayName: text("display_name").notNull(),
	ageGroup: text("age_group").default('adult').notNull(),
	allergies: jsonb().default([]).notNull(),
	allergyGroups: jsonb("allergy_groups").default([]).notNull(),
	dislikedIngredients: jsonb("disliked_ingredients").default([]).notNull(),
	dietaryRestrictions: jsonb("dietary_restrictions").default([]).notNull(),
	notes: text(),
	isPrimary: boolean("is_primary").default(false).notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("household_members_household_id_idx").using("btree", table.householdId.asc().nullsLast().op("uuid_ops")),
	uniqueIndex("household_members_primary_unique_idx").using("btree", table.householdId.asc().nullsLast().op("uuid_ops")).where(sql`(is_primary = true)`),
	foreignKey({
			columns: [table.householdId],
			foreignColumns: [households.id],
			name: "household_members_household_id_households_id_fk"
		}).onDelete("cascade"),
]);

export const produceShelfLifeProducts = pgTable("produce_shelf_life_products", {
	id: varchar().default(sql`gen_random_uuid()`).primaryKey().notNull(),
	produceShelfLifeId: varchar("produce_shelf_life_id").notNull(),
	productId: varchar("product_id").notNull(),
	createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
}, (table) => [
	index("pslp_produce_id_idx").using("btree", table.produceShelfLifeId.asc().nullsLast().op("text_ops")),
	uniqueIndex("pslp_produce_product_unique").using("btree", table.produceShelfLifeId.asc().nullsLast().op("text_ops"), table.productId.asc().nullsLast().op("text_ops")),
	index("pslp_product_id_idx").using("btree", table.productId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.produceShelfLifeId],
			foreignColumns: [produceShelfLife.id],
			name: "produce_shelf_life_products_produce_shelf_life_id_produce_shelf"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.productId],
			foreignColumns: [products.id],
			name: "produce_shelf_life_products_product_id_products_id_fk"
		}).onDelete("cascade"),
]);
