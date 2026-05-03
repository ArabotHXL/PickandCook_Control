-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE TABLE "ops_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" varchar NOT NULL,
	"action_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"decision_note" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_kind" text NOT NULL,
	"recipe_id" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"edited_by_user_id" varchar,
	"edited_by_email" text,
	"note" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "recipe_revisions_recipe_kind_check" CHECK (recipe_kind = ANY (ARRAY['official'::text, 'user'::text]))
);
--> statement-breakpoint
CREATE TABLE "admin_totp" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"enabled_at" timestamp,
	"last_verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text,
	"display_name" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"interaction_type" text NOT NULL,
	"prompt" text,
	"intent_parsed" jsonb,
	"result_count" integer,
	"model" text,
	"latency_ms" integer,
	"success" boolean DEFAULT true,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"user_id" varchar,
	"session_id" varchar,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "analytics_page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar,
	"user_id" varchar,
	"screen_name" text NOT NULL,
	"entered_at" timestamp DEFAULT now(),
	"exited_at" timestamp,
	"duration" integer
);
--> statement-breakpoint
CREATE TABLE "analytics_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"device_id" varchar,
	"platform" text,
	"app_version" text,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp,
	"duration" integer
);
--> statement-breakpoint
CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"type" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'submitted' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "barcode_meta" (
	"barcode" text PRIMARY KEY NOT NULL,
	"source" text DEFAULT 'off' NOT NULL,
	"brand" text,
	"ingredients_text" text,
	"allergens" jsonb DEFAULT '[]'::jsonb,
	"serving_size" text,
	"image_url" text,
	"nutrition_grade" text,
	"nova_group" integer,
	"categories" jsonb DEFAULT '[]'::jsonb,
	"updated_at" timestamp DEFAULT now(),
	"package_size" text,
	"brand_checksum" text,
	"name_checksum" text
);
--> statement-breakpoint
CREATE TABLE "cook_sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"recipe_id" varchar(50) NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"finished_at" timestamp,
	"total_steps" integer DEFAULT 0 NOT NULL,
	"completed_steps" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"servings" integer DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE "abuse_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" varchar NOT NULL,
	"content_type" text NOT NULL,
	"content_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "imported_recipes_staging" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_recipe_id" text NOT NULL,
	"title" text NOT NULL,
	"raw_payload" jsonb,
	"cuisine_tags" jsonb DEFAULT '[]'::jsonb,
	"moods" jsonb DEFAULT '[]'::jsonb,
	"constraints" jsonb DEFAULT '[]'::jsonb,
	"budget" text DEFAULT '$',
	"estimated_time_min" real DEFAULT 20,
	"difficulty" text DEFAULT 'Easy',
	"nutrition_summary" jsonb,
	"instructions_summary" text DEFAULT '',
	"instructions_steps" jsonb DEFAULT '[]'::jsonb,
	"required_ingredient_ids" jsonb DEFAULT '[]'::jsonb,
	"optional_ingredient_ids" jsonb DEFAULT '[]'::jsonb,
	"unmapped_ingredient_names" jsonb DEFAULT '[]'::jsonb,
	"source_url" text,
	"image_url" text,
	"status" text DEFAULT 'imported' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"normalized_title" text,
	"duplicate_status" text DEFAULT 'unique',
	"quality_score" real,
	"mapping_rate" real,
	"import_batch_id" text,
	"review_status" text DEFAULT 'pending',
	"serving_temperature" text,
	"sweet_savory_profile" text,
	"dish_type" jsonb DEFAULT '[]'::jsonb,
	"convenience_tags" jsonb DEFAULT '[]'::jsonb,
	"promoted_recipe_id" varchar
);
--> statement-breakpoint
CREATE TABLE "llm_usage_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"usage_date" text NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"template_id" uuid,
	"category" text NOT NULL,
	"tone" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'sent' NOT NULL,
	"sent_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_name" text NOT NULL,
	"run_key" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"started_at" timestamp,
	"finished_at" timestamp,
	"duration_ms" integer,
	"summary" jsonb,
	"error_message" text,
	"triggered_by" text DEFAULT 'manual',
	"locked_until" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "learned_upc_mappings" (
	"upc" varchar(20) PRIMARY KEY NOT NULL,
	"ingredient_id" text NOT NULL,
	"product_label" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pantry_deduction_reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"cook_session_id" varchar,
	"suggested_items" jsonb DEFAULT '[]'::jsonb,
	"confirmed_items" jsonb DEFAULT '[]'::jsonb,
	"skipped_items" jsonb DEFAULT '[]'::jsonb,
	"adjusted_items" jsonb DEFAULT '[]'::jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"confirmed_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"recipe_id_snapshot" text
);
--> statement-breakpoint
CREATE TABLE "local_notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "local_notif_templates_stage_title_uniq" UNIQUE("stage","title")
);
--> statement-breakpoint
CREATE TABLE "meal_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" varchar(50) NOT NULL,
	"eaten_at" text NOT NULL,
	"servings" real DEFAULT 1,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pantry_item_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"ingredient_id" text,
	"ingredient_name" text,
	"source_type" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notification_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"tone" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"context_vars" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pantry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"ingredient_id" text NOT NULL,
	"quantity" real,
	"unit" text,
	"expiry_date" text,
	"added_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"ingredient_meta" jsonb,
	"purchase_date" text,
	"storage_method" text,
	"produce_state" text,
	"location_in_home" text,
	"source_type" text DEFAULT 'manual',
	"confidence_score" real,
	"deleted_at" timestamp,
	"household_id" uuid
);
--> statement-breakpoint
CREATE TABLE "pantry_snapshot_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"snapshot_date" text NOT NULL,
	"total_items" integer DEFAULT 0 NOT NULL,
	"expiring_within_3_days" integer DEFAULT 0,
	"expired_count" integer DEFAULT 0,
	"department_breakdown" jsonb,
	"ingredient_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"health_score" real,
	"common_ingredients" jsonb DEFAULT '[]'::jsonb,
	"expiry_rate" real,
	"update_frequency" integer
);
--> statement-breakpoint
CREATE TABLE "edit_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_type" text NOT NULL,
	"risk_level" text NOT NULL,
	"object_type" text NOT NULL,
	"object_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_by" varchar NOT NULL,
	"reviewed_by" varchar,
	"review_note" text,
	"created_at" timestamp DEFAULT now(),
	"reviewed_at" timestamp,
	"evidence" jsonb,
	"dedupe_key" varchar,
	"prior_snapshot" jsonb,
	"visibility" varchar DEFAULT 'public'
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text DEFAULT 'My household' NOT NULL,
	"owner_user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" varchar(20) PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"synonyms" jsonb DEFAULT '[]'::jsonb,
	"department" text NOT NULL,
	"default_unit" text NOT NULL,
	"culture_tags" jsonb DEFAULT '[]'::jsonb,
	"kcal" real DEFAULT 0,
	"protein" real DEFAULT 0,
	"carbs" real DEFAULT 0,
	"fat" real DEFAULT 0,
	"sodium" real DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"brand" text,
	"allergens" jsonb DEFAULT '[]'::jsonb,
	"ingredients_text" text,
	"serving_size" text,
	"fiber" real,
	"sugar" real,
	"density_g_per_ml" real,
	"edible_ratio" real,
	"drained_ratio" real,
	"unit_gram_overrides" jsonb,
	"branded_food_category" text
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"bio" text,
	"created_at" timestamp DEFAULT now(),
	"feature_flags" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "product_barcodes" (
	"barcode" varchar(30) PRIMARY KEY NOT NULL,
	"barcode_type" text NOT NULL,
	"product_id" varchar(20) NOT NULL,
	"product_label" text,
	"source" text DEFAULT 'seed' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar
);
--> statement-breakpoint
CREATE TABLE "products_dept_backup_20260426" (
	"id" text PRIMARY KEY NOT NULL,
	"department" text NOT NULL,
	"snapshotted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products_dept_backup_20260428" (
	"id" text PRIMARY KEY NOT NULL,
	"department" text NOT NULL,
	"snapshotted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products_dept_backup_20260428_gruyere_blackpudding" (
	"id" text PRIMARY KEY NOT NULL,
	"department" text NOT NULL,
	"snapshotted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"token" text NOT NULL,
	"platform" text NOT NULL,
	"lifecycle_enabled" boolean DEFAULT true,
	"last_registered_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "receipt_alias_priors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_name" text,
	"raw_name" text NOT NULL,
	"product_id" varchar(20) NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"last_seen_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"confidence_score" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_alias_prior_voters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_name" text,
	"raw_name" text NOT NULL,
	"product_id" varchar(20) NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_headers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"image_url" text,
	"store_name" text,
	"purchased_at" text,
	"subtotal_cents" integer,
	"tax_cents" integer,
	"total_cents" integer,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"structured_extraction_json" jsonb,
	"llm_model" text,
	"llm_cost_usd" real,
	"llm_input_tokens" integer,
	"llm_output_tokens" integer,
	"llm_latency_ms" integer,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"raw_ocr_text" text,
	"image_storage_keys" jsonb,
	"content_fingerprint" text,
	"processing_phase" text DEFAULT 'uploaded'
);
--> statement-breakpoint
CREATE TABLE "receipt_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_id" uuid NOT NULL,
	"raw_name" text NOT NULL,
	"raw_qty" real,
	"raw_unit" text,
	"raw_price_cents" integer,
	"normalized_name" text,
	"proposed_product_id" varchar(20),
	"proposed_confidence" real,
	"proposed_band" text,
	"final_product_id" varchar(20),
	"final_action" text,
	"barcode" varchar(30),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"recipe_id" varchar(50) NOT NULL,
	"interaction_type" text NOT NULL,
	"rating" integer,
	"meal_slot" text,
	"is_nomi_suggestion" boolean DEFAULT false,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_analytics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_date" text NOT NULL,
	"recipe_id" varchar(50) NOT NULL,
	"view_count" integer DEFAULT 0,
	"cook_count" integer DEFAULT 0,
	"skip_count" integer DEFAULT 0,
	"save_count" integer DEFAULT 0,
	"avg_rating" real,
	"cuisine_tags" jsonb DEFAULT '[]'::jsonb,
	"difficulty" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "produce_shelf_life" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized_key" text NOT NULL,
	"display_name" text NOT NULL,
	"category" text DEFAULT 'uncategorized' NOT NULL,
	"default_storage" text NOT NULL,
	"room_temp_min_days" integer,
	"room_temp_max_days" integer,
	"refrigerated_min_days" integer,
	"refrigerated_max_days" integer,
	"frozen_min_days" integer,
	"frozen_max_days" integer,
	"special_rule" text DEFAULT 'normal' NOT NULL,
	"cut_modifier" real DEFAULT 0.55 NOT NULL,
	"washed_modifier" real DEFAULT 0.85 NOT NULL,
	"ripe_modifier" real DEFAULT 0.85 NOT NULL,
	"overripe_modifier" real DEFAULT 0.65 NOT NULL,
	"source_primary" text,
	"source_secondary" text,
	"source_note" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "produce_shelf_life_normalized_key_unique" UNIQUE("normalized_key")
);
--> statement-breakpoint
CREATE TABLE "recipe_lineage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"parent_recipe_id" text NOT NULL,
	"parent_recipe_type" text NOT NULL,
	"root_recipe_id" text NOT NULL,
	"root_recipe_type" text NOT NULL,
	"root_author_user_id" varchar,
	"variation_depth" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_metrics_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"date" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"detail_opens" integer DEFAULT 0 NOT NULL,
	"saves" integer DEFAULT 0 NOT NULL,
	"forks" integer DEFAULT 0 NOT NULL,
	"shares" integer DEFAULT 0 NOT NULL,
	"open_reports" integer DEFAULT 0 NOT NULL,
	"resolved_reports" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"reporter_user_id" varchar NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution_action" text,
	"resolved_by" varchar,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_provider_cache" (
	"recipe_id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"raw_hash" text NOT NULL,
	"raw_json" jsonb NOT NULL,
	"fetched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recommendation_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"surface" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"event_type" text NOT NULL,
	"session_id" varchar,
	"request_id" varchar,
	"rank_position" integer,
	"context_json" jsonb,
	"created_at" timestamp DEFAULT now(),
	"algo_version" text
);
--> statement-breakpoint
CREATE TABLE "recipe_shares" (
	"token" text PRIMARY KEY NOT NULL,
	"recipe_id" uuid NOT NULL,
	"title" text NOT NULL,
	"servings" real DEFAULT 1,
	"template" text,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"nutrition_cache" jsonb,
	"show_author" boolean DEFAULT false NOT NULL,
	"author_display" text,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_sync_state" (
	"source" text PRIMARY KEY NOT NULL,
	"cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_run_stats" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_performance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"section" text NOT NULL,
	"recipe_id" varchar(50),
	"action" text NOT NULL,
	"surface_type" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reputation_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"ref_contribution_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"device_id" text,
	"platform" text,
	"app_version" text,
	"ip_address" text,
	"user_agent" text,
	"started_at" timestamp DEFAULT now(),
	"last_active_at" timestamp DEFAULT now(),
	"ended_at" timestamp,
	"is_active" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE "search_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"query" text NOT NULL,
	"result_count" integer,
	"search_type" text NOT NULL,
	"filters" jsonb,
	"selected_result_id" text,
	"duration_ms" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" varchar(50) PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"cuisine_tags" jsonb DEFAULT '[]'::jsonb,
	"moods" jsonb DEFAULT '[]'::jsonb,
	"constraints" jsonb DEFAULT '[]'::jsonb,
	"budget" text DEFAULT '$' NOT NULL,
	"required_ingredient_ids" jsonb DEFAULT '[]'::jsonb,
	"optional_ingredient_ids" jsonb DEFAULT '[]'::jsonb,
	"estimated_time_min" real DEFAULT 20 NOT NULL,
	"difficulty" text DEFAULT 'Easy' NOT NULL,
	"nutrition_summary" jsonb,
	"instructions_summary" text DEFAULT '' NOT NULL,
	"lighter_version" jsonb,
	"source_url" text,
	"created_at" timestamp DEFAULT now(),
	"image_url" text,
	"serving_temperature" text,
	"sweet_savory_profile" text,
	"dish_type" jsonb DEFAULT '[]'::jsonb,
	"convenience_tags" jsonb DEFAULT '[]'::jsonb,
	"quality_tier" text DEFAULT 'unrated' NOT NULL,
	"quality_issues" jsonb DEFAULT '[]'::jsonb,
	"required_quantities" jsonb DEFAULT '{}'::jsonb,
	"default_servings" integer DEFAULT 4
);
--> statement-breakpoint
CREATE TABLE "recipe_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"user_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shopping_list_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"event_type" text NOT NULL,
	"ingredient_id" text,
	"ingredient_name" text,
	"source_type" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"override_type" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"source_proposal_id" uuid,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "system_flags" (
	"id" text PRIMARY KEY NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" varchar
);
--> statement-breakpoint
CREATE TABLE "user_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"event_name" text NOT NULL,
	"event_category" text NOT NULL,
	"object_type" text,
	"object_id" text,
	"metadata" jsonb,
	"session_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"derived_cuisines" jsonb DEFAULT '[]'::jsonb,
	"derived_ingredients" jsonb DEFAULT '[]'::jsonb,
	"derived_meal_patterns" jsonb,
	"avg_cook_time" integer,
	"preferred_difficulty" text,
	"cook_frequency_weekly" real,
	"last_derived_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"craving_feedback" jsonb,
	"shopping_behavior" jsonb,
	"ai_engagement" jsonb,
	"segment_tags" jsonb DEFAULT '[]'::jsonb,
	"interaction_affinity" jsonb
);
--> statement-breakpoint
CREATE TABLE "user_receipt_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"store_name" text,
	"raw_name" text NOT NULL,
	"product_id" varchar(20),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"usage_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_segments" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb,
	"segment_scores" jsonb DEFAULT '{}'::jsonb,
	"last_computed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "shopping_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"ingredient_id" text NOT NULL,
	"quantity" real,
	"unit" text,
	"checked" boolean DEFAULT false,
	"source" text,
	"updated_at" timestamp DEFAULT now(),
	"ingredient_meta" jsonb,
	"reason_tag" text,
	"priority_level" text DEFAULT 'normal',
	"status" text DEFAULT 'active',
	"household_id" uuid
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" varchar PRIMARY KEY NOT NULL,
	"goal_preset" text,
	"custom_targets" jsonb,
	"healthkit_enabled" boolean DEFAULT false,
	"updated_at" timestamp DEFAULT now(),
	"allergies" jsonb DEFAULT '[]'::jsonb,
	"allergy_groups" jsonb DEFAULT '[]'::jsonb,
	"cooking_preferences" jsonb DEFAULT '{"jumpStart":{"dismissed":false,"completedAt":null,"cookedRecipe":false,"browsedRecipe":false,"scannedBarcode":false,"addedShoppingItem":false,"addedFirstIngredient":false},"dishStyles":[],"timeBudget":30,"onboardingV2":true,"avoidCategories":[],"householdStaples":[],"staplePreference":"no_preference","firstPantryItemAt":null,"preferredCuisines":[],"shoppingTolerance":"flexible","complexityTolerance":"any","onboardingCompleted":false,"walkthroughCompleted":false}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "variation_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variation_recipe_id" uuid NOT NULL,
	"author_user_id" varchar NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_staples" (
	"ingredient_id" varchar(20) PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"servings" real DEFAULT 1,
	"template" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"nutrition_cache" jsonb,
	"status" text DEFAULT 'private' NOT NULL,
	"share_token" text,
	"show_author" boolean DEFAULT false NOT NULL,
	"author_display" text,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"recipe_type" text DEFAULT 'original' NOT NULL,
	"parent_recipe_id" varchar(50),
	"variation_summary" text,
	"what_changed_text" text,
	"why_changed_text" text,
	"pantry_benefit_text" text,
	"time_or_budget_benefit_text" text,
	"ingredient_changes_json" jsonb,
	"step_changes_json" jsonb,
	"submission_status" text DEFAULT 'draft' NOT NULL,
	"cover_image_url" text,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"save_count" integer DEFAULT 0 NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"source_type" text DEFAULT 'user_created' NOT NULL,
	"visibility_state" text DEFAULT 'private' NOT NULL,
	"parent_user_recipe_id" uuid,
	"canary_entered_at" timestamp,
	"archived_at" timestamp,
	"removed_at" timestamp,
	"exposure_count" integer DEFAULT 0 NOT NULL,
	"positive_signal_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text,
	"role" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"provider" text DEFAULT 'local' NOT NULL,
	"provider_id" text,
	"last_login_at" timestamp,
	"preferred_language" text DEFAULT 'en',
	"country" text,
	"timezone" text,
	"is_guest" boolean DEFAULT false,
	"onboarding_completed" boolean DEFAULT false,
	"email" text,
	"email_verified_at" timestamp,
	"email_verification_token" text,
	"email_verification_token_expires_at" timestamp,
	"password_reset_token" text,
	"password_reset_token_expires_at" timestamp,
	"tokens_invalidated_at" timestamp,
	"password_reset_send_count" integer DEFAULT 0 NOT NULL,
	"password_reset_window_started_at" timestamp,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"age_group" text DEFAULT 'adult' NOT NULL,
	"allergies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allergy_groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"disliked_ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dietary_restrictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "produce_shelf_life_products" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"produce_shelf_life_id" varchar NOT NULL,
	"product_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cook_sessions" ADD CONSTRAINT "cook_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_usage_daily" ADD CONSTRAINT "llm_usage_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_deduction_reviews" ADD CONSTRAINT "pantry_deduction_reviews_cook_session_id_cook_sessions_id_fk" FOREIGN KEY ("cook_session_id") REFERENCES "public"."cook_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_deduction_reviews" ADD CONSTRAINT "pantry_deduction_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_item_events" ADD CONSTRAINT "pantry_item_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_snapshot_daily" ADD CONSTRAINT "pantry_snapshot_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_proposals" ADD CONSTRAINT "edit_proposals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "edit_proposals" ADD CONSTRAINT "edit_proposals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_tokens" ADD CONSTRAINT "push_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_alias_priors" ADD CONSTRAINT "receipt_alias_priors_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_headers" ADD CONSTRAINT "receipt_headers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_final_product_id_products_id_fk" FOREIGN KEY ("final_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_proposed_product_id_products_id_fk" FOREIGN KEY ("proposed_product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_receipt_id_receipt_headers_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipt_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_interactions" ADD CONSTRAINT "recipe_interactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lineage" ADD CONSTRAINT "recipe_lineage_recipe_id_user_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."user_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_metrics_daily" ADD CONSTRAINT "recipe_metrics_daily_recipe_id_user_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."user_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_reports" ADD CONSTRAINT "recipe_reports_recipe_id_user_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."user_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_reports" ADD CONSTRAINT "recipe_reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_reports" ADD CONSTRAINT "recipe_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_saves" ADD CONSTRAINT "recipe_saves_recipe_id_user_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."user_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_saves" ADD CONSTRAINT "recipe_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_events" ADD CONSTRAINT "recommendation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_performance" ADD CONSTRAINT "recommendation_performance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reputation_ledger" ADD CONSTRAINT "reputation_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_likes" ADD CONSTRAINT "recipe_likes_recipe_id_user_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."user_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_likes" ADD CONSTRAINT "recipe_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_list_events" ADD CONSTRAINT "shopping_list_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_overrides" ADD CONSTRAINT "user_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_receipt_overrides" ADD CONSTRAINT "user_receipt_overrides_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_receipt_overrides" ADD CONSTRAINT "user_receipt_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_segments" ADD CONSTRAINT "user_segments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variation_comments" ADD CONSTRAINT "variation_comments_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variation_comments" ADD CONSTRAINT "variation_comments_variation_recipe_id_user_recipes_id_fk" FOREIGN KEY ("variation_recipe_id") REFERENCES "public"."user_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipes" ADD CONSTRAINT "user_recipes_parent_recipe_id_recipes_id_fk" FOREIGN KEY ("parent_recipe_id") REFERENCES "public"."recipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_recipes" ADD CONSTRAINT "user_recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produce_shelf_life_products" ADD CONSTRAINT "produce_shelf_life_products_produce_shelf_life_id_produce_shelf" FOREIGN KEY ("produce_shelf_life_id") REFERENCES "public"."produce_shelf_life"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produce_shelf_life_products" ADD CONSTRAINT "produce_shelf_life_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_audit_log_admin_idx" ON "ops_audit_log" USING btree ("admin_user_id" text_ops);--> statement-breakpoint
CREATE INDEX "ops_audit_log_created_at_idx" ON "ops_audit_log" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "ops_audit_log_target_idx" ON "ops_audit_log" USING btree ("target_type" text_ops,"target_id" text_ops);--> statement-breakpoint
CREATE INDEX "recipe_revisions_kind_id_created_idx" ON "recipe_revisions" USING btree ("recipe_kind" timestamp_ops,"recipe_id" text_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "auth_accounts_provider_unique" ON "auth_accounts" USING btree ("provider" text_ops,"provider_account_id" text_ops);--> statement-breakpoint
CREATE INDEX "auth_accounts_user_id_idx" ON "auth_accounts" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "ai_created_at_idx" ON "ai_interactions" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "ai_interaction_type_idx" ON "ai_interactions" USING btree ("interaction_type" text_ops);--> statement-breakpoint
CREATE INDEX "ai_user_id_idx" ON "ai_interactions" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "ae_event_created_idx" ON "analytics_events" USING btree ("event" timestamp_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "ae_session_id_idx" ON "analytics_events" USING btree ("session_id" text_ops);--> statement-breakpoint
CREATE INDEX "ae_user_id_idx" ON "analytics_events" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "apv_screen_entered_idx" ON "analytics_page_views" USING btree ("screen_name" text_ops,"entered_at" text_ops);--> statement-breakpoint
CREATE INDEX "apv_session_id_idx" ON "analytics_page_views" USING btree ("session_id" text_ops);--> statement-breakpoint
CREATE INDEX "as_device_id_idx" ON "analytics_sessions" USING btree ("device_id" text_ops);--> statement-breakpoint
CREATE INDEX "as_started_at_idx" ON "analytics_sessions" USING btree ("started_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "as_user_id_idx" ON "analytics_sessions" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "contributions_user_id_idx" ON "contributions" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "barcode_meta_nutrition_grade_idx" ON "barcode_meta" USING btree ("nutrition_grade" text_ops);--> statement-breakpoint
CREATE INDEX "barcode_meta_updated_at_idx" ON "barcode_meta" USING btree ("updated_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "cs_recipe_id_idx" ON "cook_sessions" USING btree ("recipe_id" text_ops);--> statement-breakpoint
CREATE INDEX "cs_started_at_idx" ON "cook_sessions" USING btree ("started_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "cs_status_idx" ON "cook_sessions" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "cs_user_id_idx" ON "cook_sessions" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "abuse_reports_content_idx" ON "abuse_reports" USING btree ("content_type" text_ops,"content_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "abuse_reports_reporter_content_unique_idx" ON "abuse_reports" USING btree ("reporter_user_id" uuid_ops,"content_type" text_ops,"content_id" text_ops);--> statement-breakpoint
CREATE INDEX "abuse_reports_reporter_idx" ON "abuse_reports" USING btree ("reporter_user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "imported_recipes_staging_promoted_unique" ON "imported_recipes_staging" USING btree ("promoted_recipe_id" text_ops) WHERE (promoted_recipe_id IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "imported_recipes_staging_source_id_idx" ON "imported_recipes_staging" USING btree ("source" text_ops,"source_recipe_id" text_ops);--> statement-breakpoint
CREATE INDEX "llm_usage_daily_date_idx" ON "llm_usage_daily" USING btree ("usage_date" text_ops);--> statement-breakpoint
CREATE INDEX "llm_usage_daily_feature_date_idx" ON "llm_usage_daily" USING btree ("feature" text_ops,"usage_date" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "llm_usage_daily_unique_idx" ON "llm_usage_daily" USING btree ("user_id" text_ops,"usage_date" text_ops,"feature" text_ops,"model" text_ops);--> statement-breakpoint
CREATE INDEX "llm_usage_daily_user_date_idx" ON "llm_usage_daily" USING btree ("user_id" text_ops,"usage_date" text_ops);--> statement-breakpoint
CREATE INDEX "notif_log_category_idx" ON "notification_log" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "notif_log_user_id_idx" ON "notification_log" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "notif_log_user_sent_idx" ON "notification_log" USING btree ("user_id" text_ops,"sent_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "job_runs_job_name_idx" ON "job_runs" USING btree ("job_name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "job_runs_one_running_per_name" ON "job_runs" USING btree ("job_name" text_ops) WHERE (status = 'running'::text);--> statement-breakpoint
CREATE INDEX "job_runs_started_at_idx" ON "job_runs" USING btree ("started_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "job_runs_status_idx" ON "job_runs" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "pdr_cook_session_id_idx" ON "pantry_deduction_reviews" USING btree ("cook_session_id" text_ops);--> statement-breakpoint
CREATE INDEX "pdr_created_at_idx" ON "pantry_deduction_reviews" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "pdr_status_idx" ON "pantry_deduction_reviews" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "pdr_user_id_idx" ON "pantry_deduction_reviews" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "local_notif_templates_stage_idx" ON "local_notification_templates" USING btree ("stage" text_ops);--> statement-breakpoint
CREATE INDEX "pie_created_at_idx" ON "pantry_item_events" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "pie_event_type_idx" ON "pantry_item_events" USING btree ("event_type" text_ops);--> statement-breakpoint
CREATE INDEX "pie_ingredient_id_idx" ON "pantry_item_events" USING btree ("ingredient_id" text_ops);--> statement-breakpoint
CREATE INDEX "pie_user_id_idx" ON "pantry_item_events" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "notif_templates_category_tone_idx" ON "notification_templates" USING btree ("category" text_ops,"tone" text_ops);--> statement-breakpoint
CREATE INDEX "pantry_household_id_idx" ON "pantry_items" USING btree ("household_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "pantry_user_ingredient_idx" ON "pantry_items" USING btree ("user_id" text_ops,"ingredient_id" text_ops);--> statement-breakpoint
CREATE INDEX "psd_snapshot_date_idx" ON "pantry_snapshot_daily" USING btree ("snapshot_date" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "psd_user_date_unique" ON "pantry_snapshot_daily" USING btree ("user_id" text_ops,"snapshot_date" text_ops);--> statement-breakpoint
CREATE INDEX "edit_proposals_created_by_idx" ON "edit_proposals" USING btree ("created_by" text_ops);--> statement-breakpoint
CREATE INDEX "edit_proposals_dedupe_key_idx" ON "edit_proposals" USING btree ("dedupe_key" text_ops);--> statement-breakpoint
CREATE INDEX "edit_proposals_reviewed_by_idx" ON "edit_proposals" USING btree ("reviewed_by" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "households_owner_user_id_idx" ON "households" USING btree ("owner_user_id" text_ops);--> statement-breakpoint
CREATE INDEX "products_search_haystack_trgm_idx" ON "products" USING gin ((((((lower(name) || ' '::text) || COALESCE(lower(brand), ''::te gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_barcodes_label_trgm_idx" ON "product_barcodes" USING gin (lower(COALESCE(product_label, ''::text)) gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "product_barcodes_product_id_idx" ON "product_barcodes" USING btree ("product_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "push_tokens_token_unique" ON "push_tokens" USING btree ("token" text_ops);--> statement-breakpoint
CREATE INDEX "push_tokens_user_id_idx" ON "push_tokens" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "receipt_alias_priors_lookup_idx" ON "receipt_alias_priors" USING btree ("store_name" text_ops,"raw_name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_alias_priors_nullsafe_unique_idx" ON "receipt_alias_priors" USING btree (COALESCE(store_name, ''::text) text_ops,raw_name text_ops,product_id text_ops);--> statement-breakpoint
CREATE INDEX "receipt_alias_priors_product_id_idx" ON "receipt_alias_priors" USING btree ("product_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "receipt_alias_prior_voters_unique_idx" ON "receipt_alias_prior_voters" USING btree (COALESCE(store_name, ''::text) text_ops,raw_name text_ops,product_id text_ops,user_id text_ops);--> statement-breakpoint
CREATE INDEX "receipt_headers_status_idx" ON "receipt_headers" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "receipt_headers_user_created_idx" ON "receipt_headers" USING btree ("user_id" text_ops,"created_at" text_ops);--> statement-breakpoint
CREATE INDEX "receipt_headers_user_fingerprint_idx" ON "receipt_headers" USING btree ("user_id" text_ops,"content_fingerprint" text_ops);--> statement-breakpoint
CREATE INDEX "receipt_items_final_product_id_idx" ON "receipt_items" USING btree ("final_product_id" text_ops);--> statement-breakpoint
CREATE INDEX "receipt_items_normalized_name_idx" ON "receipt_items" USING btree ("normalized_name" text_ops);--> statement-breakpoint
CREATE INDEX "receipt_items_proposed_band_idx" ON "receipt_items" USING btree ("proposed_band" text_ops);--> statement-breakpoint
CREATE INDEX "receipt_items_proposed_product_id_idx" ON "receipt_items" USING btree ("proposed_product_id" text_ops);--> statement-breakpoint
CREATE INDEX "receipt_items_receipt_id_idx" ON "receipt_items" USING btree ("receipt_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "recipe_interactions_created_at_idx" ON "recipe_interactions" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "recipe_interactions_recipe_id_idx" ON "recipe_interactions" USING btree ("recipe_id" text_ops);--> statement-breakpoint
CREATE INDEX "recipe_interactions_type_idx" ON "recipe_interactions" USING btree ("interaction_type" text_ops);--> statement-breakpoint
CREATE INDEX "recipe_interactions_user_id_idx" ON "recipe_interactions" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "rad_date_recipe_unique" ON "recipe_analytics_daily" USING btree ("snapshot_date" text_ops,"recipe_id" text_ops);--> statement-breakpoint
CREATE INDEX "rad_recipe_id_idx" ON "recipe_analytics_daily" USING btree ("recipe_id" text_ops);--> statement-breakpoint
CREATE INDEX "rad_snapshot_date_idx" ON "recipe_analytics_daily" USING btree ("snapshot_date" text_ops);--> statement-breakpoint
CREATE INDEX "recipe_lineage_parent_idx" ON "recipe_lineage" USING btree ("parent_recipe_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_lineage_recipe_idx" ON "recipe_lineage" USING btree ("recipe_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "recipe_lineage_root_idx" ON "recipe_lineage" USING btree ("root_recipe_id" text_ops);--> statement-breakpoint
CREATE INDEX "recipe_metrics_daily_recipe_idx" ON "recipe_metrics_daily" USING btree ("recipe_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_metrics_daily_unique_idx" ON "recipe_metrics_daily" USING btree ("recipe_id" text_ops,"date" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_reports_one_per_user_idx" ON "recipe_reports" USING btree ("recipe_id" text_ops,"reporter_user_id" text_ops);--> statement-breakpoint
CREATE INDEX "recipe_reports_recipe_idx" ON "recipe_reports" USING btree ("recipe_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "recipe_reports_recipe_status_idx" ON "recipe_reports" USING btree ("recipe_id" text_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX "recipe_reports_status_idx" ON "recipe_reports" USING btree ("status" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_provider_cache_source_source_id_idx" ON "recipe_provider_cache" USING btree ("source" text_ops,"source_id" text_ops);--> statement-breakpoint
CREATE INDEX "recipe_saves_recipe_id_idx" ON "recipe_saves" USING btree ("recipe_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_saves_user_recipe_idx" ON "recipe_saves" USING btree ("user_id" text_ops,"recipe_id" text_ops);--> statement-breakpoint
CREATE INDEX "rec_events_algo_version_idx" ON "recommendation_events" USING btree ("algo_version" text_ops);--> statement-breakpoint
CREATE INDEX "rec_events_created_at_idx" ON "recommendation_events" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "rec_events_entity_idx" ON "recommendation_events" USING btree ("entity_type" text_ops,"entity_id" text_ops);--> statement-breakpoint
CREATE INDEX "rec_events_event_type_idx" ON "recommendation_events" USING btree ("event_type" text_ops);--> statement-breakpoint
CREATE INDEX "rec_events_user_id_idx" ON "recommendation_events" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "rp_action_idx" ON "recommendation_performance" USING btree ("action" text_ops);--> statement-breakpoint
CREATE INDEX "rp_created_at_idx" ON "recommendation_performance" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "rp_recipe_id_idx" ON "recommendation_performance" USING btree ("recipe_id" text_ops);--> statement-breakpoint
CREATE INDEX "rp_section_idx" ON "recommendation_performance" USING btree ("section" text_ops);--> statement-breakpoint
CREATE INDEX "rp_user_id_idx" ON "recommendation_performance" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "reputation_ledger_user_id_idx" ON "reputation_ledger" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "sessions_device_id_idx" ON "sessions" USING btree ("device_id" text_ops);--> statement-breakpoint
CREATE INDEX "sessions_is_active_idx" ON "sessions" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "sessions_started_at_idx" ON "sessions" USING btree ("started_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "se_created_at_idx" ON "search_events" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "se_search_type_idx" ON "search_events" USING btree ("search_type" text_ops);--> statement-breakpoint
CREATE INDEX "se_user_id_idx" ON "search_events" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "recipes_constraints_idx" ON "recipes" USING gin ("constraints" jsonb_ops);--> statement-breakpoint
CREATE INDEX "recipes_cuisine_tags_idx" ON "recipes" USING gin ("cuisine_tags" jsonb_ops);--> statement-breakpoint
CREATE INDEX "recipes_dish_type_idx" ON "recipes" USING gin ("dish_type" jsonb_ops);--> statement-breakpoint
CREATE INDEX "recipes_moods_idx" ON "recipes" USING gin ("moods" jsonb_ops);--> statement-breakpoint
CREATE INDEX "recipes_quality_tier_idx" ON "recipes" USING btree ("quality_tier" text_ops);--> statement-breakpoint
CREATE INDEX "recipes_title_idx" ON "recipes" USING btree ("title" text_ops);--> statement-breakpoint
CREATE INDEX "recipe_likes_recipe_id_idx" ON "recipe_likes" USING btree ("recipe_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_likes_user_recipe_idx" ON "recipe_likes" USING btree ("user_id" text_ops,"recipe_id" text_ops);--> statement-breakpoint
CREATE INDEX "sle_created_at_idx" ON "shopping_list_events" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "sle_event_type_idx" ON "shopping_list_events" USING btree ("event_type" text_ops);--> statement-breakpoint
CREATE INDEX "sle_user_id_idx" ON "shopping_list_events" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "user_overrides_unique_idx" ON "user_overrides" USING btree ("user_id" text_ops,"override_type" text_ops,"key" text_ops);--> statement-breakpoint
CREATE INDEX "ue_created_at_idx" ON "user_events" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "ue_event_category_idx" ON "user_events" USING btree ("event_category" text_ops);--> statement-breakpoint
CREATE INDEX "ue_event_name_idx" ON "user_events" USING btree ("event_name" text_ops);--> statement-breakpoint
CREATE INDEX "ue_object_type_id_idx" ON "user_events" USING btree ("object_type" text_ops,"object_id" text_ops);--> statement-breakpoint
CREATE INDEX "ue_user_id_idx" ON "user_events" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "user_receipt_overrides_nullsafe_unique_idx" ON "user_receipt_overrides" USING btree (user_id text_ops,COALESCE(store_name, ''::text) text_ops,raw_name text_ops);--> statement-breakpoint
CREATE INDEX "user_receipt_overrides_product_id_idx" ON "user_receipt_overrides" USING btree ("product_id" text_ops);--> statement-breakpoint
CREATE INDEX "user_receipt_overrides_user_idx" ON "user_receipt_overrides" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_user_ingredient_idx" ON "shopping_items" USING btree ("user_id" text_ops,"ingredient_id" text_ops);--> statement-breakpoint
CREATE INDEX "variation_comments_author_user_id_idx" ON "variation_comments" USING btree ("author_user_id" text_ops);--> statement-breakpoint
CREATE INDEX "variation_comments_recipe_id_idx" ON "variation_comments" USING btree ("variation_recipe_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "user_recipes_parent_recipe_id_idx" ON "user_recipes" USING btree ("parent_recipe_id" text_ops);--> statement-breakpoint
CREATE INDEX "user_recipes_parent_user_recipe_idx" ON "user_recipes" USING btree ("parent_user_recipe_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "user_recipes_source_type_idx" ON "user_recipes" USING btree ("source_type" text_ops);--> statement-breakpoint
CREATE INDEX "user_recipes_submission_parent_idx" ON "user_recipes" USING btree ("submission_status" text_ops,"parent_recipe_id" text_ops);--> statement-breakpoint
CREATE INDEX "user_recipes_user_id_idx" ON "user_recipes" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "user_recipes_visibility_canary_entered_idx" ON "user_recipes" USING btree ("visibility_state" text_ops,"canary_entered_at" text_ops);--> statement-breakpoint
CREATE INDEX "user_recipes_visibility_idx" ON "user_recipes" USING btree ("visibility_state" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique_idx" ON "users" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_provider_provider_id_idx" ON "users" USING btree ("provider" text_ops,"provider_id" text_ops) WHERE (provider_id IS NOT NULL);--> statement-breakpoint
CREATE INDEX "household_members_household_id_idx" ON "household_members" USING btree ("household_id" uuid_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "household_members_primary_unique_idx" ON "household_members" USING btree ("household_id" uuid_ops) WHERE (is_primary = true);--> statement-breakpoint
CREATE INDEX "pslp_produce_id_idx" ON "produce_shelf_life_products" USING btree ("produce_shelf_life_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "pslp_produce_product_unique" ON "produce_shelf_life_products" USING btree ("produce_shelf_life_id" text_ops,"product_id" text_ops);--> statement-breakpoint
CREATE INDEX "pslp_product_id_idx" ON "produce_shelf_life_products" USING btree ("product_id" text_ops);
*/