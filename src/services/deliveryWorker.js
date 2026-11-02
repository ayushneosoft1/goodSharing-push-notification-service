import {
  claimNextDeliveryAttempt,
  markDeliveryAttemptSuccess,
  markDeliveryAttemptPermanentFailure,
  markDeliveryAttemptRetryableFailure,
  markDeliveryAttemptDeadLetter,
  recoverStaleFinalDeliveryAttempts,
  releasePreFcmFailedAttempt,
} from "./deliveryAttemptService.js";

import { getActiveDeviceRegistrationById, deactivateDeviceRegistrationByToken } from "./deviceRegistrationService.js";
import { getNotificationByEventAndUser } from "./inAppNotificationService.js";
import { sendPushNotification } from "./firebaseMessagingService.js";
import { classifyFcmError } from "./fcmErrorClassifier.js";
import { getRetryDecision } from "./deliveryRetryPolicy.js";

const POLL_INTERVAL_MS = 1000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function processNextDeliveryAttempt() {
  const attempt = await claimNextDeliveryAttempt();

  if (!attempt) return false;

  const ownership = {
    attemptId: attempt.id,
    claimToken: attempt.claim_token,
  };

  const requireOwnership = (updated) => {
    if (!updated) {
      console.error("DELIVERY_ATTEMPT_CLAIM_LOST", {
        attemptId: attempt.id,
      });
    }
    return updated;
  };

  let device;
  let notification;

  try {
    device = await getActiveDeviceRegistrationById({
      deviceRegistrationId: attempt.device_registration_id,
      userId: attempt.user_id,
    });

    if (device) {
      notification = await getNotificationByEventAndUser({
        eventId: attempt.event_id,
        userId: attempt.user_id,
      });
    }
  } catch (error) {
    const recovered = await releasePreFcmFailedAttempt({
      ...ownership,
      nextAttemptAt: new Date(Date.now() + 30_000),
    });

    requireOwnership(recovered);

    console.error("DELIVERY_PRE_FCM_LOOKUP_FAILED", {
      attemptId: attempt.id,
      error: error?.message,
    });

    return true;
  }

  if (!device) {
    requireOwnership(
      await markDeliveryAttemptPermanentFailure({
        ...ownership,
        errorCode: "delivery/device-inactive-or-missing",
      }),
    );
    return true;
  }

  if (!notification) {
    requireOwnership(
      await markDeliveryAttemptPermanentFailure({
        ...ownership,
        errorCode: "delivery/notification-not-found",
      }),
    );
    return true;
  }

  let fcmError = null;

  try {
    await sendPushNotification({
      token: device.fcm_token,
      title: notification.title,
      body: notification.message,
      data: {
        postId: String(notification.post_id),
        eventId: String(attempt.event_id),
      },
    });
  } catch (error) {
    fcmError = error;
  }

  if (!fcmError) {
    if (requireOwnership(await markDeliveryAttemptSuccess(ownership))) {
      console.log("DELIVERY_ATTEMPT_SUCCESS", {
        attemptId: attempt.id,
      });
    }
    return true;
  }

  const classification = classifyFcmError(fcmError);
  let updated = false;

  if (!classification.shouldRetry) {
    updated = await markDeliveryAttemptPermanentFailure({
      ...ownership,
      errorCode: classification.errorCode,
    });

    if (
      updated &&
      classification.shouldDeactivateDevice &&
      device.fcm_token
    ) {
      try {
        await deactivateDeviceRegistrationByToken(device.fcm_token);
      } catch (error) {
        console.error("DELIVERY_DEVICE_DEACTIVATION_FAILED", {
          attemptId: attempt.id,
          error: error?.message,
        });
      }
    }
  } else {
    const decision = getRetryDecision(attempt.attempt_count);

    if (decision.status === "DEAD_LETTER") {
      updated = await markDeliveryAttemptDeadLetter({
        ...ownership,
        errorCode: classification.errorCode,
      });
    } else {
      updated = await markDeliveryAttemptRetryableFailure({
        ...ownership,
        errorCode: classification.errorCode,
        nextAttemptAt: decision.nextAttemptAt,
      });
    }
  }

  if (!requireOwnership(updated)) return true;

  console.error("DELIVERY_ATTEMPT_FAILED", {
    attemptId: attempt.id,
    status: classification.shouldRetry
      ? attempt.attempt_count >= 5
        ? "DEAD_LETTER"
        : "FAILED_RETRYABLE"
      : "FAILED_PERMANENT",
    errorCode: classification.errorCode,
  });

  return true;
}

let stopRequested = false;
let workerPromise = null;

export async function startDeliveryWorker() {
  if (workerPromise) return workerPromise;

  stopRequested = false;
  console.log("DELIVERY_WORKER_STARTED");

  workerPromise = (async () => {
    while (!stopRequested) {
      try {
        await recoverStaleFinalDeliveryAttempts();

        const processed = await processNextDeliveryAttempt();

        if (!processed && !stopRequested) {
          await sleep(POLL_INTERVAL_MS);
        }
      } catch (error) {
        console.error("DELIVERY_WORKER_LOOP_FAILED", {
          error: error?.message,
        });

        if (!stopRequested) {
          await sleep(POLL_INTERVAL_MS);
        }
      }
    }

    console.log("DELIVERY_WORKER_STOPPED");
  })();

  try {
    await workerPromise;
  } finally {
    workerPromise = null;
  }
}

export async function stopDeliveryWorker() {
  stopRequested = true;

  if (workerPromise) {
    await workerPromise;
  }
}
