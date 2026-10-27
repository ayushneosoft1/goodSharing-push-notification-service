import { describe, it, expect, afterAll } from "vitest";
import { pool } from "../src/db/pool.js";

const TEST_EVENT_ID = `worker-lock-test-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const CLAIM_SQL = `
  SELECT j.id, j.event_id, e.payload
  FROM event_jobs j
  JOIN processed_events e ON e.event_id = j.event_id
  WHERE j.event_id = $1
    AND (
      j.status = 'pending'
      OR (
        j.status = 'processing'
        AND j.claimed_at < NOW() - INTERVAL '5 minutes'
      )
    )
  ORDER BY
    CASE WHEN j.status = 'pending' THEN 0 ELSE 1 END,
    j.created_at,
    j.id
  LIMIT 1
  FOR UPDATE OF j SKIP LOCKED
`;

describe("Real PostgreSQL worker claim concurrency", () => {
  afterAll(async () => {
    try {
      await pool.query("DELETE FROM processed_events WHERE event_id = $1", [
        TEST_EVENT_ID,
      ]);
    } finally {
      await pool.end();
    }
  });

  it("does not let a second connection claim the same locked job", async () => {
    await pool.query(
      `INSERT INTO processed_events (event_id, event_type, payload)
       VALUES ($1, 'PostCreated', $2::jsonb)`,
      [
        TEST_EVENT_ID,
        JSON.stringify({
          eventType: "PostCreated",
          eventId: TEST_EVENT_ID,
          postId: "worker-lock-test-post",
          authorId: "162",
          categoryId: "1",
          title: "Worker Lock Test",
          createdAt: new Date().toISOString(),
        }),
      ],
    );

    await pool.query(
      "INSERT INTO event_jobs (event_id) VALUES ($1)",
      [TEST_EVENT_ID],
    );

    const clientA = await pool.connect();
    const clientB = await pool.connect();
    let transactionA = false;
    let transactionB = false;

    try {
      await clientA.query("BEGIN");
      transactionA = true;

      const firstClaim = await clientA.query(CLAIM_SQL, [TEST_EVENT_ID]);

      expect(firstClaim.rowCount).toBe(1);
      expect(firstClaim.rows[0].event_id).toBe(TEST_EVENT_ID);

      await clientB.query("BEGIN");
      transactionB = true;

      const secondClaim = await clientB.query(CLAIM_SQL, [TEST_EVENT_ID]);

      expect(secondClaim.rowCount).toBe(0);
    } finally {
      if (transactionB) await clientB.query("ROLLBACK");
      if (transactionA) await clientA.query("ROLLBACK");
      clientB.release();
      clientA.release();
    }
  });
});
