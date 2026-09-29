import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();

vi.mock("../src/db/pool.js", () => ({
  pool: {
    query: mockQuery,
  },
}));

const { subscribeCategory, unsubscribeCategory, getUserCategorySubscriptions } =
  await import("../src/services/categorySubscriptionService.js");

describe("categorySubscriptionService", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("should reject when userId is missing", async () => {
    await expect(subscribeCategory({ categoryId: "1" })).rejects.toThrow(
      "userId is required",
    );

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should reject when categoryId is missing", async () => {
    await expect(subscribeCategory({ userId: "159" })).rejects.toThrow(
      "categoryId is required",
    );

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should subscribe a user to a category", async () => {
    const now = new Date();

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: "1" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "subscription-001",
            user_id: "159",
            category_id: "1",
            created_at: now,
          },
        ],
      });

    const result = await subscribeCategory({
      userId: "159",
      categoryId: "1",
    });

    expect(result).toEqual({
      id: "subscription-001",
      user_id: "159",
      category_id: "1",
      created_at: now,
    });

    expect(mockQuery).toHaveBeenCalledTimes(2);

    expect(mockQuery.mock.calls[1][1]).toEqual(["159", "1"]);

    expect(mockQuery.mock.calls[1][0]).toContain(
      "INSERT INTO category_subscriptions",
    );

    expect(mockQuery.mock.calls[1][0]).toContain(
      "ON CONFLICT (user_id, category_id)",
    );

    expect(mockQuery.mock.calls[1][0]).toContain("DO NOTHING");
  });

  it("should be idempotent when subscribing to the same category twice", async () => {
    const now = new Date();

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: "1" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "subscription-001",
            user_id: "159",
            category_id: "1",
            created_at: now,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "1" }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const firstResult = await subscribeCategory({
      userId: "159",
      categoryId: "1",
    });

    const secondResult = await subscribeCategory({
      userId: "159",
      categoryId: "1",
    });

    expect(firstResult).not.toBeNull();
    expect(secondResult).toBeNull();

    expect(mockQuery).toHaveBeenCalledTimes(4);

    expect(mockQuery.mock.calls[1][1]).toEqual(["159", "1"]);

    expect(mockQuery.mock.calls[3][1]).toEqual(["159", "1"]);

    expect(mockQuery.mock.calls[3][0]).toContain(
      "ON CONFLICT (user_id, category_id)",
    );
  });

  it("should allow the same user to subscribe to different categories", async () => {
    const now = new Date();

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: "1" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "subscription-001",
            user_id: "159",
            category_id: "1",
            created_at: now,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "2" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "subscription-002",
            user_id: "159",
            category_id: "2",
            created_at: now,
          },
        ],
      });

    await subscribeCategory({
      userId: "159",
      categoryId: "1",
    });

    await subscribeCategory({
      userId: "159",
      categoryId: "2",
    });

    expect(mockQuery).toHaveBeenCalledTimes(4);

    expect(mockQuery.mock.calls[1][1]).toEqual(["159", "1"]);

    expect(mockQuery.mock.calls[3][1]).toEqual(["159", "2"]);
  });

  it("should reject unsubscribe when userId is missing", async () => {
    await expect(unsubscribeCategory({ categoryId: "1" })).rejects.toThrow(
      "userId is required",
    );

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should reject unsubscribe when categoryId is missing", async () => {
    await expect(unsubscribeCategory({ userId: "159" })).rejects.toThrow(
      "categoryId is required",
    );

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should unsubscribe the correct user and category", async () => {
    const now = new Date();

    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: "1" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: "subscription-001",
            user_id: "159",
            category_id: "1",
            created_at: now,
          },
        ],
      });

    const result = await unsubscribeCategory({
      userId: "159",
      categoryId: "1",
    });

    expect(result).toBe(true);

    expect(mockQuery).toHaveBeenCalledTimes(2);

    expect(mockQuery.mock.calls[1][1]).toEqual(["159", "1"]);

    expect(mockQuery.mock.calls[1][0]).toContain(
      "DELETE FROM category_subscriptions",
    );

    expect(mockQuery.mock.calls[1][0]).toContain("WHERE user_id = $1");

    expect(mockQuery.mock.calls[1][0]).toContain("AND category_id = $2");
  });

  it("should return false when unsubscribing a non-existing subscription", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: "4" }],
      })
      .mockResolvedValueOnce({
        rows: [],
      });

    const result = await unsubscribeCategory({
      userId: "159",
      categoryId: "4",
    });

    expect(result).toBe(false);

    expect(mockQuery).toHaveBeenCalledTimes(2);

    expect(mockQuery.mock.calls[1][1]).toEqual(["159", "4"]);
  });

  it("should reject subscribe when category does not exist", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    await expect(
      subscribeCategory({
        userId: "159",
        categoryId: "999",
      }),
    ).rejects.toThrow("Invalid category");

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("should reject unsubscribe when category does not exist", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
    });

    await expect(
      unsubscribeCategory({
        userId: "159",
        categoryId: "999",
      }),
    ).rejects.toThrow("Invalid category");

    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("should reject getUserCategorySubscriptions when userId is missing", async () => {
    await expect(getUserCategorySubscriptions()).rejects.toThrow(
      "userId is required",
    );

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should return only the requested user's category subscriptions", async () => {
    const createdAt1 = new Date("2026-09-24T10:00:00.000Z");
    const createdAt2 = new Date("2026-09-24T10:01:00.000Z");
    const createdAt3 = new Date("2026-09-24T10:02:00.000Z");

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "subscription-001",
          user_id: "159",
          category_id: "1",
          created_at: createdAt1,
        },
        {
          id: "subscription-002",
          user_id: "159",
          category_id: "2",
          created_at: createdAt2,
        },
        {
          id: "subscription-003",
          user_id: "159",
          category_id: "3",
          created_at: createdAt3,
        },
      ],
    });

    const result = await getUserCategorySubscriptions("159");

    expect(result).toEqual([
      {
        id: "subscription-001",
        userId: "159",
        categoryId: "1",
        createdAt: createdAt1,
      },
      {
        id: "subscription-002",
        userId: "159",
        categoryId: "2",
        createdAt: createdAt2,
      },
      {
        id: "subscription-003",
        userId: "159",
        categoryId: "3",
        createdAt: createdAt3,
      },
    ]);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    expect(mockQuery.mock.calls[0][1]).toEqual(["159"]);

    expect(mockQuery.mock.calls[0][0]).toContain("FROM category_subscriptions");

    expect(mockQuery.mock.calls[0][0]).toContain("WHERE user_id = $1");

    expect(mockQuery.mock.calls[0][0]).toContain("ORDER BY category_id");
  });

  it("should use the authenticated userId for user isolation", async () => {
    const createdAt = new Date("2026-09-24T10:00:00.000Z");

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "subscription-050",
          user_id: "159",
          category_id: "4",
          created_at: createdAt,
        },
      ],
    });

    const result = await getUserCategorySubscriptions("159");

    expect(result).toEqual([
      {
        id: "subscription-050",
        userId: "159",
        categoryId: "4",
        createdAt,
      },
    ]);

    expect(mockQuery).toHaveBeenCalledTimes(1);

    const query = mockQuery.mock.calls[0][0];
    const values = mockQuery.mock.calls[0][1];

    expect(query).toContain("WHERE user_id = $1");
    expect(values).toEqual(["159"]);
    expect(values).not.toContain("999");
  });
});
