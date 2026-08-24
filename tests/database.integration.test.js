import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { pool } from "../src/db/pool.js";

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
});
