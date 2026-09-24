import {
  registerDevice,
  unregisterDevice,
  getActiveDeviceRegistrations,
  deactivateDeviceRegistrationByToken,
} from "../services/deviceRegistrationService.js";

import {
  sendPushNotificationToTokens,
  isInvalidFcmTokenError,
} from "../services/firebaseMessagingService.js";

import {
  subscribeCategory,
  unsubscribeCategory,
  getUserCategorySubscriptions,
} from "../services/categorySubscriptionService.js";

import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "../services/inAppNotificationService.js";

function mapDeviceRegistration(device) {
  if (!device) {
    throw new Error("Device registration not found");
  }

  return {
    id: device.id,
    userId: device.user_id,
    deviceId: device.device_id,
    platform: device.platform,
    isActive: device.is_active,
    createdAt: device.created_at.toISOString(),
    updatedAt: device.updated_at.toISOString(),
    lastSeenAt: device.last_seen_at.toISOString(),
  };
}

function mapInAppNotification(notification) {
  return {
    id: notification.id,
    userId: notification.user_id,
    title: notification.title,
    message: notification.message,
    postId: notification.post_id,
    isRead: notification.is_read,
    createdAt: notification.created_at.toISOString(),
    readAt: notification.read_at ? notification.read_at.toISOString() : null,
  };
}

function requireAuthenticatedUser(context) {
  const userId = context.userId;

  if (!userId) {
    throw new Error("Authentication required");
  }

  return userId;
}

export const resolvers = {
  Query: {
    health: () => ({
      status: "ok",
    }),

    userCategorySubscriptions: async (_parent, _args, context) => {
      const userId = requireAuthenticatedUser(context);

      return getUserCategorySubscriptions(userId);
    },

    notifications: async (_parent, { limit, offset }, context) => {
      const userId = requireAuthenticatedUser(context);

      const notifications = await getNotifications({
        userId,
        limit,
        offset,
      });

      return notifications.map(mapInAppNotification);
    },

    unreadNotificationCount: async (_parent, _args, context) => {
      const userId = requireAuthenticatedUser(context);

      return getUnreadNotificationCount(userId);
    },
  },

  Mutation: {
    registerDevice: async (_parent, { input }, context) => {
      const userId = requireAuthenticatedUser(context);

      const device = await registerDevice({
        userId,
        deviceId: input.deviceId,
        fcmToken: input.fcmToken,
        platform: input.platform ?? "android",
      });

      return mapDeviceRegistration(device);
    },

    unregisterDevice: async (_parent, { input }, context) => {
      const userId = requireAuthenticatedUser(context);

      const device = await unregisterDevice({
        userId,
        deviceId: input.deviceId,
      });

      return mapDeviceRegistration(device);
    },

    sendTestNotification: async (_parent, { input }, context) => {
      const userId = requireAuthenticatedUser(context);

      const devices = await getActiveDeviceRegistrations(userId);

      const tokens = devices.map((device) => device.fcm_token).filter(Boolean);

      if (tokens.length === 0) {
        return {
          successCount: 0,
          failureCount: 0,
          totalTokens: 0,
        };
      }

      const response = await sendPushNotificationToTokens({
        tokens,
        title: input.title,
        body: input.body,
        data: {
          type: input.type ?? "test",
          ...(input.targetId ? { targetId: input.targetId } : {}),
        },
      });

      const cleanupPromises = [];

      response.responses.forEach((result, index) => {
        if (!result.success && isInvalidFcmTokenError(result.error)) {
          const invalidToken = tokens[index];

          cleanupPromises.push(
            deactivateDeviceRegistrationByToken(invalidToken),
          );
        }
      });

      await Promise.all(cleanupPromises);

      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
        totalTokens: tokens.length,
      };
    },

    subscribeCategory: async (_parent, { categoryId }, context) => {
      const userId = requireAuthenticatedUser(context);

      await subscribeCategory({
        userId,
        categoryId,
      });

      return true;
    },

    unsubscribeCategory: async (_parent, { categoryId }, context) => {
      const userId = requireAuthenticatedUser(context);

      await unsubscribeCategory({
        userId,
        categoryId,
      });

      return true;
    },

    markNotificationRead: async (_parent, { notificationId }, context) => {
      const userId = requireAuthenticatedUser(context);

      return markNotificationRead({
        userId,
        notificationId,
      });
    },

    markAllNotificationsRead: async (_parent, _args, context) => {
      const userId = requireAuthenticatedUser(context);

      return markAllNotificationsRead(userId);
    },
  },
};
