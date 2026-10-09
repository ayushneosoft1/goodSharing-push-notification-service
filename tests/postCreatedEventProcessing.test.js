import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/categorySubscriptionService.js", () => ({
  getCategorySubscribers: vi.fn(),
}));

vi.mock("../src/services/inAppNotificationService.js", () => ({
  createInAppNotification: vi.fn(),
}));

vi.mock("../src/services/deviceRegistrationService.js", () => ({
  getActiveDeviceRegistrations: vi.fn(),
  deactivateDeviceRegistrationByToken: vi.fn(),
}));

vi.mock("../src/services/firebaseMessagingService.js", () => ({
  sendPushNotificationToTokens: vi.fn(),
  isInvalidFcmTokenError: vi.fn(),
}));

import { getCategorySubscribers } from "../src/services/categorySubscriptionService.js";
import { createInAppNotification } from "../src/services/inAppNotificationService.js";
import { getActiveDeviceRegistrations } from "../src/services/deviceRegistrationService.js";
import { sendPushNotificationToTokens } from "../src/services/firebaseMessagingService.js";
import { processPostCreatedEvent } from "../src/services/postCreatedEventService.js";

describe("Milestone 4 - PostCreated recipient processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getCategorySubscribers.mockResolvedValue(["165", "166"]);

    createInAppNotification.mockResolvedValue({
      id: "notification-1",
      user_id: "165",
      title: "New Post",
      message: "New post: Test Book",
      post_id: "123",
    });

    getActiveDeviceRegistrations.mockResolvedValue([]);

    sendPushNotificationToTokens.mockResolvedValue({
      successCount: 0,
      failureCount: 0,
      responses: [],
    });
  });

  it("should process only category subscribers and exclude the author", async () => {
    const result = await processPostCreatedEvent({
      eventId: "event-2",
      eventType: "PostCreated",
      postId: "123",
      authorId: "162",
      categoryId: "1",
      title: "Test Book",
      createdAt: "2026-10-05T12:00:00.000Z",
    });

    expect(getCategorySubscribers).toHaveBeenCalledWith({
      categoryId: "1",
      excludeUserId: "162",
    });

    expect(createInAppNotification).toHaveBeenCalledTimes(2);

    expect(createInAppNotification).toHaveBeenCalledWith({
      userId: "165",
      title: "New Post",
      message: "New post: Test Book",
      postId: "123",
    });

    expect(createInAppNotification).toHaveBeenCalledWith({
      userId: "166",
      title: "New Post",
      message: "New post: Test Book",
      postId: "123",
    });

    expect(result.recipientCount).toBe(2);
    expect(result.inAppCreatedCount).toBe(2);
    expect(result.pushSuccessCount).toBe(0);
    expect(result.pushFailureCount).toBe(0);
  });

  it("should create one in-app notification and push to multiple active Android devices", async () => {
    vi.clearAllMocks();

    getCategorySubscribers.mockResolvedValue(["165"]);

    getActiveDeviceRegistrations.mockResolvedValue([
      {
        id: "device-1",
        user_id: "165",
        device_id: "android-1",
        fcm_token: "token-1",
        platform: "android",
        is_active: true,
      },
      {
        id: "device-2",
        user_id: "165",
        device_id: "android-2",
        fcm_token: "token-2",
        platform: "android",
        is_active: true,
      },
    ]);

    sendPushNotificationToTokens.mockResolvedValue({
      successCount: 2,
      failureCount: 0,
      responses: [
        { success: true },
        { success: true },
      ],
    });

    const result = await processPostCreatedEvent({
      eventId: "event-3",
      eventType: "PostCreated",
      postId: "124",
      authorId: "162",
      categoryId: "1",
      title: "Second Book",
      createdAt: "2026-10-05T12:05:00.000Z",
    });

    expect(createInAppNotification).toHaveBeenCalledTimes(1);
    expect(createInAppNotification).toHaveBeenCalledWith({
      userId: "165",
      title: "New Post",
      message: "New post: Second Book",
      postId: "124",
    });

    expect(getActiveDeviceRegistrations).toHaveBeenCalledWith("165");

    expect(sendPushNotificationToTokens).toHaveBeenCalledTimes(1);
    expect(sendPushNotificationToTokens).toHaveBeenCalledWith({
      tokens: ["token-1", "token-2"],
      title: "New Post",
      body: "New post: Second Book",
      data: {
        type: "post_created",
        postId: "124",
      },
    });

    expect(result.recipientCount).toBe(1);
    expect(result.inAppCreatedCount).toBe(1);
    expect(result.pushSuccessCount).toBe(2);
    expect(result.pushFailureCount).toBe(0);
  });

it("should keep the in-app notification when one FCM device fails", async () => {
  vi.clearAllMocks();

  getCategorySubscribers.mockResolvedValue(["165"]);

  getActiveDeviceRegistrations.mockResolvedValue([
    {
      id: "device-1",
      user_id: "165",
      device_id: "android-1",
      fcm_token: "token-1",
      platform: "android",
      is_active: true,
    },
    {
      id: "device-2",
      user_id: "165",
      device_id: "android-2",
      fcm_token: "token-2",
      platform: "android",
      is_active: true,
    },
  ]);

  sendPushNotificationToTokens.mockResolvedValue({
    successCount: 1,
    failureCount: 1,
    responses: [
      {
        success: true,
      },
      {
        success: false,
        error: {
          code: "messaging/internal-error",
        },
      },
    ],
  });

  const result = await processPostCreatedEvent({
    eventId: "event-4",
    eventType: "PostCreated",
    postId: "125",
    authorId: "162",
    categoryId: "1",
    title: "Third Book",
    createdAt: "2026-10-05T12:10:00.000Z",
  });

  expect(createInAppNotification).toHaveBeenCalledTimes(1);

  expect(sendPushNotificationToTokens).toHaveBeenCalledWith({
    tokens: ["token-1", "token-2"],
    title: "New Post",
    body: "New post: Third Book",
    data: {
      type: "post_created",
      postId: "125",
    },
  });

  expect(result.recipientCount).toBe(1);
  expect(result.inAppCreatedCount).toBe(1);
  expect(result.pushSuccessCount).toBe(1);
  expect(result.pushFailureCount).toBe(1);
});

it("should deactivate only confirmed invalid FCM tokens", async () => {
  vi.clearAllMocks();

  getCategorySubscribers.mockResolvedValue(["165"]);

  getActiveDeviceRegistrations.mockResolvedValue([
    {
      id: "device-invalid",
      user_id: "165",
      device_id: "android-invalid",
      fcm_token: "invalid-token",
      platform: "android",
      is_active: true,
    },
    {
      id: "device-temporary",
      user_id: "165",
      device_id: "android-temporary",
      fcm_token: "temporary-token",
      platform: "android",
      is_active: true,
    },
  ]);

  sendPushNotificationToTokens.mockResolvedValue({
    successCount: 0,
    failureCount: 2,
    responses: [
      {
        success: false,
        error: {
          code: "messaging/registration-token-not-registered",
        },
      },
      {
        success: false,
        error: {
          code: "messaging/internal-error",
        },
      },
    ],
  });

  const { isInvalidFcmTokenError } = await import(
    "../src/services/firebaseMessagingService.js"
  );

  isInvalidFcmTokenError
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false);

  const result = await processPostCreatedEvent({
    eventId: "event-5",
    eventType: "PostCreated",
    postId: "126",
    authorId: "162",
    categoryId: "1",
    title: "Fourth Book",
    createdAt: "2026-10-05T12:15:00.000Z",
  });

  expect(createInAppNotification).toHaveBeenCalledTimes(1);

  const { deactivateDeviceRegistrationByToken } = await import(
    "../src/services/deviceRegistrationService.js"
  );

  expect(deactivateDeviceRegistrationByToken).toHaveBeenCalledTimes(1);
  expect(deactivateDeviceRegistrationByToken).toHaveBeenCalledWith(
    "invalid-token"
  );
  expect(deactivateDeviceRegistrationByToken).not.toHaveBeenCalledWith(
    "temporary-token"
  );

  expect(result.pushSuccessCount).toBe(0);
  expect(result.pushFailureCount).toBe(2);
});

it("should create an in-app notification even when the subscriber has no active device", async () => {
  vi.clearAllMocks();

  getCategorySubscribers.mockResolvedValue(["165"]);
  getActiveDeviceRegistrations.mockResolvedValue([]);

  const result = await processPostCreatedEvent({
    eventId: "event-6",
    eventType: "PostCreated",
    postId: "127",
    authorId: "162",
    categoryId: "1",
    title: "Fifth Book",
    createdAt: "2026-10-05T12:20:00.000Z",
  });

  expect(createInAppNotification).toHaveBeenCalledTimes(1);
  expect(createInAppNotification).toHaveBeenCalledWith({
    userId: "165",
    title: "New Post",
    message: "New post: Fifth Book",
    postId: "127",
  });

  expect(getActiveDeviceRegistrations).toHaveBeenCalledWith("165");
  expect(sendPushNotificationToTokens).not.toHaveBeenCalled();

  expect(result.recipientCount).toBe(1);
  expect(result.inAppCreatedCount).toBe(1);
  expect(result.pushSuccessCount).toBe(0);
  expect(result.pushFailureCount).toBe(0);
});
});
