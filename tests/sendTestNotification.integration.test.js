import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import request from "supertest";

// ============================================================
// Firebase mocks
//
// PostgreSQL वास्तविक रहेगा.
// Firebase केवल mock रहेगा ताकि test real FCM service को
// notification भेजे बिना Firebase response simulate कर सके.
// ============================================================

const mockSendEachForMulticast = vi.fn();
const mockGetFirebaseApp = vi.fn();

const mockGetMessaging = vi.fn(() => ({
  sendEachForMulticast: mockSendEachForMulticast,
}));

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: mockGetMessaging,
}));

vi.mock("../src/config/firebase.js", () => ({
  getFirebaseApp: mockGetFirebaseApp,
}));

// ============================================================
// Application / DB imports
// ============================================================

const { createApp } = await import("../src/app.js");
const { pool } = await import("../src/db/pool.js");

// ============================================================
// GraphQL mutation
// ============================================================

const SEND_TEST_NOTIFICATION_MUTATION = `
  mutation SendTestNotification(
    $input: SendTestNotificationInput!
  ) {
    sendTestNotification(input: $input) {
      successCount
      failureCount
      totalTokens
    }
  }
`;

// ============================================================
// Test configuration
// ============================================================

const TEST_USER_ID = "159";

const TEST_DEVICE_VALID = `integration-valid-${Date.now()}`;
const TEST_DEVICE_INVALID = `integration-invalid-${Date.now()}`;

const TEST_TOKEN_VALID = `integration-valid-token-${Date.now()}`;
const TEST_TOKEN_INVALID = `integration-invalid-token-${Date.now()}`;

let app;

// ============================================================
// Helper: insert test device registration
// ============================================================

async function insertDevice({
  userId,
  deviceId,
  fcmToken,
  platform = "android",
}) {
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

// ============================================================
// Helper: read device by token
// ============================================================

async function getDeviceByToken(fcmToken) {
  const query = `
    SELECT
      id,
      user_id,
      device_id,
      fcm_token,
      platform,
      is_active
    FROM device_registrations
    WHERE fcm_token = $1;
  `;

  const { rows } = await pool.query(query, [fcmToken]);

  return rows[0] ?? null;
}

// ============================================================
// Helper: cleanup test registrations
// ============================================================

async function cleanupTestDevices() {
  await pool.query(
    `
      DELETE FROM device_registrations
      WHERE device_id IN ($1, $2);
    `,
    [TEST_DEVICE_VALID, TEST_DEVICE_INVALID],
  );
}

// ============================================================
// Setup
// ============================================================

beforeAll(async () => {
  // Firebase app is mocked.
  mockGetFirebaseApp.mockReturnValue({});

  // Create application.
  app = await createApp();

  // Make sure old test records do not interfere.
  await cleanupTestDevices();

  // ----------------------------------------------------------
  // Insert two active devices for the same authenticated user.
  // ----------------------------------------------------------

  await insertDevice({
    userId: TEST_USER_ID,
    deviceId: TEST_DEVICE_VALID,
    fcmToken: TEST_TOKEN_VALID,
  });

  await insertDevice({
    userId: TEST_USER_ID,
    deviceId: TEST_DEVICE_INVALID,
    fcmToken: TEST_TOKEN_INVALID,
  });
});

// ============================================================
// Cleanup
// ============================================================

afterAll(async () => {
  await cleanupTestDevices();

  await pool.end();
});

// ============================================================
// E2E TEST
// ============================================================

describe("sendTestNotification - end-to-end integration", () => {
  it("should send to active tokens and deactivate invalid FCM tokens", async () => {
    // ========================================================
    // Firebase mock
    //
    // IMPORTANT:
    // Do NOT assume PostgreSQL returns tokens in a particular
    // order.
    //
    // Instead, inspect the actual tokens sent to Firebase and
    // generate the corresponding response for each token.
    //
    // This makes the test independent of database row order.
    // ========================================================

    mockSendEachForMulticast.mockImplementationOnce(async (message) => {
      const tokens = message?.tokens ?? [];

      return {
        successCount: tokens.filter((token) => token === TEST_TOKEN_VALID)
          .length,

        failureCount: tokens.filter((token) => token === TEST_TOKEN_INVALID)
          .length,

        responses: tokens.map((token) => {
          if (token === TEST_TOKEN_VALID) {
            return {
              success: true,
              messageId: "firebase-message-valid-001",
            };
          }

          if (token === TEST_TOKEN_INVALID) {
            return {
              success: false,
              error: {
                code: "messaging/registration-token-not-registered",
                message: "The registration token is not registered.",
              },
            };
          }

          return {
            success: false,
            error: {
              code: "messaging/unknown-error",
              message: "Unexpected test token.",
            },
          };
        }),
      };
    });

    // ========================================================
    // Verify database state BEFORE notification
    // ========================================================

    const validBefore = await getDeviceByToken(TEST_TOKEN_VALID);

    const invalidBefore = await getDeviceByToken(TEST_TOKEN_INVALID);

    expect(validBefore).not.toBeNull();
    expect(invalidBefore).not.toBeNull();

    expect(validBefore.is_active).toBe(true);
    expect(invalidBefore.is_active).toBe(true);

    // ========================================================
    // Execute actual GraphQL HTTP request
    //
    // This verifies:
    //
    // x-user
    //   ↓
    // GraphQL context
    //   ↓
    // context.userId
    //   ↓
    // sendTestNotification resolver
    //   ↓
    // database token lookup
    //   ↓
    // Firebase messaging
    // ========================================================

    const response = await request(app)
      .post("/graphql")
      .set(
        "x-user",
        JSON.stringify({
          id: TEST_USER_ID,
          email: "integration-test@example.com",
        }),
      )
      .send({
        query: SEND_TEST_NOTIFICATION_MUTATION,
        variables: {
          input: {
            title: "Integration Test Notification",
            body: "This notification is an integration test.",
            type: "test",
            targetId: "integration-001",
          },
        },
      });

    // ========================================================
    // GraphQL response must not contain errors
    // ========================================================

    expect(response.body.errors).toBeUndefined();

    expect(response.body.data).toBeDefined();

    expect(response.body.data.sendTestNotification).toEqual({
      successCount: 1,
      failureCount: 1,
      totalTokens: 2,
    });

    // ========================================================
    // Verify Firebase initialization / messaging
    // ========================================================

    expect(mockGetFirebaseApp).toHaveBeenCalled();

    expect(mockGetMessaging).toHaveBeenCalled();

    expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);

    // ========================================================
    // Get exact Firebase request
    // ========================================================

    const firebaseCall = mockSendEachForMulticast.mock.calls[0][0];

    expect(firebaseCall).toBeDefined();

    // ========================================================
    // Verify exact tokens sent to Firebase
    //
    // Order is intentionally NOT checked.
    //
    // PostgreSQL does not guarantee row order unless an
    // ORDER BY clause is explicitly used.
    // ========================================================

    expect(firebaseCall.tokens).toEqual(
      expect.arrayContaining([TEST_TOKEN_VALID, TEST_TOKEN_INVALID]),
    );

    expect(firebaseCall.tokens).toHaveLength(2);

    // ========================================================
    // Verify valid token was included
    // ========================================================

    expect(firebaseCall.tokens).toContain(TEST_TOKEN_VALID);

    // ========================================================
    // Verify invalid token was included
    // ========================================================

    expect(firebaseCall.tokens).toContain(TEST_TOKEN_INVALID);

    // ========================================================
    // Verify notification payload
    // ========================================================

    expect(firebaseCall.notification).toEqual({
      title: "Integration Test Notification",
      body: "This notification is an integration test.",
    });

    // ========================================================
    // Verify custom data payload
    // ========================================================

    expect(firebaseCall.data).toEqual({
      type: "test",
      targetId: "integration-001",
    });

    // ========================================================
    // Verify Android notification configuration
    // ========================================================

    expect(firebaseCall.android).toEqual({
      priority: "high",
      notification: {
        channelId: "default",
      },
    });

    // ========================================================
    // Verify DATABASE state AFTER notification
    //
    // Valid token:
    //   must remain active.
    //
    // Invalid/unregistered token:
    //   must become inactive.
    // ========================================================

    const validAfter = await getDeviceByToken(TEST_TOKEN_VALID);

    const invalidAfter = await getDeviceByToken(TEST_TOKEN_INVALID);

    expect(validAfter).not.toBeNull();
    expect(invalidAfter).not.toBeNull();

    // Valid FCM token must remain active.
    expect(validAfter.is_active).toBe(true);

    // Invalid FCM token must be deactivated.
    expect(invalidAfter.is_active).toBe(false);

    // ========================================================
    // Extra ownership verification
    // ========================================================

    expect(String(validAfter.user_id)).toBe(TEST_USER_ID);

    expect(String(invalidAfter.user_id)).toBe(TEST_USER_ID);

    expect(validAfter.device_id).toBe(TEST_DEVICE_VALID);

    expect(invalidAfter.device_id).toBe(TEST_DEVICE_INVALID);

    expect(validAfter.fcm_token).toBe(TEST_TOKEN_VALID);

    expect(invalidAfter.fcm_token).toBe(TEST_TOKEN_INVALID);
  });
});
