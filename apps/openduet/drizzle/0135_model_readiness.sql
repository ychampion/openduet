CREATE TABLE IF NOT EXISTS "model_readiness" (
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "configuration" text NOT NULL,
  "result" jsonb NOT NULL,
  "checked_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "model_readiness_provider_model_pk" PRIMARY KEY("provider", "model")
);
