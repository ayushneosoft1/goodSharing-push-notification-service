import { describe, it, expect, vi, afterAll } from "vitest";

const { mockProcessEvent } = vi.hoisted(() => ({
  mockProcessEvent: vi.fn(),
}));

vi.mock("../src/services/postCreatedEventService.js", () => ({
  processPostCreatedEvent: mockProcessEvent,
}));

import { pool } from "../src/db/pool.js";
import { processNextEventJob } from "../src/services/eventWorker.js";

function verifyLocalTestConfig() {
  const url = new URL(process.env.DATABASE_URL || "postgres://invalid");

  expect(process.env.DOTENV_CONFIG_PATH).toBe(".env.test.local");
  expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
  expect(url.port).toBe("55432");
  expect(url.pathname).toBe("/goodsharing_pr1_test");
  expect(decodeURIComponent(url.username)).toBe("pr1_test");
  expect(process.env.DATABASE_SSL).toBe("false");
}

describe("PR1 - PostgreSQL stale worker recovery", () => {
  afterAll(async () => {
    await pool.end();
  });

  it("reclaims and completes a stale processing job", async () => {
    verifyLocalTestConfig();

    const identity = await pool.query(
      "SELECT current_database() AS db, current_user AS username, inet_server_port() AS port",
    );

    expect(identity.rows[0]).toMatchObject({
      db: "goodsharing_pr1_test",
      username: "pr1_test",
      port: 5432,
    });

    const existingJobs = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM event_jobs
       WHERE status = 'pending'
          OR (
            status = 'processing'
            AND claimed_at < NOW() - INTERVAL '5 minutes'
          )`,
    );

    expect(existingJobs.rows[0].count).toBe(0);

    const eventId = `worker-recovery-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const payload = {
      eventId,
      eventType: "PostCreated",
      postId: `test-post-${Date.now()}`,
      authorId: "162",
      categoryId: "1",
      title: "Worker recovery integration test",
      createdAt: new Date().toISOString(),
    };

    mockProcessEvent.mockResolvedValue(undefined);

    try {
      await pool.query(
        `INSERT INTO processed_events (event_id, event_type, payload)
         VALUES ($1, $2, $3::jsonb)`,
        [eventId, "PostCreated", JSON.stringify(payload)],
      );

      await pool.query(
        `INSERT INTO event_jobs (event_id, status, claimed_at)
         VALUES ($1, 'processing', NOW() - INTERVAL '6 minutes')`,
        [eventId],
      );

      const processed = await processNextEventJob();

      expect(processed).toBe(true);
      expect(mockProcessEvent).toHaveBeenCalledTimes(1);
      expect(mockProcessEvent).toHaveBeenCalledWith(payload);

      const result = await pool.query(
        `SELECT j.status, j.completed_at, j.last_error, e.processed_at
         FROM event_jobs j
         JOIN processed_events e ON e.event_id = j.event_id
         WHERE j.event_id = $1`,
        [eventId],
      );

      expect(result.rowCount).toBe(1);
      expect(result.rows[0].status).toBe("completed");
      expect(result.rows[0].completed_at).not.toBeNull();
      expect(result.rows[0].processed_at).not.toBeNull();
      expect(result.rows[0].last_error).toBeNull();
    } finally {
      await pool.query(
        "DELETE FROM processed_events WHERE event_id = $1",
        [eventId],
      );
    }
  });
});
