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

vi.mock("../src/services/deliveryAttemptService.js", () => ({
  createDeliveryAttempt: vi.fn(),
}));

import { getCategorySubscribers } from "../src/services/categorySubscriptionService.js";
import { createInAppNotification } from "../src/services/inAppNotificationService.js";
import { getActiveDeviceRegistrations } from "../src/services/deviceRegistrationService.js";
import { sendPushNotificationToTokens } from "../src/services/firebaseMessagingService.js";
import { createDeliveryAttempt } from "../src/services/deliveryAttemptService.js";
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
      created: true,
    });

    getActiveDeviceRegistrations.mockResolvedValue([]);
    createDeliveryAttempt.mockResolvedValue({ created: true });

    sendPushNotificationToTokens.mockResolvedValue({
      successCount: 0,
      failureCount: 0,
      responses: [],
    });
  });

  it("should create a missing delivery attempt when the in-app notification already exists", async () => {
    getCategorySubscribers.mockResolvedValue(["165"]);

    createInAppNotification.mockResolvedValue({
      id: "notification-1",
      user_id: "165",
      title: "New Post",
      message: "New post: Test Book",
      post_id: "123",
      created: false,
    });

    getActiveDeviceRegistrations.mockResolvedValue([
      {
        id: "device-1",
        user_id: "165",
        device_id: "android-1",
        fcm_token: "token-1",
        platform: "android",
        is_active: true,
      },
    ]);

    const result = await processPostCreatedEvent({
      eventId: "event-replay",
      eventType: "PostCreated",
      postId: "123",
      authorId: "162",
      categoryId: "1",
      title: "Test Book",
      createdAt: "2026-10-05T12:00:00.000Z",
    });

    expect(createInAppNotification).toHaveBeenCalledTimes(1);
    expect(getActiveDeviceRegistrations).toHaveBeenCalledWith("165");

    expect(createDeliveryAttempt).toHaveBeenCalledTimes(1);
    expect(createDeliveryAttempt).toHaveBeenCalledWith({
      eventId: "event-replay",
      userId: "165",
      deviceRegistrationId: "device-1",
    });

    expect(sendPushNotificationToTokens).not.toHaveBeenCalled();

    expect(result.inAppCreatedCount).toBe(0);
    expect(result.deliveryAttemptsCreatedCount).toBe(1);
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
      eventId: "event-2",
    });

    expect(createInAppNotification).toHaveBeenCalledWith({
      userId: "166",
      title: "New Post",
      message: "New post: Test Book",
      postId: "123",
      eventId: "event-2",
    });

    expect(result.recipientCount).toBe(2);
    expect(result.inAppCreatedCount).toBe(2);
    expect(result.deliveryAttemptsCreatedCount).toBe(0);
    expect(createDeliveryAttempt).not.toHaveBeenCalled();
    expect(sendPushNotificationToTokens).not.toHaveBeenCalled();
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
      eventId: "event-3",
    });

    expect(getActiveDeviceRegistrations).toHaveBeenCalledWith("165");

    expect(createDeliveryAttempt).toHaveBeenCalledTimes(2);
    expect(createDeliveryAttempt).toHaveBeenCalledWith({
      eventId: "event-3",
      userId: "165",
      deviceRegistrationId: "device-1",
    });
    expect(createDeliveryAttempt).toHaveBeenCalledWith({
      eventId: "event-3",
      userId: "165",
      deviceRegistrationId: "device-2",
    });
    expect(sendPushNotificationToTokens).not.toHaveBeenCalled();

    expect(result.recipientCount).toBe(1);
    expect(result.inAppCreatedCount).toBe(1);
    expect(result.deliveryAttemptsCreatedCount).toBe(2);
  });

it("should create delivery attempts for two devices without sending FCM", async () => {
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

  expect(getActiveDeviceRegistrations).toHaveBeenCalledWith("165");
  expect(createDeliveryAttempt).toHaveBeenCalledTimes(2);
  expect(createDeliveryAttempt).toHaveBeenCalledWith({
    eventId: "event-4",
    userId: "165",
    deviceRegistrationId: "device-1",
  });
  expect(createDeliveryAttempt).toHaveBeenCalledWith({
    eventId: "event-4",
    userId: "165",
    deviceRegistrationId: "device-2",
  });
  expect(sendPushNotificationToTokens).not.toHaveBeenCalled();

  expect(result.recipientCount).toBe(1);
  expect(result.inAppCreatedCount).toBe(1);
  expect(result.deliveryAttemptsCreatedCount).toBe(2);
});

it("should queue both devices without sending FCM or deactivating tokens", async () => {
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

  expect(createDeliveryAttempt).toHaveBeenCalledTimes(2);
  expect(createDeliveryAttempt).toHaveBeenCalledWith({
    eventId: "event-5",
    userId: "165",
    deviceRegistrationId: "device-invalid",
  });
  expect(createDeliveryAttempt).toHaveBeenCalledWith({
    eventId: "event-5",
    userId: "165",
    deviceRegistrationId: "device-temporary",
  });

  expect(sendPushNotificationToTokens).not.toHaveBeenCalled();
  expect(deactivateDeviceRegistrationByToken).not.toHaveBeenCalled();

  expect(result.inAppCreatedCount).toBe(1);
  expect(result.deliveryAttemptsCreatedCount).toBe(2);
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
    eventId: "event-6",
  });

  expect(getActiveDeviceRegistrations).toHaveBeenCalledWith("165");
  expect(sendPushNotificationToTokens).not.toHaveBeenCalled();

  expect(result.recipientCount).toBe(1);
  expect(result.inAppCreatedCount).toBe(1);
  expect(result.deliveryAttemptsCreatedCount).toBe(0);
  expect(createDeliveryAttempt).not.toHaveBeenCalled();
});

  it("should create only one notification set when the same event is processed twice", async () => {
    getCategorySubscribers.mockResolvedValue(["165"]);

    getActiveDeviceRegistrations.mockResolvedValue([
      {
        id: "device-duplicate",
        user_id: "165",
        device_id: "android-duplicate",
        fcm_token: "duplicate-test-token",
        platform: "android",
        is_active: true,
      },
    ]);

    createInAppNotification
      .mockResolvedValueOnce({
        id: "notification-duplicate",
        user_id: "165",
        created: true,
      })
      .mockResolvedValueOnce({
        id: "notification-duplicate",
        user_id: "165",
        created: false,
      });

    createDeliveryAttempt
      .mockResolvedValueOnce({ created: true })
      .mockResolvedValueOnce({ created: false });

    const event = {
      eventId: "event-duplicate-processing",
      eventType: "PostCreated",
      postId: "duplicate-post-123",
      authorId: "162",
      categoryId: "1",
      title: "Duplicate Test Book",
      createdAt: "2026-10-05T12:00:00.000Z",
    };

    const firstResult = await processPostCreatedEvent(event);
    const secondResult = await processPostCreatedEvent(event);

    expect(createInAppNotification).toHaveBeenCalledTimes(2);
    expect(createDeliveryAttempt).toHaveBeenCalledTimes(2);

    expect(createInAppNotification).toHaveBeenNthCalledWith(1, {
      userId: "165",
      title: "New Post",
      message: "New post: Duplicate Test Book",
      postId: "duplicate-post-123",
      eventId: "event-duplicate-processing",
    });

    expect(createInAppNotification).toHaveBeenNthCalledWith(2, {
      userId: "165",
      title: "New Post",
      message: "New post: Duplicate Test Book",
      postId: "duplicate-post-123",
      eventId: "event-duplicate-processing",
    });

    expect(firstResult.inAppCreatedCount).toBe(1);
    expect(secondResult.inAppCreatedCount).toBe(0);

    expect(firstResult.deliveryAttemptsCreatedCount).toBe(1);
    expect(secondResult.deliveryAttemptsCreatedCount).toBe(0);

    expect(
      firstResult.inAppCreatedCount + secondResult.inAppCreatedCount,
    ).toBe(1);

    expect(
      firstResult.deliveryAttemptsCreatedCount +
        secondResult.deliveryAttemptsCreatedCount,
    ).toBe(1);

    expect(sendPushNotificationToTokens).not.toHaveBeenCalled();
  });

});
