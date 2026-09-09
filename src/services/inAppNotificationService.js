import { pool } from "../db/pool.js";

export async function getNotifications({ userId, limit = 20, offset = 0 }) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const query = `
    SELECT
      id,
      user_id,
      title,
      message,
      post_id,
      is_read,
      created_at,
      read_at
    FROM in_app_notifications
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    OFFSET $3;
  `;

  const values = [userId, safeLimit, safeOffset];

  const { rows } = await pool.query(query, values);

  return rows;
}

export async function getUnreadNotificationCount(userId) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const query = `
    SELECT COUNT(*)::int AS count
    FROM in_app_notifications
    WHERE user_id = $1
      AND is_read = FALSE;
  `;

  const values = [userId];

  const { rows } = await pool.query(query, values);

  return rows[0].count;
}

export async function markNotificationRead({ userId, notificationId }) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!notificationId) {
    throw new Error("notificationId is required");
  }

  const query = `
    UPDATE in_app_notifications
    SET
      is_read = TRUE,
      read_at = COALESCE(read_at, NOW())
    WHERE id = $1
      AND user_id = $2
    RETURNING
      id;
  `;

  const values = [notificationId, userId];

  const { rows } = await pool.query(query, values);

  return rows.length > 0;
}

export async function markAllNotificationsRead(userId) {
  if (!userId) {
    throw new Error("userId is required");
  }

  const query = `
    UPDATE in_app_notifications
    SET
      is_read = TRUE,
      read_at = COALESCE(read_at, NOW())
    WHERE user_id = $1
      AND is_read = FALSE;
  `;

  const values = [userId];

  await pool.query(query, values);

  return true;
}
