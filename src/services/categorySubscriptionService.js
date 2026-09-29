import { pool } from "../db/pool.js";

async function validateCategory(categoryId) {
  const { rows } = await pool.query(
    `
      SELECT id
      FROM categories
      WHERE id = $1
    `,
    [categoryId],
  );

  if (rows.length === 0) {
    throw new Error("Invalid category");
  }
}

export async function subscribeCategory({ userId, categoryId }) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!categoryId) {
    throw new Error("categoryId is required");
  }

  await validateCategory(categoryId);

  const query = `
    INSERT INTO category_subscriptions (
      user_id,
      category_id
    )
    VALUES ($1, $2)
    ON CONFLICT (user_id, category_id)
    DO NOTHING
    RETURNING
      id,
      user_id,
      category_id,
      created_at;
  `;

  const values = [userId, categoryId];

  const { rows } = await pool.query(query, values);

  return rows[0] ?? null;
}

export async function unsubscribeCategory({ userId, categoryId }) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!categoryId) {
    throw new Error("categoryId is required");
  }

  await validateCategory(categoryId);

  const query = `
    DELETE FROM category_subscriptions
    WHERE user_id = $1
      AND category_id = $2
    RETURNING
      id,
      user_id,
      category_id,
      created_at;
  `;

  const values = [userId, categoryId];

  const { rows } = await pool.query(query, values);

  return rows.length > 0;
}

export async function getUserCategorySubscriptions(userId) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const query = `
    SELECT
      id,
      user_id,
      category_id,
      created_at
    FROM category_subscriptions
    WHERE user_id = $1
    ORDER BY category_id;
  `;

  const values = [userId];

  const { rows } = await pool.query(query, values);

  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    categoryId: row.category_id,
    createdAt: row.created_at,
  }));
}
