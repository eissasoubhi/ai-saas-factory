ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "provider_price_id" text;
ALTER TABLE "subscription" ADD COLUMN IF NOT EXISTS "provider_updated_at" timestamp with time zone;
ALTER TABLE "webhook_event" ADD COLUMN IF NOT EXISTS "processing_started_at" timestamp with time zone;

CREATE UNIQUE INDEX IF NOT EXISTS "subscription_provider_customer_uidx"
  ON "subscription" ("provider_customer_id")
  WHERE "provider_customer_id" IS NOT NULL;
