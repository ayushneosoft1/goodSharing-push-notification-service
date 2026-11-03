import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../src/db/pool.js", () => ({
  pool: {
    query: mockQuery,
  },
}));

import { createDeliveryAttempt } from "../src/services/deliveryAttemptService.js";

describe("Module 5 PR2 - Delivery Attempt Service", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates a pending delivery attempt for a new event/device", async () => {
    const row = {
      id: 1,
      event_id: "event-1",
      user_id: "165",
      device_registration_id: "device-uuid-1",
      status: "PENDING",
      attempt_count: 0,
    };

    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [row],
    });

    const result = await createDeliveryAttempt({
      eventId: "event-1",
      userId: "165",
      deviceRegistrationId: "device-uuid-1",
    });

    expect(result).toEqual({
      created: true,
      deliveryAttempt: row,
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery.mock.calls[0][0]).toContain(
      "ON CONFLICT (event_id, device_registration_id)"
    );
    expect(mockQuery.mock.calls[0][1]).toEqual([
      "event-1",
      "165",
      "device-uuid-1",
    ]);
  });

  it("does not create a duplicate delivery attempt", async () => {
    mockQuery.mockResolvedValueOnce({
      rowCount: 0,
      rows: [],
    });

    const result = await createDeliveryAttempt({
      eventId: "event-1",
      userId: "165",
      deviceRegistrationId: "device-uuid-1",
    });

    expect(result).toEqual({
      created: false,
      deliveryAttempt: null,
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it.each([
    { eventId: "", userId: "165", deviceRegistrationId: "device-1" },
    { eventId: "event-1", userId: "", deviceRegistrationId: "device-1" },
    { eventId: "event-1", userId: "165", deviceRegistrationId: "" },
  ])("rejects missing required fields: %j", async (input) => {
    await expect(createDeliveryAttempt(input)).rejects.toThrow(
      "Missing required delivery attempt fields"
    );

    expect(mockQuery).not.toHaveBeenCalled();
  });
});
