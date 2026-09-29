DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_category_subscriptions_category'
          AND conrelid = 'category_subscriptions'::regclass
    ) THEN
        ALTER TABLE category_subscriptions
        ADD CONSTRAINT fk_category_subscriptions_category
        FOREIGN KEY (category_id)
        REFERENCES categories(id);
    END IF;
END
$$;
