CREATE TABLE "personal_session" (
  "id" text PRIMARY KEY,
  "principal_id" text NOT NULL REFERENCES "principal"("id") ON DELETE CASCADE,
  "space_id" text NOT NULL REFERENCES "space"("id") ON DELETE CASCADE,
  "read_at" timestamp with time zone,
  "read_reference_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "personal_session_principal_space_idx" ON "personal_session"("principal_id", "space_id");
--> statement-breakpoint
CREATE TABLE "session_reference" (
  "id" text PRIMARY KEY,
  "session_id" text NOT NULL REFERENCES "personal_session"("id") ON DELETE CASCADE,
  "kind" text NOT NULL CHECK ("kind" IN ('conversation', 'run', 'result')),
  "job_id" text NOT NULL REFERENCES "job"("id") ON DELETE CASCADE,
  "turn_id" text REFERENCES "experience_turn"("id") ON DELETE CASCADE,
  "discussion_id" text REFERENCES "job"("id") ON DELETE SET NULL,
  "reference_key" text NOT NULL,
  "submission_key" text,
  "input_digest" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX "session_reference_key_idx" ON "session_reference"("session_id", "reference_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "session_reference_submission_idx" ON "session_reference"("session_id", "submission_key");
--> statement-breakpoint
CREATE INDEX "session_reference_discussion_idx" ON "session_reference"("discussion_id");
