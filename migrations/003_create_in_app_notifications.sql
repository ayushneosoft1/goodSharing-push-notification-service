CREATE TABLE IF NOT EXISTS in_app_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id BIGINT NOT NULL,

    title TEXT NOT NULL,
    message TEXT NOT NULL,

    post_id BIGINT NULL,

    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    read_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_read
    ON in_app_notifications (user_id, is_read);

CREATE INDEX IF NOT EXISTS idx_in_app_notifications_user_created
    ON in_app_notifications (user_id, created_at DESC);
