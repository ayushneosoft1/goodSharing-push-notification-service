export const MAX_DELIVERY_ATTEMPTS = 5;

const BASE_RETRY_DELAY_MS = 30_000;
const MAX_JITTER_MS = 5_000;

export function getRetryDecision(
  attemptCount,
  random = Math.random,
  now = Date.now(),
) {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) {
    throw new Error("Invalid delivery attempt count");
  }

  if (attemptCount >= MAX_DELIVERY_ATTEMPTS) {
    return {
      status: "DEAD_LETTER",
      nextAttemptAt: null,
    };
  }

  const randomValue = random();

  if (
    !Number.isFinite(randomValue) ||
    randomValue < 0 ||
    randomValue >= 1
  ) {
    throw new Error("Invalid jitter value");
  }

  const exponentialDelay =
    BASE_RETRY_DELAY_MS * 2 ** (attemptCount - 1);

  const jitter = Math.floor(randomValue * MAX_JITTER_MS);

  return {
    status: "FAILED_RETRYABLE",
    nextAttemptAt: new Date(now + exponentialDelay + jitter),
  };
}
