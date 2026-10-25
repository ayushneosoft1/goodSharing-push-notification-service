import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockConnect, mockQuery, mockRelease } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockQuery: vi.fn(),
  mockRelease: vi.fn(),
}));

vi.mock("../src/db/pool.js", () => ({
  pool: {
    connect: mockConnect,
  },
}));

import { persistPostCreatedEvent } from "../src/services/eventPersistenceService.js";

describe("Module 5 - Persistent event storage", () => {
  const event = {
    eventId: "unit-test-event-1",
    eventType: "PostCreated",
    postId: "123",
    authorId: "162",
    categoryId: "1",
    title: "Test Book",
    createdAt: "2026-10-05T12:00:00.000Z",
  };

  let client;

  beforeEach(() => {
    vi.clearAllMocks();

    client = {
      query: mockQuery,
      release: mockRelease,
    };

    mockConnect.mockResolvedValue(client);
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [] });
  });

  it("persists a new event and creates its job in one transaction", async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ event_id: event.eventId }],
      }) // event insert
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // job insert
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }); // COMMIT

    const result = await persistPostCreatedEvent(event);

    expect(result).toEqual({
      eventId: event.eventId,
      duplicate: false,
    });
    expect(
      mockQuery.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0]),
    ).toEqual(["BEGIN", "INSERT", "INSERT", "COMMIT"]);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("does not create another job for a duplicate event", async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rowCount: 0, rows: [] }) // duplicate event
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }); // COMMIT

    const result = await persistPostCreatedEvent(event);

    expect(result).toEqual({
      eventId: event.eventId,
      duplicate: true,
    });
    expect(mockQuery).toHaveBeenCalledTimes(3);
    expect(mockQuery.mock.calls[1][0]).toContain(
      "ON CONFLICT (event_id) DO NOTHING",
    );
    expect(mockQuery.mock.calls[2][0].trim()).toBe("COMMIT");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("rolls back and throws when COMMIT fails", async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ event_id: event.eventId }],
      }) // event insert
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // job insert
      .mockRejectedValueOnce(new Error("COMMIT failed")) // COMMIT
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }); // ROLLBACK

    await expect(persistPostCreatedEvent(event)).rejects.toThrow(
      "COMMIT failed",
    );

    expect(mockQuery.mock.calls[3][0].trim()).toBe("COMMIT");
    expect(mockQuery.mock.calls[4][0].trim()).toBe("ROLLBACK");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("rolls back when job creation fails", async () => {
    mockQuery
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // BEGIN
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ event_id: event.eventId }],
      }) // event insert
      .mockRejectedValueOnce(new Error("Job insert failed")) // job insert
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }); // ROLLBACK

    await expect(persistPostCreatedEvent(event)).rejects.toThrow(
      "Job insert failed",
    );

    expect(mockQuery.mock.calls[3][0].trim()).toBe("ROLLBACK");
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid events before acquiring a database connection", async () => {
    await expect(
      persistPostCreatedEvent({ ...event, eventType: "WrongEvent" }),
    ).rejects.toThrow();

    expect(mockConnect).not.toHaveBeenCalled();
    expect(mockRelease).not.toHaveBeenCalled();
  });
});
