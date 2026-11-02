import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/services/deliveryAttemptService.js", () => ({
  claimNextDeliveryAttempt: vi.fn(),
  markDeliveryAttemptSuccess: vi.fn(),
  markDeliveryAttemptPermanentFailure: vi.fn(),
  markDeliveryAttemptRetryableFailure: vi.fn(),
  markDeliveryAttemptDeadLetter: vi.fn(),
  recoverStaleFinalDeliveryAttempts: vi.fn(),
  releasePreFcmFailedAttempt: vi.fn(),
}));

vi.mock("../src/services/deviceRegistrationService.js", () => ({
  getActiveDeviceRegistrationById: vi.fn(),
  deactivateDeviceRegistrationByToken: vi.fn(),
}));

vi.mock("../src/services/inAppNotificationService.js", () => ({
  getNotificationByEventAndUser: vi.fn(),
}));

vi.mock("../src/services/firebaseMessagingService.js", () => ({
  sendPushNotification: vi.fn(),
}));

import {
  claimNextDeliveryAttempt,
  markDeliveryAttemptSuccess,
  markDeliveryAttemptPermanentFailure,
  markDeliveryAttemptRetryableFailure,
  markDeliveryAttemptDeadLetter,
  releasePreFcmFailedAttempt,
} from "../src/services/deliveryAttemptService.js";

import {
  getActiveDeviceRegistrationById,
  deactivateDeviceRegistrationByToken,
} from "../src/services/deviceRegistrationService.js";

import { getNotificationByEventAndUser } from "../src/services/inAppNotificationService.js";
import { sendPushNotification } from "../src/services/firebaseMessagingService.js";
import { processNextDeliveryAttempt } from "../src/services/deliveryWorker.js";

describe("Module 5 PR2 - Delivery Worker", () => {
  const attempt = {
    id: 10,
    event_id: "event-123",
    user_id: "165",
    device_registration_id: "11111111-1111-4111-8111-111111111111",
    claim_token: "claim-token-123",
    attempt_count: 1,
  };

  const ownership = {
    attemptId: 10,
    claimToken: "claim-token-123",
  };

  beforeEach(() => {
    vi.resetAllMocks();

    claimNextDeliveryAttempt.mockResolvedValue({ ...attempt });

    getActiveDeviceRegistrationById.mockResolvedValue({
      id: attempt.device_registration_id,
      fcm_token: "valid-token",
      platform: "android",
      is_active: true,
    });

    getNotificationByEventAndUser.mockResolvedValue({
      title: "New Post",
      message: "New post: Test Book",
      post_id: "123",
    });

    sendPushNotification.mockResolvedValue("fcm-message-id");

    markDeliveryAttemptSuccess.mockResolvedValue(true);
    markDeliveryAttemptPermanentFailure.mockResolvedValue(true);
    markDeliveryAttemptRetryableFailure.mockResolvedValue(true);
    markDeliveryAttemptDeadLetter.mockResolvedValue(true);
    releasePreFcmFailedAttempt.mockResolvedValue(true);
    deactivateDeviceRegistrationByToken.mockResolvedValue(true);
  });

  it("returns false when no delivery attempt is available", async () => {
    claimNextDeliveryAttempt.mockResolvedValueOnce(null);

    await expect(processNextDeliveryAttempt()).resolves.toBe(false);
    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it("sends FCM and marks successful delivery", async () => {
    await expect(processNextDeliveryAttempt()).resolves.toBe(true);

    expect(sendPushNotification).toHaveBeenCalledWith({
      token: "valid-token",
      title: "New Post",
      body: "New post: Test Book",
      data: {
        postId: "123",
        eventId: "event-123",
      },
    });

    expect(markDeliveryAttemptSuccess).toHaveBeenCalledWith(ownership);
    expect(markDeliveryAttemptRetryableFailure).not.toHaveBeenCalled();
  });

  it("marks missing device as permanent failure", async () => {
    getActiveDeviceRegistrationById.mockResolvedValueOnce(null);

    await expect(processNextDeliveryAttempt()).resolves.toBe(true);

    expect(markDeliveryAttemptPermanentFailure).toHaveBeenCalledWith({
      ...ownership,
      errorCode: "delivery/device-inactive-or-missing",
    });

    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it("marks missing notification as permanent failure", async () => {
    getNotificationByEventAndUser.mockResolvedValueOnce(null);

    await expect(processNextDeliveryAttempt()).resolves.toBe(true);

    expect(markDeliveryAttemptPermanentFailure).toHaveBeenCalledWith({
      ...ownership,
      errorCode: "delivery/notification-not-found",
    });

    expect(sendPushNotification).not.toHaveBeenCalled();
  });

  it.each([
    ["device", "getActiveDeviceRegistrationById"],
    ["notification", "getNotificationByEventAndUser"],
  ])("recovers pre-FCM %s database lookup failure", async (lookup) => {
    const dbError = new Error("Database unavailable");

    if (lookup == "device") {
      getActiveDeviceRegistrationById.mockRejectedValueOnce(dbError);
    } else {
      getNotificationByEventAndUser.mockRejectedValueOnce(dbError);
    }

    await expect(processNextDeliveryAttempt()).resolves.toBe(true);

    expect(releasePreFcmFailedAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        ...ownership,
        nextAttemptAt: expect.any(Date),
      }),
    );
    expect(sendPushNotification).not.toHaveBeenCalled();
    expect(markDeliveryAttemptPermanentFailure).not.toHaveBeenCalled();
    expect(markDeliveryAttemptRetryableFailure).not.toHaveBeenCalled();
  });

  it("deactivates device for invalid FCM token", async () => {
    sendPushNotification.mockRejectedValueOnce({
      code: "messaging/registration-token-not-registered",
    });

    await expect(processNextDeliveryAttempt()).resolves.toBe(true);

    expect(markDeliveryAttemptPermanentFailure).toHaveBeenCalledWith({
      ...ownership,
      errorCode: "messaging/registration-token-not-registered",
    });

    expect(deactivateDeviceRegistrationByToken).toHaveBeenCalledWith(
      "valid-token",
    );

    expect(markDeliveryAttemptRetryableFailure).not.toHaveBeenCalled();
  });

  it("schedules retry for transient FCM failure", async () => {
    sendPushNotification.mockRejectedValueOnce({
      code: "messaging/unavailable",
    });

    await expect(processNextDeliveryAttempt()).resolves.toBe(true);

    expect(markDeliveryAttemptRetryableFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        ...ownership,
        errorCode: "messaging/unavailable",
        nextAttemptAt: expect.any(Date),
      }),
    );

    expect(markDeliveryAttemptDeadLetter).not.toHaveBeenCalled();
  });

  it("moves fifth failed attempt to DEAD_LETTER", async () => {
    claimNextDeliveryAttempt.mockResolvedValueOnce({
      ...attempt,
      attempt_count: 5,
    });

    sendPushNotification.mockRejectedValueOnce({
      code: "messaging/unavailable",
    });

    await expect(processNextDeliveryAttempt()).resolves.toBe(true);

    expect(markDeliveryAttemptDeadLetter).toHaveBeenCalledWith({
      ...ownership,
      errorCode: "messaging/unavailable",
    });

    expect(markDeliveryAttemptRetryableFailure).not.toHaveBeenCalled();
  });

  it("does not deactivate device when permanent failure loses claim", async () => {
    sendPushNotification.mockRejectedValueOnce({
      code: "messaging/invalid-registration-token",
    });

    markDeliveryAttemptPermanentFailure.mockResolvedValueOnce(false);

    await expect(processNextDeliveryAttempt()).resolves.toBe(true);

    expect(deactivateDeviceRegistrationByToken).not.toHaveBeenCalled();
  });

  it("propagates database error after successful FCM send", async () => {
    markDeliveryAttemptSuccess.mockRejectedValueOnce(
      new Error("Database unavailable"),
    );

    await expect(processNextDeliveryAttempt()).rejects.toThrow(
      "Database unavailable",
    );

    expect(sendPushNotification).toHaveBeenCalledTimes(1);
    expect(markDeliveryAttemptRetryableFailure).not.toHaveBeenCalled();
    expect(markDeliveryAttemptPermanentFailure).not.toHaveBeenCalled();
  });

  it("handles token deactivation database failure separately", async () => {
    sendPushNotification.mockRejectedValueOnce({
      code: "messaging/invalid-registration-token",
    });

    deactivateDeviceRegistrationByToken.mockRejectedValueOnce(
      new Error("Database unavailable"),
    );

    await expect(processNextDeliveryAttempt()).resolves.toBe(true);

    expect(markDeliveryAttemptPermanentFailure).toHaveBeenCalledWith({
      ...ownership,
      errorCode: "messaging/invalid-registration-token",
    });

    expect(markDeliveryAttemptRetryableFailure).not.toHaveBeenCalled();
  });
});
