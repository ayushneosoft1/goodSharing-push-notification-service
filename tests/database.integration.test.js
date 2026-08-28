import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../src/db/pool.js";
import {
  registerDevice,
  unregisterDevice,
} from "../src/services/deviceRegistrationService.js";

const TEST_PREFIX = `vitest-${Date.now()}`;

describe("Database-backed device registration constraints", () => {
  beforeAll(async () => {
    await pool.query("SELECT 1");
  });

  afterAll(async () => {
    // Remove only rows created by this test run.
    await pool.query(
      `
        DELETE FROM device_registrations
        WHERE device_id LIKE $1
      `,
      [`${TEST_PREFIX}-%`],
    );

    await pool.end();
  });

  it("should create device_registrations with user_id as BIGINT", async () => {
    const { rows } = await pool.query(
      `
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'device_registrations'
          AND column_name = 'user_id'
      `,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].data_type).toBe("bigint");
  });

  it("should have a unique constraint on user_id and device_id", async () => {
    const { rows } = await pool.query(
      `
        SELECT
          con.conname AS constraint_name,
          pg_get_constraintdef(con.oid) AS constraint_definition
        FROM pg_constraint con
        JOIN pg_class rel
          ON rel.oid = con.conrelid
        JOIN pg_namespace nsp
          ON nsp.oid = rel.relnamespace
        WHERE rel.relname = 'device_registrations'
          AND nsp.nspname = 'public'
          AND con.contype = 'u'
      `,
    );

    const constraint = rows.find((row) =>
      row.constraint_definition.includes("(user_id, device_id)"),
    );

    expect(constraint).toBeDefined();
  });

  it("should have a partial unique index for active FCM tokens", async () => {
    const { rows } = await pool.query(
      `
        SELECT
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'device_registrations'
      `,
    );

    const index = rows.find(
      (row) =>
        row.indexname === "idx_device_registrations_active_fcm_token_unique",
    );

    expect(index).toBeDefined();
    expect(index.indexdef).toContain("UNIQUE");
    expect(index.indexdef).toContain("(fcm_token)");
    expect(index.indexdef).toContain("WHERE (is_active = true)");
  });

  it("should reject duplicate active FCM tokens for different users", async () => {
    const deviceA = `${TEST_PREFIX}-device-a`;
    const deviceB = `${TEST_PREFIX}-device-b`;
    const token = `${TEST_PREFIX}-same-token`;

    await pool.query(
      `
        INSERT INTO device_registrations (
          user_id,
          device_id,
          fcm_token,
          platform,
          is_active
        )
        VALUES ($1, $2, $3, 'android', TRUE)
      `,
      [100001n, deviceA, token],
    );

    await expect(
      pool.query(
        `
          INSERT INTO device_registrations (
            user_id,
            device_id,
            fcm_token,
            platform,
            is_active
          )
          VALUES ($1, $2, $3, 'android', TRUE)
        `,
        [100002n, deviceB, token],
      ),
    ).rejects.toMatchObject({
      code: "23505",
    });
  });

  it("should allow the same FCM token when the previous registration is inactive", async () => {
    const deviceA = `${TEST_PREFIX}-inactive-device`;
    const deviceB = `${TEST_PREFIX}-active-device`;
    const token = `${TEST_PREFIX}-reusable-token`;

    await pool.query(
      `
        INSERT INTO device_registrations (
          user_id,
          device_id,
          fcm_token,
          platform,
          is_active
        )
        VALUES ($1, $2, $3, 'android', FALSE)
      `,
      [100003n, deviceA, token],
    );

    const result = await pool.query(
      `
        INSERT INTO device_registrations (
          user_id,
          device_id,
          fcm_token,
          platform,
          is_active
        )
        VALUES ($1, $2, $3, 'android', TRUE)
        RETURNING id, user_id, device_id, fcm_token, is_active
      `,
      [100004n, deviceB, token],
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].is_active).toBe(true);
  });

  it("should enforce user_id + device_id uniqueness", async () => {
    const deviceId = `${TEST_PREFIX}-unique-device`;
    const tokenA = `${TEST_PREFIX}-token-a`;
    const tokenB = `${TEST_PREFIX}-token-b`;

    await pool.query(
      `
        INSERT INTO device_registrations (
          user_id,
          device_id,
          fcm_token,
          platform,
          is_active
        )
        VALUES ($1, $2, $3, 'android', TRUE)
      `,
      [100005n, deviceId, tokenA],
    );

    await expect(
      pool.query(
        `
          INSERT INTO device_registrations (
            user_id,
            device_id,
            fcm_token,
            platform,
            is_active
          )
          VALUES ($1, $2, $3, 'android', TRUE)
        `,
        [100005n, deviceId, tokenB],
      ),
    ).rejects.toMatchObject({
      code: "23505",
    });
  });

  // ==========================================================
  // SERVICE-LEVEL REAL DATABASE TESTS
  // ==========================================================

  it("should keep a single registration on app restart", async () => {
    const userId = 100010n;
    const deviceId = `${TEST_PREFIX}-restart-device`;
    const fcmToken = `${TEST_PREFIX}-restart-token`;

    const first = await registerDevice({
      userId,
      deviceId,
      fcmToken,
      platform: "android",
    });

    const second = await registerDevice({
      userId,
      deviceId,
      fcmToken,
      platform: "android",
    });

    expect(second.id).toBe(first.id);

    const { rows } = await pool.query(
      `
        SELECT
          id,
          user_id,
          device_id,
          fcm_token,
          is_active
        FROM device_registrations
        WHERE user_id = $1
          AND device_id = $2
      `,
      [userId, deviceId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].is_active).toBe(true);
  });

  // ==========================================================
  // FCM TOKEN ROTATION
  // ==========================================================

  it("should rotate FCM token without creating a duplicate registration", async () => {
    const userId = 100011n;
    const deviceId = `${TEST_PREFIX}-rotation-device`;
    const oldToken = `${TEST_PREFIX}-old-token`;
    const newToken = `${TEST_PREFIX}-new-token`;

    const first = await registerDevice({
      userId,
      deviceId,
      fcmToken: oldToken,
      platform: "android",
    });

    const second = await registerDevice({
      userId,
      deviceId,
      fcmToken: newToken,
      platform: "android",
    });

    expect(second.id).toBe(first.id);
    expect(second.fcm_token).toBe(newToken);
    expect(second.is_active).toBe(true);

    const { rows } = await pool.query(
      `
        SELECT
          id,
          user_id,
          device_id,
          fcm_token,
          is_active
        FROM device_registrations
        WHERE user_id = $1
          AND device_id = $2
      `,
      [userId, deviceId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].user_id).toBe(userId.toString());
    expect(rows[0].device_id).toBe(deviceId);
    expect(rows[0].fcm_token).toBe(newToken);
    expect(rows[0].is_active).toBe(true);
  });

  // ==========================================================
  // LOGOUT / DEACTIVATION
  // ==========================================================

  it("should deactivate a device registration on logout", async () => {
    const userId = 100012n;
    const deviceId = `${TEST_PREFIX}-logout-device`;
    const fcmToken = `${TEST_PREFIX}-logout-token`;

    await registerDevice({
      userId,
      deviceId,
      fcmToken,
      platform: "android",
    });

    const result = await unregisterDevice({
      userId,
      deviceId,
    });

    expect(result.is_active).toBe(false);

    const { rows } = await pool.query(
      `
        SELECT
          id,
          user_id,
          device_id,
          fcm_token,
          is_active
        FROM device_registrations
        WHERE user_id = $1
          AND device_id = $2
      `,
      [userId, deviceId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(userId.toString());
    expect(rows[0].device_id).toBe(deviceId);
    expect(rows[0].fcm_token).toBe(fcmToken);
    expect(rows[0].is_active).toBe(false);
  });

  // ==========================================================
  // REACTIVATION AFTER LOGIN
  // ==========================================================

  it("should reactivate a previously deactivated device after login", async () => {
    const userId = 100013n;
    const deviceId = `${TEST_PREFIX}-reactivation-device`;
    const fcmToken = `${TEST_PREFIX}-reactivation-token`;

    const first = await registerDevice({
      userId,
      deviceId,
      fcmToken,
      platform: "android",
    });

    expect(first.is_active).toBe(true);

    const deactivated = await unregisterDevice({
      userId,
      deviceId,
    });

    expect(deactivated.is_active).toBe(false);

    const reactivated = await registerDevice({
      userId,
      deviceId,
      fcmToken,
      platform: "android",
    });

    expect(reactivated.id).toBe(first.id);
    expect(reactivated.is_active).toBe(true);
    expect(reactivated.fcm_token).toBe(fcmToken);

    const { rows } = await pool.query(
      `
        SELECT
          id,
          user_id,
          device_id,
          fcm_token,
          is_active
        FROM device_registrations
        WHERE user_id = $1
          AND device_id = $2
      `,
      [userId, deviceId],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(first.id);
    expect(rows[0].user_id).toBe(userId.toString());
    expect(rows[0].device_id).toBe(deviceId);
    expect(rows[0].fcm_token).toBe(fcmToken);
    expect(rows[0].is_active).toBe(true);
  });

  // ==========================================================
  // USER A LOGOUT → USER B LOGIN
  // ==========================================================

  it("should allow User B to reuse the device token after User A logs out", async () => {
    const userA = 100014n;
    const userB = 100015n;

    const deviceId = `${TEST_PREFIX}-user-switch-device`;
    const fcmToken = `${TEST_PREFIX}-user-switch-token`;

    const userARegistration = await registerDevice({
      userId: userA,
      deviceId,
      fcmToken,
      platform: "android",
    });

    expect(userARegistration.is_active).toBe(true);

    const userALogout = await unregisterDevice({
      userId: userA,
      deviceId,
    });

    expect(userALogout.is_active).toBe(false);

    const userBRegistration = await registerDevice({
      userId: userB,
      deviceId,
      fcmToken,
      platform: "android",
    });

    expect(userBRegistration.is_active).toBe(true);
    expect(userBRegistration.user_id).toBe(userB.toString());
    expect(userBRegistration.device_id).toBe(deviceId);
    expect(userBRegistration.fcm_token).toBe(fcmToken);

    const { rows } = await pool.query(
      `
        SELECT
          user_id,
          device_id,
          fcm_token,
          is_active
        FROM device_registrations
        WHERE device_id = $1
        ORDER BY user_id
      `,
      [deviceId],
    );

    expect(rows).toHaveLength(2);

    const userARow = rows.find((row) => row.user_id === userA.toString());

    const userBRow = rows.find((row) => row.user_id === userB.toString());

    expect(userARow).toBeDefined();
    expect(userBRow).toBeDefined();

    expect(userARow.is_active).toBe(false);
    expect(userBRow.is_active).toBe(true);

    expect(userARow.fcm_token).toBe(fcmToken);
    expect(userBRow.fcm_token).toBe(fcmToken);
  });
});
