import { getCategorySubscribers } from "./categorySubscriptionService.js";
import { getActiveDeviceRegistrations } from "./deviceRegistrationService.js";
import { createInAppNotification } from "./inAppNotificationService.js";
import { createDeliveryAttempt } from "./deliveryAttemptService.js";

export function validatePostCreatedEvent(event) {
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
  let deliveryAttemptsCreatedCount = 0;

  for (const userId of recipientIds) {
    const notification = await createInAppNotification({
      userId,
      title: "New Post",
      message: buildNotificationMessage(post.title),
      postId: post.postId,
      eventId: post.eventId,
    });

    if (notification.created) {
      inAppCreatedCount += 1;
    }

    const devices = await getActiveDeviceRegistrations(userId);

    for (const device of devices) {
      if (
        device.platform !== "android" ||
        !device.is_active ||
        !device.fcm_token
      ) {
        continue;
      }

      const attempt = await createDeliveryAttempt({
        eventId: post.eventId,
        userId,
        deviceRegistrationId: device.id,
      });

      if (attempt.created) {
        deliveryAttemptsCreatedCount += 1;
      }
    }
  }

  console.log("POST_CREATED_EVENT_PROCESSED", {
    eventId: post.eventId,
    postId: post.postId,
    recipientCount: recipientIds.length,
    inAppCreatedCount,
    deliveryAttemptsCreatedCount,
  });

  return {
    eventId: post.eventId,
    postId: post.postId,
    recipientCount: recipientIds.length,
    inAppCreatedCount,
    deliveryAttemptsCreatedCount,
  };
}
