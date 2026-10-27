import { describe, it, expect, afterAll } from "vitest";
import { pool } from "../src/db/pool.js";
import { persistPostCreatedEvent } from "../src/services/eventPersistenceService.js";

const TEST_EVENT_ID = `concurrency-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const event = {
  eventId: TEST_EVENT_ID,
  eventType: "PostCreated",
  postId: "concurrency-test-post",
  authorId: "162",
  categoryId: "1",
  title: "Concurrency Test",
  createdAt: new Date().toISOString(),
};

describe("Real PostgreSQL event persistence concurrency", () => {
  afterAll(async () => {
    try {
      await pool.query("DELETE FROM event_jobs WHERE event_id = $1", [
        TEST_EVENT_ID,
      ]);
      await pool.query("DELETE FROM processed_events WHERE event_id = $1", [
        TEST_EVENT_ID,
      ]);
    } finally {
      await pool.end();
    }
  });

  it("persists one event and one job for concurrent duplicate submissions", async () => {
    await pool.query("SELECT 1");

    const results = await Promise.all([
      persistPostCreatedEvent(event),
      persistPostCreatedEvent(event),
    ]);

    expect(results).toHaveLength(2);
    expect(results.filter((result) => result.duplicate === false)).toHaveLength(1);
    expect(results.filter((result) => result.duplicate === true)).toHaveLength(1);

    const stored = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int FROM processed_events WHERE event_id = $1) AS event_count,
         (SELECT COUNT(*)::int FROM event_jobs WHERE event_id = $1) AS job_count`,
      [TEST_EVENT_ID],
    );

    expect(stored.rows[0].event_count).toBe(1);
    expect(stored.rows[0].job_count).toBe(1);
  });
});
