CREATE TABLE IF NOT EXISTS delivery_attempts (
    id BIGSERIAL PRIMARY KEY,

    event_id TEXT NOT NULL
        REFERENCES processed_events(event_id) ON DELETE CASCADE,

    user_id BIGINT NOT NULL,

    device_registration_id UUID NOT NULL
        REFERENCES device_registrations(id),

    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (
            status IN (
                'PENDING',
                'PROCESSING',
                'SUCCESS',
                'FAILED_RETRYABLE',
                'FAILED_PERMANENT',
                'DEAD_LETTER'
            )
        ),

    attempt_count INTEGER NOT NULL DEFAULT 0
        CHECK (attempt_count BETWEEN 0 AND 5),

    error_code TEXT,

    next_attempt_at TIMESTAMPTZ,

    claimed_at TIMESTAMPTZ,
    claim_token UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT delivery_attempts_event_device_unique
        UNIQUE (event_id, device_registration_id)
);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_due_retry
    ON delivery_attempts (next_attempt_at, id)
    WHERE status IN ('PENDING', 'FAILED_RETRYABLE');

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_event
    ON delivery_attempts (event_id);

CREATE INDEX IF NOT EXISTS idx_delivery_attempts_stale_processing
    ON delivery_attempts (claimed_at)
    WHERE status = 'PROCESSING';
