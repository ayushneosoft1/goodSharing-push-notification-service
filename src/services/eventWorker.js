import { pool } from "../db/pool.js";
import { processPostCreatedEvent } from "./postCreatedEventService.js";

const POLL_INTERVAL_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function processNextEventJob() {
  const client = await pool.connect();
  let job;

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT j.id, j.event_id, e.payload
       FROM event_jobs j
       JOIN processed_events e ON e.event_id = j.event_id
       WHERE j.status = 'pending'
          OR (
            j.status = 'processing'
            AND j.claimed_at < NOW() - INTERVAL '5 minutes'
          )
       ORDER BY
         CASE WHEN j.status = 'pending' THEN 0 ELSE 1 END,
         j.created_at,
         j.id
       LIMIT 1
       FOR UPDATE OF j SKIP LOCKED`,
    );

    if (result.rowCount === 0) {
      await client.query("COMMIT");
      return false;
    }

    job = result.rows[0];

    await client.query(
      `UPDATE event_jobs
       SET status = 'processing',
           claimed_at = NOW(),
           updated_at = NOW(),
           last_error = NULL
       WHERE id = $1`,
      [job.id],
    );

    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      console.error("EVENT_JOB_CLAIM_ROLLBACK_FAILED");
    }
    throw error;
  } finally {
    client.release();
  }

  try {
    await processPostCreatedEvent(job.payload);

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE event_jobs
         SET status = 'completed',
             completed_at = NOW(),
             updated_at = NOW(),
             last_error = NULL
         WHERE id = $1`,
        [job.id],
      );

      await client.query(
        `UPDATE processed_events
         SET processed_at = NOW()
         WHERE event_id = $1`,
        [job.event_id],
      );

      await client.query("COMMIT");
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        console.error("EVENT_JOB_COMPLETION_ROLLBACK_FAILED");
      }
      throw error;
    } finally {
      client.release();
    }

    console.log("EVENT_JOB_COMPLETED", { eventId: job.event_id });
  } catch (error) {
    try {
      await pool.query(
        `UPDATE event_jobs
         SET status = 'failed',
             updated_at = NOW(),
             last_error = $2
         WHERE id = $1`,
        [
          job.id,
          String(error?.message || "Unknown processing error").slice(0, 2000),
        ],
      );
    } catch {
      console.error("EVENT_JOB_FAILURE_UPDATE_FAILED", {
        eventId: job.event_id,
      });
    }

    console.error("EVENT_JOB_PROCESSING_FAILED", {
      eventId: job.event_id,
      error: error?.message,
    });
  }

  return true;
}

let stopRequested = false;
let workerPromise = null;

export async function startEventWorker() {
  if (workerPromise) {
    return workerPromise;
  }

  stopRequested = false;
  console.log("EVENT_WORKER_STARTED");

  workerPromise = (async () => {
    while (!stopRequested) {
      try {
        const processed = await processNextEventJob();

        if (!processed && !stopRequested) {
          await sleep(POLL_INTERVAL_MS);
        }
      } catch (error) {
        console.error("EVENT_WORKER_LOOP_FAILED", {
          error: error?.message,
        });

        if (!stopRequested) {
          await sleep(POLL_INTERVAL_MS);
        }
      }
    }

    console.log("EVENT_WORKER_STOPPED");
  })();

  try {
    await workerPromise;
  } finally {
    workerPromise = null;
  }
}

export async function stopEventWorker() {
  stopRequested = true;

  if (workerPromise) {
    await workerPromise;
  }
}
