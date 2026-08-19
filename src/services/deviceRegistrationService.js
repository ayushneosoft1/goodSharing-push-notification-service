import { pool } from "../db/pool.js";

export async function registerDevice({
  userId,
  deviceId,
  fcmToken,
  platform = "android",
}) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!deviceId) {
    throw new Error("deviceId is required");
  }

  if (!fcmToken) {
    throw new Error("fcmToken is required");
  }

  const query = `
    INSERT INTO device_registrations (
      user_id,
      device_id,
      fcm_token,
      platform,
      is_active,
      updated_at,
      last_seen_at
    )
    VALUES ($1, $2, $3, $4, TRUE, NOW(), NOW())
    ON CONFLICT (user_id, device_id)
    DO UPDATE SET
      fcm_token = EXCLUDED.fcm_token,
      platform = EXCLUDED.platform,
      is_active = TRUE,
      updated_at = NOW(),
      last_seen_at = NOW()
    RETURNING
      id,
      user_id,
      device_id,
      fcm_token,
      platform,
      is_active,
      created_at,
      updated_at,
      last_seen_at;
  `;

  const values = [userId, deviceId, fcmToken, platform];

  const { rows } = await pool.query(query, values);

  return rows[0];
}

export async function unregisterDevice({ userId, deviceId }) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!deviceId) {
    throw new Error("deviceId is required");
  }

  const query = `
    UPDATE device_registrations
    SET
      is_active = FALSE,
      updated_at = NOW(),
      last_seen_at = NOW()
    WHERE user_id = $1
      AND device_id = $2
    RETURNING
      id,
      user_id,
      device_id,
      fcm_token,
      platform,
      is_active,
      created_at,
      updated_at,
      last_seen_at;
  `;

  const values = [userId, deviceId];

  const { rows } = await pool.query(query, values);

  if (rows.length === 0) {
    throw new Error("Device registration not found");
  }

  return rows[0];
}
