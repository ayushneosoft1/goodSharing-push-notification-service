import {
  registerDevice,
  unregisterDevice,
} from "../services/deviceRegistrationService.js";

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
  },
};
