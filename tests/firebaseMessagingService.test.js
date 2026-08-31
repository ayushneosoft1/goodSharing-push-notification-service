import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

const mockGetMessaging = vi.fn(() => ({
  send: mockSend,
}));

const mockGetFirebaseApp = vi.fn();

vi.mock("firebase-admin/messaging", () => ({
  getMessaging: mockGetMessaging,
}));

vi.mock("../src/config/firebase.js", () => ({
  getFirebaseApp: mockGetFirebaseApp,
}));

const { sendPushNotification } =
  await import("../src/services/firebaseMessagingService.js");

describe("firebaseMessagingService", () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockGetMessaging.mockClear();
    mockGetFirebaseApp.mockClear();
  });

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
});
