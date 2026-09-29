CREATE TABLE IF NOT EXISTS categories (
    id BIGINT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE
);

INSERT INTO categories (id, code)
VALUES
    (1, 'BOOK'),
    (2, 'CLOTH'),
    (3, 'ELECTRONIC'),
    (4, 'TOYS')
ON CONFLICT (id) DO NOTHING;
