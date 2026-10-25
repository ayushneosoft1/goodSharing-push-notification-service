import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockConnect,
  mockClientQuery,
  mockPoolQuery,
  mockRelease,
  mockProcessEvent,
} = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockClientQuery: vi.fn(),
  mockPoolQuery: vi.fn(),
  mockRelease: vi.fn(),
  mockProcessEvent: vi.fn(),
}));

vi.mock("../src/db/pool.js", () => ({
  pool: {
    connect: mockConnect,
    query: mockPoolQuery,
  },
}));

vi.mock("../src/services/postCreatedEventService.js", () => ({
  processPostCreatedEvent: mockProcessEvent,
}));

import { processNextEventJob, startEventWorker, stopEventWorker } from "../src/services/eventWorker.js";

describe("Module 5 - Persistent event worker", () => {
  const job = {
    id: 10,
    event_id: "worker-test-event-1",
    payload: {
      eventId: "worker-test-event-1",
      eventType: "PostCreated",
      postId: "123",
      authorId: "162",
      categoryId: "1",
      title: "Test Book",
      createdAt: "2026-10-05T12:00:00.000Z",
    },
  };

  let client;

  beforeEach(() => {
    vi.resetAllMocks();

    client = {
      query: mockClientQuery,
      release: mockRelease,
    };

    mockConnect.mockResolvedValue(client);
    mockClientQuery.mockResolvedValue({ rowCount: 1, rows: [] });
    mockPoolQuery.mockResolvedValue({ rowCount: 1, rows: [] });

    mockProcessEvent.mockResolvedValue({
      recipientCount: 1,
      inAppCreatedCount: 1,
      pushSuccessCount: 1,
      pushFailureCount: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns false when no pending job exists", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }); // COMMIT

    const result = await processNextEventJob();

    expect(result).toBe(false);

    const selectQuery = mockClientQuery.mock.calls[1][0];
    expect(selectQuery).toContain("WHERE j.status = 'pending'");
    expect(selectQuery).toContain("INTERVAL '5 minutes'");
    expect(selectQuery).toContain("FOR UPDATE OF j SKIP LOCKED");
    expect(mockClientQuery.mock.calls[1]).toHaveLength(1);
    expect(mockClientQuery.mock.calls[2][0].trim()).toBe("COMMIT");
    expect(mockProcessEvent).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("claims and processes a job, then marks it completed", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [job], rowCount: 1 }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // mark processing
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // claim COMMIT
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // completion BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // mark completed
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // update processed event
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }); // completion COMMIT

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await processNextEventJob();

    expect(result).toBe(true);
    expect(mockProcessEvent).toHaveBeenCalledWith(job.payload);
    expect(mockClientQuery.mock.calls[2][0]).toContain(
      "SET status = 'processing'",
    );
    expect(mockClientQuery.mock.calls[5][0]).toContain(
      "SET status = 'completed'",
    );
    expect(mockClientQuery.mock.calls[6][0]).toContain(
      "SET processed_at = NOW()",
    );
    expect(mockRelease).toHaveBeenCalledTimes(2);
    expect(logSpy).toHaveBeenCalledWith("EVENT_JOB_COMPLETED", {
      eventId: job.event_id,
    });
  });

  it("marks the job completed when processing resolves with an FCM failure count", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] })
      .mockResolvedValueOnce({ rows: [job], rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] })
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] });

    mockProcessEvent.mockResolvedValueOnce({
      recipientCount: 1,
      inAppCreatedCount: 1,
      pushSuccessCount: 0,
      pushFailureCount: 1,
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await processNextEventJob();

    expect(result).toBe(true);
    expect(mockProcessEvent).toHaveBeenCalledWith(job.payload);
    expect(mockClientQuery.mock.calls[5][0]).toContain(
      "SET status = 'completed'",
    );
    expect(logSpy).toHaveBeenCalledWith("EVENT_JOB_COMPLETED", {
      eventId: job.event_id,
    });
    expect(mockPoolQuery).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledTimes(2);
  });

  it("marks a job failed when event processing throws", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [job], rowCount: 1 }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // mark processing
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }); // COMMIT

    mockProcessEvent.mockRejectedValueOnce(new Error("Processing failed"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await processNextEventJob();

    expect(result).toBe(true);
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    expect(mockPoolQuery.mock.calls[0][0]).toContain("SET status = 'failed'");
    expect(mockPoolQuery.mock.calls[0][1]).toEqual([
      job.id,
      "Processing failed",
    ]);
    expect(errorSpy).toHaveBeenCalledWith(
      "EVENT_JOB_PROCESSING_FAILED",
      expect.objectContaining({
        eventId: job.event_id,
        error: "Processing failed",
      }),
    );
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("rolls back and throws when claiming a job fails", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // BEGIN
      .mockRejectedValueOnce(new Error("Claim query failed")) // SELECT
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }); // ROLLBACK

    await expect(processNextEventJob()).rejects.toThrow("Claim query failed");

    expect(mockClientQuery.mock.calls[2][0].trim()).toBe("ROLLBACK");
    expect(mockProcessEvent).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("rolls back and throws when claiming COMMIT fails", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [job], rowCount: 1 }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // mark processing
      .mockRejectedValueOnce(new Error("Claim COMMIT failed")) // COMMIT
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }); // ROLLBACK

    await expect(processNextEventJob()).rejects.toThrow(
      "Claim COMMIT failed",
    );

    expect(mockClientQuery.mock.calls[3][0].trim()).toBe("COMMIT");
    expect(mockClientQuery.mock.calls[4][0].trim()).toBe("ROLLBACK");
    expect(mockProcessEvent).not.toHaveBeenCalled();
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it("rolls back and records failure when completion COMMIT fails", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // claim BEGIN
      .mockResolvedValueOnce({ rows: [job], rowCount: 1 }) // SELECT
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // mark processing
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // claim COMMIT
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // completion BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // mark completed
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // update processed event
      .mockRejectedValueOnce(new Error("Completion COMMIT failed")) // COMMIT
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }); // ROLLBACK

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await processNextEventJob();

    expect(result).toBe(true);
    expect(mockProcessEvent).toHaveBeenCalledWith(job.payload);
    expect(mockClientQuery.mock.calls[7][0].trim()).toBe("COMMIT");
    expect(mockClientQuery.mock.calls[8][0].trim()).toBe("ROLLBACK");
    expect(mockPoolQuery).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'failed'"),
      [job.id, "Completion COMMIT failed"],
    );
    expect(mockRelease).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith(
      "EVENT_JOB_PROCESSING_FAILED",
      expect.objectContaining({
        eventId: job.event_id,
        error: "Completion COMMIT failed",
      }),
    );
  });

  it("reclaims a stale processing job after five minutes", async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // claim BEGIN
      .mockResolvedValueOnce({ rows: [job], rowCount: 1 }) // SELECT stale job
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // mark processing
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // claim COMMIT
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }) // completion BEGIN
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // mark completed
      .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // update processed event
      .mockResolvedValueOnce({ rowCount: undefined, rows: [] }); // completion COMMIT

    const result = await processNextEventJob();

    expect(result).toBe(true);

    const selectQuery = mockClientQuery.mock.calls[1][0];
    expect(selectQuery).toContain("j.status = 'processing'");
    expect(selectQuery).toContain("INTERVAL '5 minutes'");
    expect(mockProcessEvent).toHaveBeenCalledWith(job.payload);
    expect(mockClientQuery.mock.calls[5][0]).toContain(
      "SET status = 'completed'",
    );
    expect(mockRelease).toHaveBeenCalledTimes(2);
  });


  it("starts and stops the worker after its current polling cycle", async () => {
    mockClientQuery.mockImplementation(async (query) => {
      if (query.includes("SELECT j.id")) {
        return { rowCount: 0, rows: [] };
      }
      return { rowCount: undefined, rows: [] };
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const workerPromise = startEventWorker();

    await new Promise((resolve) => setTimeout(resolve, 50));

    await stopEventWorker();
    await workerPromise;

    expect(logSpy).toHaveBeenCalledWith("EVENT_WORKER_STARTED");
    expect(logSpy).toHaveBeenCalledWith("EVENT_WORKER_STOPPED");
  });

});
