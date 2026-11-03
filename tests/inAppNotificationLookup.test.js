import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../src/db/pool.js", () => ({
  pool: { query: mockQuery },
}));

const { getNotificationByEventAndUser } = await import(
  "../src/services/inAppNotificationService.js"
);

describe("PR2 - Notification lookup by event and user", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  const params = {
    eventId: "event-123",
    userId: "165",
  };

  it("returns the matching notification", async () => {
    const notification = {
      id: "notification-123",
      user_id: "165",
      event_id: "event-123",
      title: "New Post",
      message: "A new post was created",
      post_id: "123",
    };

    mockQuery.mockResolvedValueOnce({
      rows: [notification],
    });

    const result = await getNotificationByEventAndUser(params);

    expect(result).toEqual(notification);
  });

  it("returns null when notification does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await expect(
      getNotificationByEventAndUser(params),
    ).resolves.toBeNull();
  });

  it("restricts lookup to the requested user", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getNotificationByEventAndUser({
      eventId: "event-123",
      userId: "162",
    });

    expect(mockQuery.mock.calls[0][0]).toContain("user_id = $2");
    expect(mockQuery.mock.calls[0][1]).toEqual([
      "event-123",
      "162",
    ]);
  });

  it("uses parameterized SQL with event and user filters", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await getNotificationByEventAndUser(params);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("event_id = $1"),
      ["event-123", "165"],
    );
  });

  it("rejects missing required inputs", async () => {
    await expect(
      getNotificationByEventAndUser({
        eventId: "",
        userId: "165",
      }),
    ).rejects.toThrow("eventId and userId are required");

    await expect(
      getNotificationByEventAndUser({
        eventId: "event-123",
        userId: "",
      }),
    ).rejects.toThrow("eventId and userId are required");

    expect(mockQuery).not.toHaveBeenCalled();
  });
});
