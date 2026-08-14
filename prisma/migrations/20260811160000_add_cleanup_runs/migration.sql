CREATE TABLE IF NOT EXISTS ai_core.ai_core_cleanup_runs (
    id TEXT PRIMARY KEY,
    max_age_ms INTEGER NOT NULL,
    released_count INTEGER,
    status TEXT NOT NULL DEFAULT 'RUNNING'
        CHECK (status IN ('RUNNING', 'SUCCESS', 'ERROR')),
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ai_core_cleanup_runs_status_started_idx
    ON ai_core.ai_core_cleanup_runs (status, started_at DESC);
