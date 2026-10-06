import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/config/firebase.js", () => ({
  getFirebaseApp: vi.fn(),
}));

vi.mock("../src/config/env.js", () => ({
  env: {
    port: 4003,
    databaseUrl: "postgres://test",
    firebase: {
      projectId: "test",
      clientEmail: "test@example.com",
      privateKey: "test",
    },
    internalEventAuthToken: "test-internal-token",
  },
}));

vi.mock("../src/services/postCreatedEventService.js", () => ({
  processPostCreatedEvent: vi.fn(),
}));

import request from "supertest";
import { createApp } from "../src/app.js";
import { processPostCreatedEvent } from "../src/services/postCreatedEventService.js";

describe("Milestone 4 - PostCreated internal endpoint", () => {
  let app;

  beforeEach(async () => {
    vi.clearAllMocks();
    processPostCreatedEvent.mockImplementation(async (event) => {
      if (event.eventType !== "PostCreated") {
        throw new Error("Invalid eventType");
      }
      return {
      eventId: "event-1",
      postId: "123",
      recipientCount: 1,
      inAppCreatedCount: 1,
      pushSuccessCount: 1,
      pushFailureCount: 0,
      };
    });

    app = await createApp();
  });

  it("should reject missing internal authentication", async () => {
    const response = await request(app)
      .post("/internal/events/post-created")
      .send({});

    expect(response.status).toBe(401);
    expect(processPostCreatedEvent).not.toHaveBeenCalled();
  });

  it("should reject incorrect internal authentication", async () => {
    const response = await request(app)
      .post("/internal/events/post-created")
      .set("x-internal-event-token", "wrong-token")
      .send({});

    expect(response.status).toBe(401);
    expect(processPostCreatedEvent).not.toHaveBeenCalled();
  });


  it("should reject invalid PostCreated event", async () => {
    const response = await request(app)
      .post("/internal/events/post-created")
      .set("x-internal-event-token", "test-internal-token")
      .send({
        eventId: "event-1",
        eventType: "WrongEvent",
        postId: "123",
        authorId: "162",
        categoryId: "1",
        title: "Test Book",
        createdAt: "2026-10-05T12:00:00.000Z",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid eventType");
    expect(processPostCreatedEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "WrongEvent",
      })
    );
  });

  it("should accept correct internal authentication", async () => {
    const event = {
      eventId: "event-1",
      eventType: "PostCreated",
      postId: "123",
      authorId: "162",
      categoryId: "1",
      title: "Test Book",
      createdAt: "2026-10-05T12:00:00.000Z",
    };

    const response = await request(app)
      .post("/internal/events/post-created")
      .set("x-internal-event-token", "test-internal-token")
      .send(event);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(processPostCreatedEvent).toHaveBeenCalledWith(event);
  });
});
