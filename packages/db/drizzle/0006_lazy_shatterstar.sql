CREATE TABLE "stripe_meter_submission" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"ledger_entry_id" text NOT NULL,
	"period_key" text NOT NULL,
	"provider_customer_id" text NOT NULL,
	"event_name" text NOT NULL,
	"value_micros" bigint NOT NULL,
	"provider_identifier" text NOT NULL,
	"metered_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"processing_started_at" timestamp with time zone,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stripe_meter_submission" ADD CONSTRAINT "stripe_meter_submission_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_meter_submission" ADD CONSTRAINT "stripe_meter_submission_ledger_entry_id_usage_credit_ledger_id_fk" FOREIGN KEY ("ledger_entry_id") REFERENCES "public"."usage_credit_ledger"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_meter_submission_ledger_entry_uidx" ON "stripe_meter_submission" USING btree ("ledger_entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_meter_submission_provider_identifier_uidx" ON "stripe_meter_submission" USING btree ("provider_identifier");--> statement-breakpoint
CREATE INDEX "stripe_meter_submission_org_period_status_idx" ON "stripe_meter_submission" USING btree ("organization_id","period_key","status");