import { pool } from "../db/pool.js";

export async function createDeliveryAttempt({
  eventId,
  userId,
  deviceRegistrationId,
}) {
  if (!eventId || !userId || !deviceRegistrationId) {
    throw new Error("Missing required delivery attempt fields");
  }

  const result = await pool.query(
    `
      INSERT INTO delivery_attempts (
        event_id,
        user_id,
        device_registration_id,
        status
      )
      VALUES ($1, $2, $3, 'PENDING')
      ON CONFLICT (event_id, device_registration_id)
      DO NOTHING
      RETURNING
        id,
        event_id,
        user_id,
        device_registration_id,
        status,
        attempt_count
    `,
    [eventId, userId, deviceRegistrationId],
  );

  return {
    created: result.rowCount === 1,
    deliveryAttempt: result.rows[0] ?? null,
  };
}

export async function claimNextDeliveryAttempt() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(`
      WITH next_attempt AS (
        SELECT id
        FROM delivery_attempts
        WHERE attempt_count < 5
          AND (
            status = 'PENDING'
            OR (
              status = 'FAILED_RETRYABLE'
              AND next_attempt_at <= NOW()
            )
            OR (
              status = 'PROCESSING'
              AND claimed_at < NOW() - INTERVAL '5 minutes'
            )
          )
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE delivery_attempts AS da
      SET
        status = 'PROCESSING',
        attempt_count = da.attempt_count + 1,
        claimed_at = NOW(),
        claim_token = gen_random_uuid(),
        updated_at = NOW()
      FROM next_attempt
      WHERE da.id = next_attempt.id
      RETURNING da.*
    `);

    await client.query("COMMIT");

    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markDeliveryAttemptSuccess({ attemptId, claimToken }) {
  if (!attemptId || !claimToken) {
    throw new Error("Missing delivery attempt ownership fields");
  }

  const result = await pool.query(
    `
      UPDATE delivery_attempts
      SET
        status = 'SUCCESS',
        error_code = NULL,
        next_attempt_at = NULL,
        claimed_at = NULL,
        claim_token = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND claim_token = $2
        AND status = 'PROCESSING'
      RETURNING id
    `,
    [attemptId, claimToken],
  );

  return result.rowCount === 1;
}

export async function markDeliveryAttemptPermanentFailure({
  attemptId,
  claimToken,
  errorCode,
}) {
  if (!attemptId || !claimToken || !errorCode) {
    throw new Error("Missing permanent failure fields");
  }

  const result = await pool.query(
    `
      UPDATE delivery_attempts
      SET
        status = 'FAILED_PERMANENT',
        error_code = $3,
        next_attempt_at = NULL,
        claimed_at = NULL,
        claim_token = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND claim_token = $2
        AND status = 'PROCESSING'
      RETURNING id
    `,
    [attemptId, claimToken, errorCode],
  );

  return result.rowCount === 1;
}

export async function markDeliveryAttemptRetryableFailure({
  attemptId,
  claimToken,
  errorCode,
  nextAttemptAt,
}) {
  if (!attemptId || !claimToken || !errorCode || !nextAttemptAt) {
    throw new Error("Missing retryable failure fields");
  }

  const retryAt = new Date(nextAttemptAt);

  if (Number.isNaN(retryAt.getTime()) || retryAt.getTime() <= Date.now()) {
    throw new Error("nextAttemptAt must be a valid future date");
  }

  const result = await pool.query(
    `
      UPDATE delivery_attempts
      SET
        status = 'FAILED_RETRYABLE',
        error_code = $3,
        next_attempt_at = $4,
        claimed_at = NULL,
        claim_token = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND claim_token = $2
        AND status = 'PROCESSING'
        AND attempt_count < 5
      RETURNING id
    `,
    [attemptId, claimToken, errorCode, retryAt],
  );

  return result.rowCount === 1;
}

export async function markDeliveryAttemptDeadLetter({
  attemptId,
  claimToken,
  errorCode,
}) {
  if (!attemptId || !claimToken || !errorCode) {
    throw new Error("Missing dead-letter fields");
  }

  const result = await pool.query(
    `
      UPDATE delivery_attempts
      SET
        status = 'DEAD_LETTER',
        error_code = $3,
        next_attempt_at = NULL,
        claimed_at = NULL,
        claim_token = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND claim_token = $2
        AND status = 'PROCESSING'
        AND attempt_count >= 5
      RETURNING id
    `,
    [attemptId, claimToken, errorCode],
  );

  return result.rowCount === 1;
}


export async function recoverStaleFinalDeliveryAttempts() {
  const result = await pool.query(`
    UPDATE delivery_attempts
    SET
      status = 'DEAD_LETTER',
      error_code = 'delivery/worker-timeout-after-final-attempt',
      next_attempt_at = NULL,
      claimed_at = NULL,
      claim_token = NULL,
      updated_at = NOW()
    WHERE status = 'PROCESSING'
      AND attempt_count >= 5
      AND claimed_at < NOW() - INTERVAL '5 minutes'
    RETURNING id
  `);

  return result.rowCount;
}

export async function releasePreFcmFailedAttempt({
  attemptId,
  claimToken,
  nextAttemptAt,
}) {
  if (!attemptId || !claimToken || !nextAttemptAt) {
    throw new Error("Missing pre-FCM recovery fields");
  }

  const retryAt = new Date(nextAttemptAt);

  if (Number.isNaN(retryAt.getTime()) || retryAt.getTime() <= Date.now()) {
    throw new Error("nextAttemptAt must be a valid future date");
  }

  const result = await pool.query(
    `
      UPDATE delivery_attempts
      SET
        status = 'FAILED_RETRYABLE',
        attempt_count = attempt_count - 1,
        error_code = 'delivery/pre-fcm-database-error',
        next_attempt_at = $3,
        claimed_at = NULL,
        claim_token = NULL,
        updated_at = NOW()
      WHERE id = $1
        AND claim_token = $2
        AND status = 'PROCESSING'
        AND attempt_count > 0
      RETURNING id
    `,
    [attemptId, claimToken, retryAt],
  );

  return result.rowCount === 1;
}
