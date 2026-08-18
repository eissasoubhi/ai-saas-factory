CREATE TABLE "usage_credit_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_user_id" text,
	"period_key" text NOT NULL,
	"kind" text NOT NULL,
	"amount_micros" bigint NOT NULL,
	"source" text NOT NULL,
	"reference_id" text,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb,
	"effective_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_credit_ledger" ADD CONSTRAINT "usage_credit_ledger_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_credit_ledger" ADD CONSTRAINT "usage_credit_ledger_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_credit_ledger_idempotency_uidx" ON "usage_credit_ledger" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "usage_credit_ledger_org_period_effective_idx" ON "usage_credit_ledger" USING btree ("organization_id","period_key","effective_at");