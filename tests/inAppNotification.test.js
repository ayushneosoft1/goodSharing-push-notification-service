import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();

vi.mock("../src/db/pool.js", () => ({
  pool: {
    query: mockQuery,
  },
}));

const {
  createInAppNotification,
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} = await import("../src/services/inAppNotificationService.js");

describe("inAppNotificationService", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("should return the existing notification when the event is a duplicate", async () => {
    const existingNotification = {
      id: "notification-001",
      user_id: "165",
      title: "New Post",
      message: "New post: Test Book",
      post_id: "123",
      event_id: "event-2",
      is_read: false,
      created_at: new Date(),
      read_at: null,
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [existingNotification] });

    const result = await createInAppNotification({
      userId: "165",
      title: "New Post",
      message: "New post: Test Book",
      postId: "123",
      eventId: "event-2",
    });

    expect(result).toEqual({ ...existingNotification, created: false });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[0][0]).toContain("ON CONFLICT (user_id, event_id)");
    expect(mockQuery.mock.calls[0][0]).toContain("DO NOTHING");
    expect(mockQuery.mock.calls[0][1]).toEqual([
      "165",
      "New Post",
      "New post: Test Book",
      "123",
      "event-2",
    ]);
    expect(mockQuery.mock.calls[1][0]).toContain(
      "WHERE user_id = $1 AND event_id = $2",
    );
    expect(mockQuery.mock.calls[1][1]).toEqual(["165", "event-2"]);
  });

  it("should reject getNotifications when userId is missing", async () => {
    await expect(getNotifications({})).rejects.toThrow("userId is required");

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return notifications for the requested user", async () => {
    const now = new Date();

    const notifications = [
      {
        id: "notification-001",
        user_id: "159",
        title: "New post",
        message: "A new post was created",
        post_id: "500",
        is_read: false,
        created_at: now,
        read_at: null,
      },
    ];

    mockQuery.mockResolvedValueOnce({
      rows: notifications,
    });

    const result = await getNotifications({
      userId: "159",
    });

    expect(result).toEqual(notifications);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(mockQuery.mock.calls[0][1]).toEqual(["159", 20, 0]);

    expect(mockQuery.mock.calls[0][0]).toContain("FROM in_app_notifications");

    expect(mockQuery.mock.calls[0][0]).toContain("WHERE user_id = $1");

    expect(mockQuery.mock.calls[0][0]).toContain("ORDER BY created_at DESC");
  });

  it("should use default pagination values", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    await getNotifications({
      userId: "159",
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(mockQuery.mock.calls[0][1]).toEqual(["159", 20, 0]);
  });

  it("should use custom limit", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    await getNotifications({
      userId: "159",
      limit: 50,
    });

    expect(mockQuery.mock.calls[0][1]).toEqual(["159", 50, 0]);
  });

  it("should use custom offset", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    await getNotifications({
      userId: "159",
      offset: 25,
    });

    expect(mockQuery.mock.calls[0][1]).toEqual(["159", 20, 25]);
  });

  it("should cap limit at 100", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    await getNotifications({
      userId: "159",
      limit: 500,
    });

    expect(mockQuery.mock.calls[0][1]).toEqual(["159", 100, 0]);
  });

  it("should normalize negative offset to zero", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    await getNotifications({
      userId: "159",
      offset: -10,
    });

    expect(mockQuery.mock.calls[0][1]).toEqual(["159", 20, 0]);
  });

  it("should reject getUnreadNotificationCount when userId is missing", async () => {
    await expect(getUnreadNotificationCount()).rejects.toThrow(
      "userId is required",
    );

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return unread notification count", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          count: 3,
        },
      ],
    });

    const result = await getUnreadNotificationCount("159");

    expect(result).toBe(3);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(mockQuery.mock.calls[0][1]).toEqual(["159"]);

    expect(mockQuery.mock.calls[0][0]).toContain("WHERE user_id = $1");

    expect(mockQuery.mock.calls[0][0]).toContain("AND is_read = FALSE");
  });

  it("should reject markNotificationRead when userId is missing", async () => {
    await expect(
      markNotificationRead({
        notificationId: "notification-001",
      }),
    ).rejects.toThrow("userId is required");

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should reject markNotificationRead when notificationId is missing", async () => {
    await expect(
      markNotificationRead({
        userId: "159",
      }),
    ).rejects.toThrow("notificationId is required");

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should mark the correct user's notification as read", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "notification-001",
        },
      ],
    });

    const result = await markNotificationRead({
      userId: "159",
      notificationId: "notification-001",
    });

    expect(result).toBe(true);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(mockQuery.mock.calls[0][1]).toEqual(["notification-001", "159"]);

    expect(mockQuery.mock.calls[0][0]).toContain("UPDATE in_app_notifications");

    expect(mockQuery.mock.calls[0][0]).toContain("WHERE id = $1");

    expect(mockQuery.mock.calls[0][0]).toContain("AND user_id = $2");

    expect(mockQuery.mock.calls[0][0]).toContain("is_read = TRUE");
  });

  it("should not mark another user's notification as read", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const result = await markNotificationRead({
      userId: "159",
      notificationId: "notification-belonging-to-user-999",
    });

    expect(result).toBe(false);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(mockQuery.mock.calls[0][1]).toEqual([
      "notification-belonging-to-user-999",
      "159",
    ]);

    expect(mockQuery.mock.calls[0][0]).toContain("AND user_id = $2");

    expect(mockQuery.mock.calls[0][1][1]).toBe("159");
    expect(mockQuery.mock.calls[0][1][1]).not.toBe("999");
  });

  it("should reject markAllNotificationsRead when userId is missing", async () => {
    await expect(markAllNotificationsRead()).rejects.toThrow(
      "userId is required",
    );

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should mark all unread notifications for the user as read", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    const result = await markAllNotificationsRead("159");

    expect(result).toBe(true);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(mockQuery.mock.calls[0][1]).toEqual(["159"]);

    expect(mockQuery.mock.calls[0][0]).toContain("UPDATE in_app_notifications");

    expect(mockQuery.mock.calls[0][0]).toContain("WHERE user_id = $1");

    expect(mockQuery.mock.calls[0][0]).toContain("AND is_read = FALSE");

    expect(mockQuery.mock.calls[0][1]).toEqual(["159"]);
    expect(mockQuery.mock.calls[0][1]).not.toContain("999");
  });
});
