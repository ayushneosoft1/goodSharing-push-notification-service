import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../src/db/pool.js", () => ({
  pool: {
    query: mockQuery,
  },
}));

const { getActiveDeviceRegistrationById } = await import(
  "../src/services/deviceRegistrationService.js"
);

describe("PR2 - Active device registration lookup", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  const params = {
    deviceRegistrationId: "11111111-1111-4111-8111-111111111111",
    userId: "165",
  };

  it("returns an active Android device and its token", async () => {
    const device = {
      id: params.deviceRegistrationId,
      user_id: "165",
      device_id: "android-001",
      fcm_token: "valid-fcm-token",
      platform: "android",
      is_active: true,
    };

    mockQuery.mockResolvedValueOnce({ rows: [device] });

    const result = await getActiveDeviceRegistrationById(params);

    expect(result).toEqual(device);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM device_registrations"),
      [params.deviceRegistrationId, params.userId],
    );
  });

  it("excludes inactive devices through SQL filtering", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getActiveDeviceRegistrationById(params);

    expect(result).toBeNull();
    expect(mockQuery.mock.calls[0][0]).toContain("is_active = TRUE");
  });

  it("restricts lookup to the requested user", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await getActiveDeviceRegistrationById({
      ...params,
      userId: "162",
    });

    expect(result).toBeNull();
    expect(mockQuery.mock.calls[0][0]).toContain("user_id = $2");
    expect(mockQuery.mock.calls[0][1]).toEqual([
      params.deviceRegistrationId,
      "162",
    ]);
  });

  it("returns null when registration is not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      getActiveDeviceRegistrationById(params),
    ).resolves.toBeNull();

    expect(mockQuery.mock.calls[0][0]).toContain("platform = 'android'");
  });

  it("rejects missing required input without querying database", async () => {
    await expect(
      getActiveDeviceRegistrationById({
        deviceRegistrationId: "",
        userId: "165",
      }),
    ).rejects.toThrow("deviceRegistrationId and userId are required");

    await expect(
      getActiveDeviceRegistrationById({
        deviceRegistrationId: params.deviceRegistrationId,
        userId: "",
      }),
    ).rejects.toThrow("deviceRegistrationId and userId are required");

    expect(mockQuery).not.toHaveBeenCalled();
  });
});
