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
          userId: "user-001",
          fcmToken: "token-001",
          platform: "android",
        }),
      ).rejects.toThrow("deviceId is required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should reject when fcmToken is missing", async () => {
      await expect(
        registerDevice({
          userId: "user-001",
          deviceId: "device-001",
          platform: "android",
        }),
      ).rejects.toThrow("fcmToken is required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should register a device successfully", async () => {
      const device = {
        id: "registration-001",
        user_id: "user-001",
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
        userId: "user-001",
        deviceId: "device-001",
        fcmToken: "token-001",
        platform: "android",
      });

      expect(result).toEqual(device);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("should update an existing device registration", async () => {
      const device = {
        id: "registration-001",
        user_id: "user-001",
        device_id: "device-001",
        fcm_token: "token-002",
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
        userId: "user-001",
        deviceId: "device-001",
        fcmToken: "token-002",
        platform: "android",
      });

      expect(result.id).toBe("registration-001");
      expect(result.fcm_token).toBe("token-002");
      expect(result.is_active).toBe(true);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });

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
          userId: "user-001",
        }),
      ).rejects.toThrow("deviceId is required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should deactivate an existing device", async () => {
      const device = {
        id: "registration-001",
        user_id: "user-001",
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
        userId: "user-001",
        deviceId: "device-001",
      });

      expect(result).toEqual(device);
      expect(result.is_active).toBe(false);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("should throw when device registration does not exist", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      await expect(
        unregisterDevice({
          userId: "user-001",
          deviceId: "unknown-device",
        }),
      ).rejects.toThrow("Device registration not found");

      expect(mockQuery).toHaveBeenCalledTimes(1);
    });
  });
});
