ALTER TABLE ai_core.ai_core_telemetry
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'PRODUCTION';

ALTER TABLE ai_core.ai_core_spend_reservations
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'PRODUCTION';

CREATE INDEX IF NOT EXISTS ai_core_telemetry_source_created_idx
    ON ai_core.ai_core_telemetry (source, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_core_spend_reservations_source_created_idx
    ON ai_core.ai_core_spend_reservations (source, created_at DESC);
