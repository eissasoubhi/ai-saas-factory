CREATE TABLE "api_key" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by_user_id" text,
	"name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" jsonb NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_webhook_delivery" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"endpoint_id" text NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"response_status" integer,
	"response_body_preview" text,
	"last_error" text,
	"last_attempt_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"dead_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_webhook_endpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by_user_id" text,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"event_types" jsonb NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_iv" text NOT NULL,
	"secret_tag" text NOT NULL,
	"secret_version" integer DEFAULT 1 NOT NULL,
	"disabled_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"last_delivery_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key" ADD CONSTRAINT "api_key_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_webhook_delivery" ADD CONSTRAINT "outbound_webhook_delivery_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_webhook_delivery" ADD CONSTRAINT "outbound_webhook_delivery_endpoint_id_outbound_webhook_endpoint_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."outbound_webhook_endpoint"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_webhook_endpoint" ADD CONSTRAINT "outbound_webhook_endpoint_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_webhook_endpoint" ADD CONSTRAINT "outbound_webhook_endpoint_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_key_hash_uidx" ON "api_key" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "api_key_org_created_idx" ON "api_key" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "api_key_org_revoked_idx" ON "api_key" USING btree ("organization_id","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "outbound_webhook_delivery_endpoint_event_uidx" ON "outbound_webhook_delivery" USING btree ("endpoint_id","event_id");--> statement-breakpoint
CREATE INDEX "outbound_webhook_delivery_org_created_idx" ON "outbound_webhook_delivery" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "outbound_webhook_delivery_endpoint_created_idx" ON "outbound_webhook_delivery" USING btree ("endpoint_id","created_at");--> statement-breakpoint
CREATE INDEX "outbound_webhook_delivery_org_status_idx" ON "outbound_webhook_delivery" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "outbound_webhook_endpoint_org_created_idx" ON "outbound_webhook_endpoint" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "outbound_webhook_endpoint_org_status_idx" ON "outbound_webhook_endpoint" USING btree ("organization_id","status");