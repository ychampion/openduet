ALTER TABLE "push_setting" ADD COLUMN "task_results" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "push_setting" ADD COLUMN "requested_reminders" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "push_setting" ADD COLUMN "daily_brief" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "push_setting" ADD COLUMN "proactive_suggestions" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- The old settled switch covered all requested results/reminders. Preserve every opt-out.
UPDATE "push_setting" SET "task_results" = "settled", "requested_reminders" = "settled", "daily_brief" = "settled";
--> statement-breakpoint
CREATE TABLE "personal_daily_brief" (
  "space_id" text PRIMARY KEY REFERENCES "space"("id") ON DELETE CASCADE,
  "principal_id" text NOT NULL REFERENCES "principal"("id") ON DELETE CASCADE,
  "purpose" text NOT NULL DEFAULT 'personal.daily_brief',
  "trigger_id" text NOT NULL UNIQUE REFERENCES "trigger"("id") ON DELETE CASCADE
);
--> statement-breakpoint
-- Adopt an existing personal brief without changing its trigger time or turning it on.
-- Prefer a paused registration when duplicates disagree: migration must not undo an opt-out.
INSERT INTO "personal_daily_brief" ("space_id", "principal_id", "trigger_id")
SELECT DISTINCT ON (j.space_id) j.space_id, coalesce(j.principal_id, s.owner_principal_id, (SELECT id FROM owner LIMIT 1)), t.id
FROM job j JOIN space s ON s.id = j.space_id JOIN trigger t ON t.job_id = j.id
WHERE s.kind = 'personal' AND j.kind = 'routine' AND j.title = 'Your morning brief'
  AND t.kind = 'schedule'
  AND coalesce(j.principal_id, s.owner_principal_id, (SELECT id FROM owner LIMIT 1)) IS NOT NULL
  AND coalesce(j.principal_id, s.owner_principal_id, (SELECT id FROM owner LIMIT 1)) = coalesce(s.owner_principal_id, (SELECT id FROM owner LIMIT 1))
ORDER BY j.space_id, t.enabled ASC, t.created_at ASC;
--> statement-breakpoint
-- Keep the old threads/results readable; only duplicate daily-brief triggers are retired.
UPDATE trigger t SET enabled = false FROM job j, personal_daily_brief b
WHERE t.job_id = j.id AND j.space_id = b.space_id AND j.kind = 'routine'
  AND j.title = 'Your morning brief' AND t.kind = 'schedule' AND t.id <> b.trigger_id;
