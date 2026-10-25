ALTER TABLE in_app_notifications
    ADD COLUMN IF NOT EXISTS event_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS
    idx_in_app_notifications_user_event
    ON in_app_notifications (user_id, event_id)
    WHERE event_id IS NOT NULL;
