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

vi.mock("../src/services/eventPersistenceService.js", () => ({
  persistPostCreatedEvent: vi.fn(),
}));

import request from "supertest";
import { createApp } from "../src/app.js";
import { persistPostCreatedEvent } from "../src/services/eventPersistenceService.js";

describe("Module 5 - PostCreated persistent event endpoint", () => {
  let app;

  const event = {
    eventId: "event-1",
    eventType: "PostCreated",
    postId: "123",
    authorId: "162",
    categoryId: "1",
    title: "Test Book",
    createdAt: "2026-10-05T12:00:00.000Z",
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    persistPostCreatedEvent.mockImplementation(async (payload) => {
      if (!payload || typeof payload !== "object") {
        throw new Error("Event payload is required");
      }

      if (payload.eventType !== "PostCreated") {
        throw new Error("Invalid eventType");
      }

      return {
        eventId: payload.eventId,
        duplicate: false,
      };
    });

    app = await createApp();
  });

  it("should reject missing internal authentication", async () => {
    const response = await request(app)
      .post("/internal/events/post-created")
      .send(event);

    expect(response.status).toBe(401);
    expect(persistPostCreatedEvent).not.toHaveBeenCalled();
  });

  it("should reject incorrect internal authentication", async () => {
    const response = await request(app)
      .post("/internal/events/post-created")
      .set("x-internal-event-token", "wrong-token")
      .send(event);

    expect(response.status).toBe(401);
    expect(persistPostCreatedEvent).not.toHaveBeenCalled();
  });

  it("should reject a randomly generated internal authentication token", async () => {
    const { randomUUID } = await import("node:crypto");
    const randomToken = `invalid-${randomUUID()}`;

    const response = await request(app)
      .post("/internal/events/post-created")
      .set("x-internal-event-token", randomToken)
      .send(event);

    expect(response.status).toBe(401);
    expect(persistPostCreatedEvent).not.toHaveBeenCalled();
  });

  it("should reject an invalid PostCreated event", async () => {
    const response = await request(app)
      .post("/internal/events/post-created")
      .set("x-internal-event-token", "test-internal-token")
      .send({ ...event, eventType: "WrongEvent" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Invalid eventType");
    expect(persistPostCreatedEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "WrongEvent" }),
    );
  });

  it("should accept a valid event for persistent processing", async () => {
    const response = await request(app)
      .post("/internal/events/post-created")
      .set("x-internal-event-token", "test-internal-token")
      .send(event);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      accepted: true,
      eventId: "event-1",
      duplicate: false,
    });
    expect(persistPostCreatedEvent).toHaveBeenCalledWith(
      expect.objectContaining(event),
    );
  });

  it("should acknowledge duplicate events without creating another job", async () => {
    persistPostCreatedEvent.mockResolvedValueOnce({
      eventId: "event-1",
      duplicate: true,
    });

    const response = await request(app)
      .post("/internal/events/post-created")
      .set("x-internal-event-token", "test-internal-token")
      .send(event);

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      accepted: true,
      eventId: "event-1",
      duplicate: true,
    });
  });

  it("should return 500 when event persistence fails", async () => {
    persistPostCreatedEvent.mockRejectedValueOnce(
      new Error("Database unavailable"),
    );

    const response = await request(app)
      .post("/internal/events/post-created")
      .set("x-internal-event-token", "test-internal-token")
      .send(event);

    expect(response.status).toBe(500);
    expect(response.body.error).toBe("Failed to persist event");
  });
});
