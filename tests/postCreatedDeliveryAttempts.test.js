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

vi.mock("../src/services/deliveryAttemptService.js", () => ({
  createDeliveryAttempt: vi.fn(),
}));

vi.mock("../src/services/firebaseMessagingService.js", () => ({
  sendPushNotificationToTokens: vi.fn(),
  isInvalidFcmTokenError: vi.fn(),
}));

import { getCategorySubscribers } from "../src/services/categorySubscriptionService.js";
import { createInAppNotification } from "../src/services/inAppNotificationService.js";
import { getActiveDeviceRegistrations } from "../src/services/deviceRegistrationService.js";
import { createDeliveryAttempt } from "../src/services/deliveryAttemptService.js";
import { sendPushNotificationToTokens } from "../src/services/firebaseMessagingService.js";
import { processPostCreatedEvent } from "../src/services/postCreatedEventService.js";

describe("Module 5 PR2 - PostCreated Delivery Attempt Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    getCategorySubscribers.mockResolvedValue(["165"]);
    createInAppNotification.mockResolvedValue({ created: true });

    getActiveDeviceRegistrations.mockResolvedValue([
      {
        id: "11111111-1111-4111-8111-111111111111",
        user_id: "165",
        platform: "android",
        fcm_token: "token-one",
        is_active: true,
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        user_id: "165",
        platform: "android",
        fcm_token: "token-two",
        is_active: true,
      },
    ]);

    createDeliveryAttempt.mockResolvedValue({ created: true });
  });

  it("persists one attempt per Android device without sending FCM directly", async () => {
    await processPostCreatedEvent({
      eventId: "pr2-event-1",
      eventType: "PostCreated",
      postId: "123",
      authorId: "162",
      categoryId: "1",
      title: "Test Book",
      createdAt: "2026-10-28T10:00:00.000Z",
    });

    expect(createDeliveryAttempt).toHaveBeenCalledTimes(2);

    expect(createDeliveryAttempt).toHaveBeenCalledWith({
      eventId: "pr2-event-1",
      userId: "165",
      deviceRegistrationId: "11111111-1111-4111-8111-111111111111",
    });

    expect(createDeliveryAttempt).toHaveBeenCalledWith({
      eventId: "pr2-event-1",
      userId: "165",
      deviceRegistrationId: "22222222-2222-4222-8222-222222222222",
    });

    expect(sendPushNotificationToTokens).not.toHaveBeenCalled();
  });
});
