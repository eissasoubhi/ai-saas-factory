CREATE TABLE "document_chunk" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"file_id" text NOT NULL,
	"chunk_index" integer NOT NULL,
	"content" text NOT NULL,
	"character_start" integer NOT NULL,
	"character_end" integer NOT NULL,
	"token_estimate" integer NOT NULL,
	"embedding_model_id" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chunk" ADD CONSTRAINT "document_chunk_file_id_stored_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."stored_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_chunk_file_index_uidx" ON "document_chunk" USING btree ("file_id","chunk_index");--> statement-breakpoint
CREATE INDEX "document_chunk_org_file_idx" ON "document_chunk" USING btree ("organization_id","file_id");--> statement-breakpoint
CREATE INDEX "document_chunk_org_created_idx" ON "document_chunk" USING btree ("organization_id","created_at");