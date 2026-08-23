import { describe, it, expect, vi, beforeEach } from "vitest";

import request from "supertest";

const mockQuery = vi.fn();
const mockCheckDatabaseConnection = vi.fn();
const mockGetFirebaseApp = vi.fn();

vi.mock("../src/db/pool.js", () => ({
  pool: {
    query: mockQuery,
  },
  checkDatabaseConnection: mockCheckDatabaseConnection,
}));

vi.mock("../src/config/firebase.js", () => ({
  getFirebaseApp: mockGetFirebaseApp,
}));

const { createApp } = await import("../src/app.js");

describe("Authentication - x-user integration", () => {
  let app;

  beforeEach(async () => {
    mockQuery.mockReset();

    mockCheckDatabaseConnection.mockResolvedValue(true);

    mockGetFirebaseApp.mockReturnValue({});

    app = await createApp();
  });

  // ==========================================================
  // AUTHENTICATED REGISTER
  // ==========================================================

  it("should accept authenticated user from x-user.id", async () => {
    const now = new Date();

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "registration-001",
          user_id: "159",
          device_id: "test-device",
          fcm_token: "test-token",
          platform: "android",
          is_active: true,
          created_at: now,
          updated_at: now,
          last_seen_at: now,
        },
      ],
    });

    const response = await request(app)
      .post("/graphql")
      .set(
        "x-user",
        JSON.stringify({
          id: "159",
          email: "user@example.com",
        }),
      )
      .send({
        query: `
          mutation {
            registerDevice(
              input: {
                deviceId: "test-device"
                fcmToken: "test-token"
                platform: "android"
              }
            ) {
              id
              userId
              deviceId
              platform
              isActive
            }
          }
        `,
      });

    expect(response.body.errors).toBeUndefined();

    expect(response.body.data.registerDevice).toEqual({
      id: "registration-001",
      userId: "159",
      deviceId: "test-device",
      platform: "android",
      isActive: true,
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(mockQuery.mock.calls[0][1]).toEqual([
      "159",
      "test-device",
      "test-token",
      "android",
    ]);
  });

  // ==========================================================
  // UNAUTHENTICATED MUTATION
  // ==========================================================

  it("should reject registerDevice mutation without authentication", async () => {
    const response = await request(app)
      .post("/graphql")
      .send({
        query: `
          mutation {
            registerDevice(
              input: {
                deviceId: "unauthenticated-device"
                fcmToken: "unauthenticated-token"
                platform: "android"
              }
            ) {
              id
            }
          }
        `,
      });

    expect(response.body.errors).toBeDefined();

    expect(response.body.errors[0].message).toBe("Authentication required");

    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ==========================================================
  // MALFORMED x-user
  // ==========================================================

  it("should reject malformed x-user header", async () => {
    const response = await request(app)
      .post("/graphql")
      .set("x-user", "invalid-json")
      .send({
        query: `
          mutation {
            registerDevice(
              input: {
                deviceId: "device-001"
                fcmToken: "token-001"
                platform: "android"
              }
            ) {
              id
            }
          }
        `,
      });

    expect(response.body.errors).toBeDefined();

    expect(response.body.errors[0].message).toContain("Invalid x-user header");

    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ==========================================================
  // x-user.id VS userId
  // ==========================================================

  it("should use id from x-user instead of userId", async () => {
    const now = new Date();

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "registration-002",
          user_id: "159",
          device_id: "device-002",
          fcm_token: "token-002",
          platform: "android",
          is_active: true,
          created_at: now,
          updated_at: now,
          last_seen_at: now,
        },
      ],
    });

    const response = await request(app)
      .post("/graphql")
      .set(
        "x-user",
        JSON.stringify({
          id: "159",
          email: "user@example.com",
          userId: "999",
        }),
      )
      .send({
        query: `
          mutation {
            registerDevice(
              input: {
                deviceId: "device-002"
                fcmToken: "token-002"
                platform: "android"
              }
            ) {
              userId
            }
          }
        `,
      });

    expect(response.body.errors).toBeUndefined();

    expect(response.body.data.registerDevice.userId).toBe("159");

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(mockQuery.mock.calls[0][1][0]).toBe("159");

    expect(mockQuery.mock.calls[0][1][0]).not.toBe("999");
  });

  // ==========================================================
  // userId MUST NOT BE USED AS AUTH SOURCE
  // ==========================================================

  it("should not accept userId as the authentication source", async () => {
    const response = await request(app)
      .post("/graphql")
      .set(
        "x-user",
        JSON.stringify({
          userId: "999",
          email: "user@example.com",
        }),
      )
      .send({
        query: `
          mutation {
            registerDevice(
              input: {
                deviceId: "device-003"
                fcmToken: "token-003"
                platform: "android"
              }
            ) {
              id
            }
          }
        `,
      });

    expect(response.body.errors).toBeDefined();

    expect(response.body.errors[0].message).toContain("Invalid x-user header");

    expect(mockQuery).not.toHaveBeenCalled();
  });
});
