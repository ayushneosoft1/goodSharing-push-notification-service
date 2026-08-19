CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS device_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL,
    device_id TEXT NOT NULL,
    fcm_token TEXT NOT NULL,

    platform TEXT NOT NULL DEFAULT 'android',

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT device_registrations_user_device_unique
        UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_registrations_user_id
    ON device_registrations (user_id);

CREATE INDEX IF NOT EXISTS idx_device_registrations_active
    ON device_registrations (is_active);

CREATE INDEX IF NOT EXISTS idx_device_registrations_fcm_token
    ON device_registrations (fcm_token);
