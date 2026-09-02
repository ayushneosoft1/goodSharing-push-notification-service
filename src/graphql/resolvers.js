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

export const resolvers = {
  Query: {
    health: () => ({
      status: "ok",
    }),
  },

  Mutation: {
    registerDevice: async (_parent, { input }, context) => {
      const userId = context.userId;

      if (!userId) {
        throw new Error("Authentication required");
      }

      const device = await registerDevice({
        userId,
        deviceId: input.deviceId,
        fcmToken: input.fcmToken,
        platform: input.platform ?? "android",
      });

      return mapDeviceRegistration(device);
    },

    unregisterDevice: async (_parent, { input }, context) => {
      const userId = context.userId;

      if (!userId) {
        throw new Error("Authentication required");
      }

      const device = await unregisterDevice({
        userId,
        deviceId: input.deviceId,
      });

      return mapDeviceRegistration(device);
    },

    sendTestNotification: async (_parent, { input }, context) => {
      const userId = context.userId;

      if (!userId) {
        throw new Error("Authentication required");
      }

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
  },
};
