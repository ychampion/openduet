CREATE TABLE "assistant_pulse" (
	"space_id" text PRIMARY KEY NOT NULL,
	"principal_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"checked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assistant_suggestion" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"principal_id" text NOT NULL,
	"source_key" text NOT NULL,
	"dismissed" boolean DEFAULT false NOT NULL,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_pulse" ADD CONSTRAINT "assistant_pulse_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_pulse" ADD CONSTRAINT "assistant_pulse_principal_id_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_suggestion" ADD CONSTRAINT "assistant_suggestion_space_id_space_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."space"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_suggestion" ADD CONSTRAINT "assistant_suggestion_principal_id_principal_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_suggestion_source_idx" ON "assistant_suggestion" USING btree ("space_id","principal_id","source_key");