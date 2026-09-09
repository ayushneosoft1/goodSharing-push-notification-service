CREATE TABLE IF NOT EXISTS category_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id BIGINT NOT NULL,
    category_id BIGINT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT category_subscriptions_user_category_unique
        UNIQUE (user_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_category_subscriptions_user_id
    ON category_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS idx_category_subscriptions_category_id
    ON category_subscriptions (category_id);
