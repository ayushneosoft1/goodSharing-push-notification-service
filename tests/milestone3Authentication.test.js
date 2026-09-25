import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

const mockQuery = vi.fn();
const mockCheckDatabaseConnection = vi.fn();
const mockGetFirebaseApp = vi.fn();

vi.mock("../src/db/pool.js", () => ({
  pool: {
    query: mockQuery,
  },
  checkDatabaseConnection: mockCheckDatabaseConnection,
}));

vi.mock("../src/config/firebase.js", () => ({
  getFirebaseApp: mockGetFirebaseApp,
}));

const { createApp } = await import("../src/app.js");

describe("Milestone 3 - Authentication and Ownership", () => {
  let app;

  const authenticatedUser = {
    id: "159",
    email: "user@example.com",
  };

  beforeEach(async () => {
    mockQuery.mockReset();

    mockCheckDatabaseConnection.mockResolvedValue(true);
    mockGetFirebaseApp.mockReturnValue({});

    app = await createApp();
  });

  describe("userCategorySubscriptions", () => {
    it("should reject unauthenticated request", async () => {
      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            query {
              userCategorySubscriptions {
                id
                userId
                categoryId
                createdAt
              }
            }
          `,
        });

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe("Authentication required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should use authenticated x-user.id", async () => {
      const createdAt1 = new Date("2026-09-24T10:00:00.000Z");
      const createdAt2 = new Date("2026-09-24T10:01:00.000Z");

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "subscription-010",
            user_id: "159",
            category_id: "10",
            created_at: createdAt1,
          },
          {
            id: "subscription-020",
            user_id: "159",
            category_id: "20",
            created_at: createdAt2,
          },
        ],
      });

      const response = await request(app)
        .post("/graphql")
        .set("x-user", JSON.stringify(authenticatedUser))
        .send({
          query: `
            query {
              userCategorySubscriptions {
                id
                userId
                categoryId
                createdAt
              }
            }
          `,
        });

      expect(response.body.errors).toBeUndefined();

      expect(response.body.data.userCategorySubscriptions).toEqual([
        {
          id: "subscription-010",
          userId: "159",
          categoryId: "10",
          createdAt: String(createdAt1.getTime()),
        },
        {
          id: "subscription-020",
          userId: "159",
          categoryId: "20",
          createdAt: String(createdAt2.getTime()),
        },
      ]);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][1]).toEqual(["159"]);
    });
  });

  describe("notifications", () => {
    it("should reject unauthenticated request", async () => {
      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            query {
              notifications {
                id
              }
            }
          `,
        });

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe("Authentication required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should fetch only notifications for authenticated user", async () => {
      const now = new Date();

      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "notification-001",
            user_id: "159",
            title: "New Post",
            message: "A new post is available",
            post_id: "123",
            is_read: false,
            created_at: now,
            read_at: null,
          },
        ],
      });

      const response = await request(app)
        .post("/graphql")
        .set("x-user", JSON.stringify(authenticatedUser))
        .send({
          query: `
            query {
              notifications {
                id
                userId
                title
                message
                postId
                isRead
                createdAt
                readAt
              }
            }
          `,
        });

      expect(response.body.errors).toBeUndefined();

      expect(response.body.data.notifications).toHaveLength(1);

      expect(response.body.data.notifications[0]).toEqual({
        id: "notification-001",
        userId: "159",
        title: "New Post",
        message: "A new post is available",
        postId: "123",
        isRead: false,
        createdAt: now.toISOString(),
        readAt: null,
      });

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][1]).toEqual(["159", 20, 0]);
    });
  });

  describe("unreadNotificationCount", () => {
    it("should reject unauthenticated request", async () => {
      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            query {
              unreadNotificationCount
            }
          `,
        });

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe("Authentication required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should return unread count for authenticated user", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            count: 3,
          },
        ],
      });

      const response = await request(app)
        .post("/graphql")
        .set("x-user", JSON.stringify(authenticatedUser))
        .send({
          query: `
            query {
              unreadNotificationCount
            }
          `,
        });

      expect(response.body.errors).toBeUndefined();

      expect(response.body.data.unreadNotificationCount).toBe(3);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][1]).toEqual(["159"]);
    });
  });

  describe("subscribeCategory", () => {
    it("should reject unauthenticated request", async () => {
      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            mutation {
              subscribeCategory(categoryId: "10")
            }
          `,
        });

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe("Authentication required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should subscribe category using authenticated user id", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "subscription-001",
            user_id: "159",
            category_id: "10",
            created_at: new Date(),
          },
        ],
      });

      const response = await request(app)
        .post("/graphql")
        .set("x-user", JSON.stringify(authenticatedUser))
        .send({
          query: `
            mutation {
              subscribeCategory(categoryId: "10")
            }
          `,
        });

      expect(response.body.errors).toBeUndefined();

      expect(response.body.data.subscribeCategory).toBe(true);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][1]).toEqual(["159", "10"]);
    });
  });

  describe("unsubscribeCategory", () => {
    it("should reject unauthenticated request", async () => {
      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            mutation {
              unsubscribeCategory(categoryId: "10")
            }
          `,
        });

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe("Authentication required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should unsubscribe category using authenticated user id", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const response = await request(app)
        .post("/graphql")
        .set("x-user", JSON.stringify(authenticatedUser))
        .send({
          query: `
            mutation {
              unsubscribeCategory(categoryId: "10")
            }
          `,
        });

      expect(response.body.errors).toBeUndefined();

      expect(response.body.data.unsubscribeCategory).toBe(true);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][1]).toEqual(["159", "10"]);
    });
  });

  describe("markNotificationRead", () => {
    it("should reject unauthenticated request", async () => {
      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            mutation {
              markNotificationRead(
                notificationId: "notification-001"
              )
            }
          `,
        });

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe("Authentication required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should mark notification read only for authenticated user", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: "notification-001",
          },
        ],
      });

      const response = await request(app)
        .post("/graphql")
        .set("x-user", JSON.stringify(authenticatedUser))
        .send({
          query: `
            mutation {
              markNotificationRead(
                notificationId: "notification-001"
              )
            }
          `,
        });

      expect(response.body.errors).toBeUndefined();

      expect(response.body.data.markNotificationRead).toBe(true);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][1]).toEqual(["notification-001", "159"]);
    });
  });

  describe("markAllNotificationsRead", () => {
    it("should reject unauthenticated request", async () => {
      const response = await request(app)
        .post("/graphql")
        .send({
          query: `
            mutation {
              markAllNotificationsRead
            }
          `,
        });

      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].message).toBe("Authentication required");

      expect(mockQuery).not.toHaveBeenCalled();
    });

    it("should mark all notifications read for authenticated user", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
      });

      const response = await request(app)
        .post("/graphql")
        .set("x-user", JSON.stringify(authenticatedUser))
        .send({
          query: `
            mutation {
              markAllNotificationsRead
            }
          `,
        });

      expect(response.body.errors).toBeUndefined();

      expect(response.body.data.markAllNotificationsRead).toBe(true);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      expect(mockQuery.mock.calls[0][1]).toEqual(["159"]);
    });
  });
});
