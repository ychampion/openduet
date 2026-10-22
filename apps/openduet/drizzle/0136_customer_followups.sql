CREATE TABLE customer_followup (
  id text PRIMARY KEY,
  principal_id text NOT NULL REFERENCES principal(id) ON DELETE CASCADE,
  space_id text NOT NULL REFERENCES space(id) ON DELETE CASCADE,
  connection_id text NOT NULL REFERENCES connection(id) ON DELETE CASCADE,
  connection_generation integer NOT NULL,
  thread_key jsonb NOT NULL,
  customer_email text NOT NULL,
  title text NOT NULL,
  deadline_at timestamptz NOT NULL,
  time_zone text NOT NULL,
  skill_refs jsonb NOT NULL DEFAULT '[]',
  preference_refs jsonb NOT NULL DEFAULT '[]',
  latest_source_version text NOT NULL,
  baseline_outgoing text NOT NULL,
  state text NOT NULL DEFAULT 'watching',
  paused boolean NOT NULL DEFAULT false,
  next_check_at timestamptz,
  checked_at timestamptz,
  failure text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX customer_followup_scope_idx ON customer_followup(principal_id, space_id, connection_id, thread_key, customer_email, baseline_outgoing);
--> statement-breakpoint
CREATE INDEX customer_followup_due ON customer_followup(next_check_at)
  WHERE paused = false AND state IN ('watching', 'failed', 'preparing', 'prepared');
--> statement-breakpoint
CREATE TABLE customer_followup_preparation (
  id text PRIMARY KEY,
  followup_id text NOT NULL REFERENCES customer_followup(id) ON DELETE CASCADE,
  source_version text NOT NULL,
  preparation_type text NOT NULL DEFAULT 'customer_followup',
  conversation_id text REFERENCES job(id) ON DELETE SET NULL,
  turn_id text,
  draft_action_id text REFERENCES action(id) ON DELETE SET NULL,
  state text NOT NULL DEFAULT 'preparing',
  summary text NOT NULL,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX customer_followup_preparation_source_idx ON customer_followup_preparation(followup_id, source_version, preparation_type);
--> statement-breakpoint
CREATE INDEX customer_followup_preparation_conversation ON customer_followup_preparation(conversation_id);
--> statement-breakpoint
CREATE TABLE customer_followup_binding (
  job_id text PRIMARY KEY REFERENCES job(id) ON DELETE CASCADE,
  preparation_id text REFERENCES customer_followup_preparation(id) ON DELETE SET NULL,
  connection_id text NOT NULL
);
--> statement-breakpoint
CREATE INDEX customer_followup_binding_preparation ON customer_followup_binding(preparation_id);
