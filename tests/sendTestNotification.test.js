import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================
// MOCKS
// ============================================================

const mockGetActiveDeviceRegistrations = vi.fn();
const mockDeactivateDeviceRegistrationByToken = vi.fn();

const mockSendPushNotificationToTokens = vi.fn();
const mockIsInvalidFcmTokenError = vi.fn();

// ============================================================
// MOCK DEVICE REGISTRATION SERVICE
// ============================================================

vi.mock("../src/services/deviceRegistrationService.js", () => ({
  registerDevice: vi.fn(),
  unregisterDevice: vi.fn(),

  getActiveDeviceRegistrations: mockGetActiveDeviceRegistrations,

  deactivateDeviceRegistrationByToken: mockDeactivateDeviceRegistrationByToken,
}));

// ============================================================
// MOCK FIREBASE MESSAGING SERVICE
// ============================================================

vi.mock("../src/services/firebaseMessagingService.js", () => ({
  sendPushNotificationToTokens: mockSendPushNotificationToTokens,

  isInvalidFcmTokenError: mockIsInvalidFcmTokenError,
}));

// ============================================================
// IMPORT RESOLVERS AFTER MOCKS
// ============================================================

const { resolvers } = await import("../src/graphql/resolvers.js");

// ============================================================
// TEST DATA HELPERS
// ============================================================

function createDevice({
  id = "registration-001",
  userId = "159",
  deviceId = "device-001",
  token = "token-001",
  platform = "android",
  isActive = true,
} = {}) {
  return {
    id,
    user_id: userId,
    device_id: deviceId,
    fcm_token: token,
    platform,
    is_active: isActive,
    created_at: new Date(),
    updated_at: new Date(),
    last_seen_at: new Date(),
  };
}

function createFirebaseSuccessResponse({
  successCount,
  failureCount,
  responses,
}) {
  return {
    successCount,
    failureCount,
    responses,
  };
}

// ============================================================
// TEST SUITE
// ============================================================

describe("sendTestNotification resolver", () => {
  beforeEach(() => {
    mockGetActiveDeviceRegistrations.mockReset();

    mockDeactivateDeviceRegistrationByToken.mockReset();

    mockSendPushNotificationToTokens.mockReset();

    mockIsInvalidFcmTokenError.mockReset();
  });

  // ==========================================================
  // 1. AUTHENTICATED REQUEST
  // ==========================================================

  it("should send a test notification for an authenticated user", async () => {
    const device = createDevice({
      userId: "159",
      deviceId: "device-001",
      token: "token-001",
    });

    mockGetActiveDeviceRegistrations.mockResolvedValueOnce([device]);

    mockSendPushNotificationToTokens.mockResolvedValueOnce(
      createFirebaseSuccessResponse({
        successCount: 1,
        failureCount: 0,
        responses: [
          {
            success: true,
            messageId: "firebase-message-001",
          },
        ],
      }),
    );

    const context = {
      userId: "159",
    };

    const input = {
      title: "Test Notification",
      body: "Hello from GoodSharing",
      type: "test",
      targetId: "123",
    };

    const result = await resolvers.Mutation.sendTestNotification(
      null,
      { input },
      context,
    );

    expect(result).toEqual({
      successCount: 1,
      failureCount: 0,
      totalTokens: 1,
    });

    expect(mockGetActiveDeviceRegistrations).toHaveBeenCalledTimes(1);

    expect(mockGetActiveDeviceRegistrations).toHaveBeenCalledWith("159");

    expect(mockSendPushNotificationToTokens).toHaveBeenCalledTimes(1);

    expect(mockSendPushNotificationToTokens).toHaveBeenCalledWith({
      tokens: ["token-001"],
      title: "Test Notification",
      body: "Hello from GoodSharing",
      data: {
        type: "test",
        targetId: "123",
      },
    });
  });

  // ==========================================================
  // 2. UNAUTHENTICATED REQUEST
  // ==========================================================

  it("should reject an unauthenticated request", async () => {
    const context = {};

    const input = {
      title: "Test Notification",
      body: "Hello from GoodSharing",
    };

    await expect(
      resolvers.Mutation.sendTestNotification(null, { input }, context),
    ).rejects.toThrow("Authentication required");

    expect(mockGetActiveDeviceRegistrations).not.toHaveBeenCalled();

    expect(mockSendPushNotificationToTokens).not.toHaveBeenCalled();

    expect(mockDeactivateDeviceRegistrationByToken).not.toHaveBeenCalled();
  });

  // ==========================================================
  // 3. NO ACTIVE TOKENS
  // ==========================================================

  it("should return zero counts when the user has no active device tokens", async () => {
    mockGetActiveDeviceRegistrations.mockResolvedValueOnce([]);

    const context = {
      userId: "159",
    };

    const input = {
      title: "Test Notification",
      body: "No devices",
    };

    const result = await resolvers.Mutation.sendTestNotification(
      null,
      { input },
      context,
    );

    expect(result).toEqual({
      successCount: 0,
      failureCount: 0,
      totalTokens: 0,
    });

    expect(mockGetActiveDeviceRegistrations).toHaveBeenCalledTimes(1);

    expect(mockGetActiveDeviceRegistrations).toHaveBeenCalledWith("159");

    expect(mockSendPushNotificationToTokens).not.toHaveBeenCalled();

    expect(mockDeactivateDeviceRegistrationByToken).not.toHaveBeenCalled();
  });

  // ==========================================================
  // 4. SINGLE TOKEN
  // ==========================================================

  it("should send the notification to a single active FCM token", async () => {
    const device = createDevice({
      token: "single-token",
    });

    mockGetActiveDeviceRegistrations.mockResolvedValueOnce([device]);

    mockSendPushNotificationToTokens.mockResolvedValueOnce(
      createFirebaseSuccessResponse({
        successCount: 1,
        failureCount: 0,
        responses: [
          {
            success: true,
            messageId: "message-single",
          },
        ],
      }),
    );

    const result = await resolvers.Mutation.sendTestNotification(
      null,
      {
        input: {
          title: "Single Device",
          body: "Single token test",
        },
      },
      {
        userId: "159",
      },
    );

    expect(result).toEqual({
      successCount: 1,
      failureCount: 0,
      totalTokens: 1,
    });

    expect(mockSendPushNotificationToTokens).toHaveBeenCalledWith({
      tokens: ["single-token"],
      title: "Single Device",
      body: "Single token test",
      data: {
        type: "test",
      },
    });
  });

  // ==========================================================
  // 5. MULTIPLE TOKENS
  // ==========================================================

  it("should send the notification to multiple active FCM tokens", async () => {
    const devices = [
      createDevice({
        id: "registration-001",
        deviceId: "device-001",
        token: "token-001",
      }),

      createDevice({
        id: "registration-002",
        deviceId: "device-002",
        token: "token-002",
      }),

      createDevice({
        id: "registration-003",
        deviceId: "device-003",
        token: "token-003",
      }),
    ];

    mockGetActiveDeviceRegistrations.mockResolvedValueOnce(devices);

    mockSendPushNotificationToTokens.mockResolvedValueOnce(
      createFirebaseSuccessResponse({
        successCount: 3,
        failureCount: 0,
        responses: [
          {
            success: true,
            messageId: "message-001",
          },
          {
            success: true,
            messageId: "message-002",
          },
          {
            success: true,
            messageId: "message-003",
          },
        ],
      }),
    );

    const result = await resolvers.Mutation.sendTestNotification(
      null,
      {
        input: {
          title: "Multiple Devices",
          body: "Hello all devices",
        },
      },
      {
        userId: "159",
      },
    );

    expect(result).toEqual({
      successCount: 3,
      failureCount: 0,
      totalTokens: 3,
    });

    expect(mockGetActiveDeviceRegistrations).toHaveBeenCalledWith("159");

    expect(mockSendPushNotificationToTokens).toHaveBeenCalledWith({
      tokens: ["token-001", "token-002", "token-003"],
      title: "Multiple Devices",
      body: "Hello all devices",
      data: {
        type: "test",
      },
    });
  });

  // ==========================================================
  // 6. CUSTOM TYPE + TARGET ID
  // ==========================================================

  it("should include custom type and targetId in Firebase data", async () => {
    const device = createDevice({
      token: "token-custom-data",
    });

    mockGetActiveDeviceRegistrations.mockResolvedValueOnce([device]);

    mockSendPushNotificationToTokens.mockResolvedValueOnce(
      createFirebaseSuccessResponse({
        successCount: 1,
        failureCount: 0,
        responses: [
          {
            success: true,
          },
        ],
      }),
    );

    await resolvers.Mutation.sendTestNotification(
      null,
      {
        input: {
          title: "Post Notification",
          body: "New post available",
          type: "new_post",
          targetId: "post-123",
        },
      },
      {
        userId: "159",
      },
    );

    expect(mockSendPushNotificationToTokens).toHaveBeenCalledWith({
      tokens: ["token-custom-data"],
      title: "Post Notification",
      body: "New post available",
      data: {
        type: "new_post",
        targetId: "post-123",
      },
    });
  });

  // ==========================================================
  // 7. FIREBASE SUCCESS / PARTIAL FAILURE
  // ==========================================================

  it("should return Firebase success and failure counts", async () => {
    const devices = [
      createDevice({
        token: "token-success",
      }),

      createDevice({
        id: "registration-002",
        deviceId: "device-002",
        token: "token-failure",
      }),
    ];

    mockGetActiveDeviceRegistrations.mockResolvedValueOnce(devices);

    mockSendPushNotificationToTokens.mockResolvedValueOnce(
      createFirebaseSuccessResponse({
        successCount: 1,
        failureCount: 1,
        responses: [
          {
            success: true,
            messageId: "message-success",
          },
          {
            success: false,
            error: {
              code: "messaging/internal-error",
            },
          },
        ],
      }),
    );

    mockIsInvalidFcmTokenError.mockReturnValue(false);

    const result = await resolvers.Mutation.sendTestNotification(
      null,
      {
        input: {
          title: "Partial Result",
          body: "One succeeds and one fails",
        },
      },
      {
        userId: "159",
      },
    );

    expect(result).toEqual({
      successCount: 1,
      failureCount: 1,
      totalTokens: 2,
    });

    expect(mockIsInvalidFcmTokenError).toHaveBeenCalledTimes(1);

    expect(mockDeactivateDeviceRegistrationByToken).not.toHaveBeenCalled();
  });

  // ==========================================================
  // 8. FIREBASE COMPLETE FAILURE
  // ==========================================================

  it("should propagate Firebase multicast failure", async () => {
    const devices = [
      createDevice({
        token: "token-001",
      }),
    ];

    mockGetActiveDeviceRegistrations.mockResolvedValueOnce(devices);

    const firebaseError = new Error("Firebase multicast failed");

    mockSendPushNotificationToTokens.mockRejectedValueOnce(firebaseError);

    await expect(
      resolvers.Mutation.sendTestNotification(
        null,
        {
          input: {
            title: "Firebase Failure",
            body: "This should fail",
          },
        },
        {
          userId: "159",
        },
      ),
    ).rejects.toThrow("Firebase multicast failed");

    expect(mockGetActiveDeviceRegistrations).toHaveBeenCalledTimes(1);

    expect(mockSendPushNotificationToTokens).toHaveBeenCalledTimes(1);

    expect(mockDeactivateDeviceRegistrationByToken).not.toHaveBeenCalled();
  });

  // ==========================================================
  // 9. INVALID TOKEN → DB DEACTIVATION
  // ==========================================================

  it("should deactivate an invalid FCM token", async () => {
    const invalidToken = "invalid-token";

    const devices = [
      createDevice({
        token: invalidToken,
      }),
    ];

    mockGetActiveDeviceRegistrations.mockResolvedValueOnce(devices);

    mockSendPushNotificationToTokens.mockResolvedValueOnce(
      createFirebaseSuccessResponse({
        successCount: 0,
        failureCount: 1,
        responses: [
          {
            success: false,
            error: {
              code: "messaging/registration-token-not-registered",
            },
          },
        ],
      }),
    );

    mockIsInvalidFcmTokenError.mockReturnValue(true);

    mockDeactivateDeviceRegistrationByToken.mockResolvedValueOnce({
      id: "registration-001",
      user_id: "159",
      device_id: "device-001",
      fcm_token: invalidToken,
      platform: "android",
      is_active: false,
    });

    const result = await resolvers.Mutation.sendTestNotification(
      null,
      {
        input: {
          title: "Invalid Token Test",
          body: "Testing cleanup",
        },
      },
      {
        userId: "159",
      },
    );

    expect(result).toEqual({
      successCount: 0,
      failureCount: 1,
      totalTokens: 1,
    });

    expect(mockIsInvalidFcmTokenError).toHaveBeenCalledTimes(1);

    expect(mockIsInvalidFcmTokenError).toHaveBeenCalledWith({
      code: "messaging/registration-token-not-registered",
    });

    expect(mockDeactivateDeviceRegistrationByToken).toHaveBeenCalledTimes(1);

    expect(mockDeactivateDeviceRegistrationByToken).toHaveBeenCalledWith(
      invalidToken,
    );
  });

  // ==========================================================
  // 10. MULTIPLE INVALID TOKENS → MULTIPLE CLEANUPS
  // ==========================================================

  it("should deactivate every invalid FCM token returned by Firebase", async () => {
    const devices = [
      createDevice({
        token: "valid-token",
      }),

      createDevice({
        id: "registration-002",
        deviceId: "device-002",
        token: "invalid-token-001",
      }),

      createDevice({
        id: "registration-003",
        deviceId: "device-003",
        token: "invalid-token-002",
      }),
    ];

    mockGetActiveDeviceRegistrations.mockResolvedValueOnce(devices);

    const invalidErrorOne = {
      code: "messaging/registration-token-not-registered",
    };

    const invalidErrorTwo = {
      code: "messaging/invalid-registration-token",
    };

    mockSendPushNotificationToTokens.mockResolvedValueOnce(
      createFirebaseSuccessResponse({
        successCount: 1,
        failureCount: 2,
        responses: [
          {
            success: true,
            messageId: "message-valid",
          },
          {
            success: false,
            error: invalidErrorOne,
          },
          {
            success: false,
            error: invalidErrorTwo,
          },
        ],
      }),
    );

    mockIsInvalidFcmTokenError.mockImplementation(
      (error) =>
        error?.code === "messaging/registration-token-not-registered" ||
        error?.code === "messaging/invalid-registration-token",
    );

    mockDeactivateDeviceRegistrationByToken
      .mockResolvedValueOnce({
        fcm_token: "invalid-token-001",
        is_active: false,
      })
      .mockResolvedValueOnce({
        fcm_token: "invalid-token-002",
        is_active: false,
      });

    const result = await resolvers.Mutation.sendTestNotification(
      null,
      {
        input: {
          title: "Cleanup Test",
          body: "Testing invalid token cleanup",
        },
      },
      {
        userId: "159",
      },
    );

    expect(result).toEqual({
      successCount: 1,
      failureCount: 2,
      totalTokens: 3,
    });

    expect(mockDeactivateDeviceRegistrationByToken).toHaveBeenCalledTimes(2);

    expect(mockDeactivateDeviceRegistrationByToken).toHaveBeenNthCalledWith(
      1,
      "invalid-token-001",
    );

    expect(mockDeactivateDeviceRegistrationByToken).toHaveBeenNthCalledWith(
      2,
      "invalid-token-002",
    );
  });
});
