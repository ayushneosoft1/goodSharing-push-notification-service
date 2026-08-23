import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();

vi.mock("../src/db/pool.js", () => ({
  pool: {
    query: mockQuery,
  },
}));

const { registerDevice, unregisterDevice } =
  await import("../src/services/deviceRegistrationService.js");

describe("deviceRegistrationService", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  // ============================================================
  // registerDevice
  // ============================================================

  describe("registerDevice", () => {
    it("should reject when userId is missing", async () => {
      await expect(
        registerDevice({
          deviceId: "device-001",
          fcmToken: "token-001",
          platform: "android",
        }),
      ).rejects.toThrow("userId is required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should reject when deviceId is missing", async () => {
      await expect(
        registerDevice({
          userId: "159",
          fcmToken: "token-001",
          platform: "android",
        }),
      ).rejects.toThrow("deviceId is required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should reject when fcmToken is missing", async () => {
      await expect(
        registerDevice({
          userId: "159",
          deviceId: "device-001",
          platform: "android",
        }),
      ).rejects.toThrow("fcmToken is required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should reject an invalid platform", async () => {
      await expect(
        registerDevice({
          userId: "159",
          deviceId: "device-001",
          fcmToken: "token-001",
          platform: "web",
        }),
      ).rejects.toThrow(
        "Invalid platform. Supported platforms are android and ios",
      );

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should reject another invalid platform", async () => {
      await expect(
        registerDevice({
          userId: "159",
          deviceId: "device-001",
          fcmToken: "token-001",
          platform: "windows",
        }),
      ).rejects.toThrow(
        "Invalid platform. Supported platforms are android and ios",
      );

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should register an Android device successfully", async () => {
      const device = {
        id: "registration-001",
        user_id: "159",
        device_id: "device-001",
        fcm_token: "token-001",
        platform: "android",
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        last_seen_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [device],
      });

      const result = await registerDevice({
        userId: "159",
        deviceId: "device-001",
        fcmToken: "token-001",
        platform: "android",
      });

      expect(result).toEqual(device);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("should register an iOS device successfully", async () => {
      const device = {
        id: "registration-002",
        user_id: "159",
        device_id: "iphone-001",
        fcm_token: "ios-token-001",
        platform: "ios",
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        last_seen_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [device],
      });

      const result = await registerDevice({
        userId: "159",
        deviceId: "iphone-001",
        fcmToken: "ios-token-001",
        platform: "ios",
      });

      expect(result).toEqual(device);
      expect(result.platform).toBe("ios");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("should use android as the default platform", async () => {
      const device = {
        id: "registration-003",
        user_id: "159",
        device_id: "device-003",
        fcm_token: "token-003",
        platform: "android",
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        last_seen_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [device],
      });

      const result = await registerDevice({
        userId: "159",
        deviceId: "device-003",
        fcmToken: "token-003",
      });

      expect(result.platform).toBe("android");
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    // ------------------------------------------------------------
    // Repeated registration / idempotency
    // ------------------------------------------------------------

    it("should not create duplicates when the same user registers the same device again", async () => {
      const device = {
        id: "registration-001",
        user_id: "159",
        device_id: "device-001",
        fcm_token: "token-001",
        platform: "android",
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        last_seen_at: new Date(),
      };

      mockQuery
        .mockResolvedValueOnce({
          rows: [device],
        })
        .mockResolvedValueOnce({
          rows: [device],
        });

      const firstResult = await registerDevice({
        userId: "159",
        deviceId: "device-001",
        fcmToken: "token-001",
        platform: "android",
      });

      const secondResult = await registerDevice({
        userId: "159",
        deviceId: "device-001",
        fcmToken: "token-001",
        platform: "android",
      });

      expect(firstResult.id).toBe("registration-001");
      expect(secondResult.id).toBe("registration-001");

      expect(firstResult.user_id).toBe("159");
      expect(secondResult.user_id).toBe("159");

      expect(firstResult.device_id).toBe("device-001");
      expect(secondResult.device_id).toBe("device-001");

      expect(mockQuery).toHaveBeenCalledTimes(2);

      // Both calls use the same user/device identity.
      expect(mockQuery.mock.calls[0][1]).toEqual([
        "159",
        "device-001",
        "token-001",
        "android",
      ]);

      expect(mockQuery.mock.calls[1][1]).toEqual([
        "159",
        "device-001",
        "token-001",
        "android",
      ]);
    });

    // ------------------------------------------------------------
    // FCM token rotation
    // ------------------------------------------------------------

    it("should update the FCM token when the token rotates", async () => {
      const firstDevice = {
        id: "registration-001",
        user_id: "159",
        device_id: "device-001",
        fcm_token: "token-old",
        platform: "android",
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        last_seen_at: new Date(),
      };

      const rotatedDevice = {
        ...firstDevice,
        fcm_token: "token-new",
      };

      mockQuery
        .mockResolvedValueOnce({
          rows: [firstDevice],
        })
        .mockResolvedValueOnce({
          rows: [rotatedDevice],
        });

      const firstResult = await registerDevice({
        userId: "159",
        deviceId: "device-001",
        fcmToken: "token-old",
        platform: "android",
      });

      const secondResult = await registerDevice({
        userId: "159",
        deviceId: "device-001",
        fcmToken: "token-new",
        platform: "android",
      });

      expect(firstResult.id).toBe("registration-001");
      expect(firstResult.fcm_token).toBe("token-old");

      expect(secondResult.id).toBe("registration-001");
      expect(secondResult.fcm_token).toBe("token-new");

      expect(mockQuery).toHaveBeenCalledTimes(2);

      expect(mockQuery.mock.calls[1][1]).toEqual([
        "159",
        "device-001",
        "token-new",
        "android",
      ]);
    });

    // ------------------------------------------------------------
    // Same device changing users
    // ------------------------------------------------------------

    it("should allow the same device to be registered by another user", async () => {
      const userADevice = {
        id: "registration-user-a",
        user_id: "159",
        device_id: "device-001",
        fcm_token: "token-001",
        platform: "android",
        is_active: false,
        created_at: new Date(),
        updated_at: new Date(),
        last_seen_at: new Date(),
      };

      const userBDevice = {
        id: "registration-user-b",
        user_id: "200",
        device_id: "device-001",
        fcm_token: "token-001",
        platform: "android",
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
        last_seen_at: new Date(),
      };

      mockQuery
        .mockResolvedValueOnce({
          rows: [userADevice],
        })
        .mockResolvedValueOnce({
          rows: [userBDevice],
        });

      const userAResult = await registerDevice({
        userId: "159",
        deviceId: "device-001",
        fcmToken: "token-001",
        platform: "android",
      });

      const userBResult = await registerDevice({
        userId: "200",
        deviceId: "device-001",
        fcmToken: "token-001",
        platform: "android",
      });

      expect(userAResult.user_id).toBe("159");
      expect(userBResult.user_id).toBe("200");

      expect(userAResult.device_id).toBe("device-001");
      expect(userBResult.device_id).toBe("device-001");

      expect(userAResult.is_active).toBe(false);
      expect(userBResult.is_active).toBe(true);

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    // ------------------------------------------------------------
    // Reactivation
    // ------------------------------------------------------------

    it("should reactivate a previously deactivated registration", async () => {
      const inactiveDevice = {
        id: "registration-001",
        user_id: "159",
        device_id: "device-001",
        fcm_token: "token-001",
        platform: "android",
        is_active: false,
        created_at: new Date(),
        updated_at: new Date(),
        last_seen_at: new Date(),
      };

      const reactivatedDevice = {
        ...inactiveDevice,
        is_active: true,
      };

      mockQuery
        .mockResolvedValueOnce({
          rows: [inactiveDevice],
        })
        .mockResolvedValueOnce({
          rows: [reactivatedDevice],
        });

      const inactiveResult = await unregisterDevice({
        userId: "159",
        deviceId: "device-001",
      });

      expect(inactiveResult.is_active).toBe(false);

      const reactivatedResult = await registerDevice({
        userId: "159",
        deviceId: "device-001",
        fcmToken: "token-001",
        platform: "android",
      });

      expect(reactivatedResult.id).toBe("registration-001");
      expect(reactivatedResult.is_active).toBe(true);
      expect(reactivatedResult.fcm_token).toBe("token-001");

      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  // ============================================================
  // unregisterDevice
  // ============================================================

  describe("unregisterDevice", () => {
    it("should reject when userId is missing", async () => {
      await expect(
        unregisterDevice({
          deviceId: "device-001",
        }),
      ).rejects.toThrow("userId is required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should reject when deviceId is missing", async () => {
      await expect(
        unregisterDevice({
          userId: "159",
        }),
      ).rejects.toThrow("deviceId is required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    // ------------------------------------------------------------
    // Logout / deactivation
    // ------------------------------------------------------------

    it("should deactivate an existing device during logout", async () => {
      const device = {
        id: "registration-001",
        user_id: "159",
        device_id: "device-001",
        fcm_token: "token-001",
        platform: "android",
        is_active: false,
        created_at: new Date(),
        updated_at: new Date(),
        last_seen_at: new Date(),
      };

      mockQuery.mockResolvedValueOnce({
        rows: [device],
      });

      const result = await unregisterDevice({
        userId: "159",
        deviceId: "device-001",
      });

      expect(result.id).toBe("registration-001");
      expect(result.user_id).toBe("159");
      expect(result.device_id).toBe("device-001");
      expect(result.is_active).toBe(false);

      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("should throw when the device registration does not exist", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      await expect(
        unregisterDevice({
          userId: "159",
          deviceId: "unknown-device",
        }),
      ).rejects.toThrow("Device registration not found");

      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });
});
