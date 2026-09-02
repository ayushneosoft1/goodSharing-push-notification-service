import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();
const mockSendEachForMulticast = vi.fn();

const mockGetMessaging = vi.fn(() => ({
  send: mockSend,
  sendEachForMulticast: mockSendEachForMulticast,
}));

const mockGetFirebaseApp = vi.fn();

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: mockGetMessaging,
}));

vi.mock("../src/config/firebase.js", () => ({
  getFirebaseApp: mockGetFirebaseApp,
}));

const {
  sendPushNotification,
  sendPushNotificationToTokens,
  isInvalidFcmTokenError,
} = await import("../src/services/firebaseMessagingService.js");

describe("firebaseMessagingService", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSendEachForMulticast.mockReset();
    mockGetMessaging.mockClear();
    mockGetFirebaseApp.mockClear();
  });

  // ============================================================
  // sendPushNotification
  // ============================================================

  describe("sendPushNotification", () => {
    it("should reject when FCM token is missing", async () => {
      await expect(
        sendPushNotification({
          title: "New Post",
          body: "A new post is available",
        }),
      ).rejects.toThrow("FCM token is required");

      expect(mockGetFirebaseApp).not.toHaveBeenCalled();
      expect(mockGetMessaging).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("should reject when notification title is missing", async () => {
      await expect(
        sendPushNotification({
          token: "token-001",
          body: "A new post is available",
        }),
      ).rejects.toThrow("Notification title is required");

      expect(mockGetFirebaseApp).not.toHaveBeenCalled();
      expect(mockGetMessaging).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("should reject when notification body is missing", async () => {
      await expect(
        sendPushNotification({
          token: "token-001",
          title: "New Post",
        }),
      ).rejects.toThrow("Notification body is required");

      expect(mockGetFirebaseApp).not.toHaveBeenCalled();
      expect(mockGetMessaging).not.toHaveBeenCalled();
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("should initialize Firebase and send a notification successfully", async () => {
      mockSend.mockResolvedValueOnce("firebase-message-id-001");

      const result = await sendPushNotification({
        token: "token-001",
        title: "New Post",
        body: "A new post is available",
      });

      expect(result).toBe("firebase-message-id-001");

      expect(mockGetFirebaseApp).toHaveBeenCalledTimes(1);
      expect(mockGetMessaging).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(1);

      expect(mockSend).toHaveBeenCalledWith({
        token: "token-001",
        notification: {
          title: "New Post",
          body: "A new post is available",
        },
        data: {},
        android: {
          priority: "high",
          notification: {
            channelId: "default",
          },
        },
      });
    });

    it("should send custom data with the notification", async () => {
      mockSend.mockResolvedValueOnce("firebase-message-id-002");

      await sendPushNotification({
        token: "token-002",
        title: "New Post",
        body: "A new post is available",
        data: {
          postId: 123,
          categoryId: 5,
          type: "new_post",
        },
      });

      expect(mockSend).toHaveBeenCalledWith({
        token: "token-002",
        notification: {
          title: "New Post",
          body: "A new post is available",
        },
        data: {
          postId: "123",
          categoryId: "5",
          type: "new_post",
        },
        android: {
          priority: "high",
          notification: {
            channelId: "default",
          },
        },
      });
    });

    it("should propagate Firebase send errors", async () => {
      const firebaseError = new Error("Firebase send failed");

      mockSend.mockRejectedValueOnce(firebaseError);

      await expect(
        sendPushNotification({
          token: "invalid-token",
          title: "New Post",
          body: "A new post is available",
        }),
      ).rejects.toThrow("Firebase send failed");

      expect(mockGetFirebaseApp).toHaveBeenCalledTimes(1);
      expect(mockGetMessaging).toHaveBeenCalledTimes(1);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // sendPushNotificationToTokens
  // ============================================================

  describe("sendPushNotificationToTokens", () => {
    it("should reject when tokens are missing", async () => {
      await expect(
        sendPushNotificationToTokens({
          title: "New Post",
          body: "A new post is available",
        }),
      ).rejects.toThrow("At least one FCM token is required");

      expect(mockGetFirebaseApp).not.toHaveBeenCalled();
      expect(mockGetMessaging).not.toHaveBeenCalled();
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    it("should reject when tokens array is empty", async () => {
      await expect(
        sendPushNotificationToTokens({
          tokens: [],
          title: "New Post",
          body: "A new post is available",
        }),
      ).rejects.toThrow("At least one FCM token is required");

      expect(mockGetFirebaseApp).not.toHaveBeenCalled();
      expect(mockGetMessaging).not.toHaveBeenCalled();
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    it("should send notification to multiple tokens using multicast", async () => {
      mockSendEachForMulticast.mockResolvedValueOnce({
        successCount: 2,
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
        ],
      });

      const result = await sendPushNotificationToTokens({
        tokens: ["token-001", "token-002"],
        title: "New Post",
        body: "A new post is available",
      });

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);

      expect(mockGetFirebaseApp).toHaveBeenCalledTimes(1);
      expect(mockGetMessaging).toHaveBeenCalledTimes(1);
      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);

      expect(mockSendEachForMulticast).toHaveBeenCalledWith({
        tokens: ["token-001", "token-002"],
        notification: {
          title: "New Post",
          body: "A new post is available",
        },
        data: {},
        android: {
          priority: "high",
          notification: {
            channelId: "default",
          },
        },
      });
    });

    it("should normalize custom data before multicast send", async () => {
      mockSendEachForMulticast.mockResolvedValueOnce({
        successCount: 2,
        failureCount: 0,
        responses: [
          {
            success: true,
          },
          {
            success: true,
          },
        ],
      });

      await sendPushNotificationToTokens({
        tokens: ["token-001", "token-002"],
        title: "New Post",
        body: "A new post is available",
        data: {
          postId: 123,
          categoryId: 5,
          type: "new_post",
        },
      });

      expect(mockSendEachForMulticast).toHaveBeenCalledWith({
        tokens: ["token-001", "token-002"],
        notification: {
          title: "New Post",
          body: "A new post is available",
        },
        data: {
          postId: "123",
          categoryId: "5",
          type: "new_post",
        },
        android: {
          priority: "high",
          notification: {
            channelId: "default",
          },
        },
      });
    });

    it("should propagate multicast Firebase errors", async () => {
      const firebaseError = new Error("Firebase multicast failed");

      mockSendEachForMulticast.mockRejectedValueOnce(firebaseError);

      await expect(
        sendPushNotificationToTokens({
          tokens: ["token-001", "token-002"],
          title: "New Post",
          body: "A new post is available",
        }),
      ).rejects.toThrow("Firebase multicast failed");

      expect(mockGetFirebaseApp).toHaveBeenCalledTimes(1);
      expect(mockGetMessaging).toHaveBeenCalledTimes(1);
      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================
  // isInvalidFcmTokenError
  // ============================================================

  describe("isInvalidFcmTokenError", () => {
    it("should detect unregistered FCM tokens", () => {
      expect(
        isInvalidFcmTokenError({
          code: "messaging/registration-token-not-registered",
        }),
      ).toBe(true);
    });

    it("should detect invalid FCM tokens", () => {
      expect(
        isInvalidFcmTokenError({
          code: "messaging/invalid-registration-token",
        }),
      ).toBe(true);
    });

    it("should reject unrelated Firebase errors", () => {
      expect(
        isInvalidFcmTokenError({
          code: "messaging/internal-error",
        }),
      ).toBe(false);
    });

    it("should return false when error is undefined", () => {
      expect(isInvalidFcmTokenError(undefined)).toBe(false);
    });

    it("should return false when error has no Firebase error code", () => {
      expect(
        isInvalidFcmTokenError({
          message: "Some Firebase error",
        }),
      ).toBe(false);
    });
  });
});
