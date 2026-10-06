import { getCategorySubscribers } from "./categorySubscriptionService.js";
import {
  getActiveDeviceRegistrations,
  deactivateDeviceRegistrationByToken,
} from "./deviceRegistrationService.js";
import { createInAppNotification } from "./inAppNotificationService.js";
import {
  sendPushNotificationToTokens,
  isInvalidFcmTokenError,
} from "./firebaseMessagingService.js";

function validatePostCreatedEvent(event) {
  if (!event || typeof event !== "object") {
    throw new Error("Event payload is required");
  }

  if (event.eventType !== "PostCreated") {
    throw new Error("Invalid eventType");
  }

  for (const field of [
    "eventId",
    "postId",
    "authorId",
    "categoryId",
    "title",
    "createdAt",
  ]) {
    if (!event[field]) {
      throw new Error(`${field} is required`);
    }
  }

  if (Number.isNaN(Date.parse(event.createdAt))) {
    throw new Error("Invalid createdAt");
  }

  return {
    eventId: String(event.eventId),
    postId: String(event.postId),
    authorId: String(event.authorId),
    categoryId: String(event.categoryId),
    title: String(event.title),
    createdAt: new Date(event.createdAt).toISOString(),
  };
}

function buildNotificationMessage(title) {
  return `New post: ${title}`;
}

export async function processPostCreatedEvent(event) {
  const post = validatePostCreatedEvent(event);

  const recipientIds = await getCategorySubscribers({
    categoryId: post.categoryId,
    excludeUserId: post.authorId,
  });

  let inAppCreatedCount = 0;
  let pushSuccessCount = 0;
  let pushFailureCount = 0;

  for (const userId of recipientIds) {
    try {
      await createInAppNotification({
        userId,
        title: "New Post",
        message: buildNotificationMessage(post.title),
        postId: post.postId,
      });

      inAppCreatedCount += 1;
    } catch (error) {
      console.error("POST_CREATED_IN_APP_FAILED", {
        eventId: post.eventId,
        postId: post.postId,
        userId,
        error: error?.message,
      });
      continue;
    }

    let devices;

    try {
      devices = await getActiveDeviceRegistrations(userId);
    } catch (error) {
      console.error("POST_CREATED_DEVICE_LOOKUP_FAILED", {
        eventId: post.eventId,
        postId: post.postId,
        userId,
        error: error?.message,
      });
      continue;
    }

    const tokens = devices
      .filter((device) => device.platform === "android")
      .map((device) => device.fcm_token)
      .filter(Boolean);

    if (tokens.length === 0) {
      continue;
    }

    for (let start = 0; start < tokens.length; start += 500) {
      const batch = tokens.slice(start, start + 500);

      try {
        const response = await sendPushNotificationToTokens({
          tokens: batch,
          title: "New Post",
          body: buildNotificationMessage(post.title),
          data: {
            type: "post_created",
            postId: post.postId,
          },
        });

        pushSuccessCount += response.successCount;
        pushFailureCount += response.failureCount;

        const cleanupPromises = [];

        response.responses.forEach((result, index) => {
          if (!result.success && isInvalidFcmTokenError(result.error)) {
            cleanupPromises.push(
              deactivateDeviceRegistrationByToken(batch[index])
            );
          }
        });

        await Promise.all(cleanupPromises);
      } catch (error) {
        pushFailureCount += batch.length;

        console.error("POST_CREATED_PUSH_FAILED", {
          eventId: post.eventId,
          postId: post.postId,
          userId,
          error: error?.message,
        });
      }
    }
  }

  console.log("POST_CREATED_EVENT_PROCESSED", {
    eventId: post.eventId,
    postId: post.postId,
    recipientCount: recipientIds.length,
    inAppCreatedCount,
    pushSuccessCount,
    pushFailureCount,
  });

  return {
    eventId: post.eventId,
    postId: post.postId,
    recipientCount: recipientIds.length,
    inAppCreatedCount,
    pushSuccessCount,
    pushFailureCount,
  };
}
