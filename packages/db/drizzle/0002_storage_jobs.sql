CREATE TABLE "stored_file" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_by_user_id" text,
	"object_key" text NOT NULL,
	"original_name" text NOT NULL,
	"content_type" text NOT NULL,
	"expected_size_bytes" bigint NOT NULL,
	"actual_size_bytes" bigint,
	"etag" text,
	"purpose" text DEFAULT 'knowledge' NOT NULL,
	"status" text DEFAULT 'uploading' NOT NULL,
	"last_error" text,
	"uploaded_at" timestamp with time zone,
	"processing_started_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stored_file_object_key_uidx" ON "stored_file" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "stored_file_org_created_idx" ON "stored_file" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "stored_file_org_status_idx" ON "stored_file" USING btree ("organization_id","status");