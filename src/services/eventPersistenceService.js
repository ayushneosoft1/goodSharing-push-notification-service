import { pool } from "../db/pool.js";
import { validatePostCreatedEvent } from "./postCreatedEventService.js";

export async function persistPostCreatedEvent(event) {
  const post = validatePostCreatedEvent(event);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const insertedEvent = await client.query(
      `INSERT INTO processed_events (event_id, event_type, payload)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (event_id) DO NOTHING
       RETURNING event_id`,
      [post.eventId, "PostCreated", JSON.stringify({ eventType: "PostCreated", ...post })]
    );

    if (insertedEvent.rowCount === 0) {
      await client.query("COMMIT");
      return { eventId: post.eventId, duplicate: true };
    }

    await client.query(
      `INSERT INTO event_jobs (event_id)
       VALUES ($1)`,
      [post.eventId]
    );

    await client.query("COMMIT");

    return { eventId: post.eventId, duplicate: false };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      console.error("EVENT_PERSISTENCE_ROLLBACK_FAILED");
    }

    throw error;
  } finally {
    client.release();
  }
}
