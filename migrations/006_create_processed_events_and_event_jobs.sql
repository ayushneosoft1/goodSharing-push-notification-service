CREATE TABLE IF NOT EXISTS processed_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS event_jobs (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE
        REFERENCES processed_events(event_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    claimed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_event_jobs_pending
    ON event_jobs (created_at, id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_event_jobs_stale_processing
    ON event_jobs (claimed_at)
    WHERE status = 'processing';
