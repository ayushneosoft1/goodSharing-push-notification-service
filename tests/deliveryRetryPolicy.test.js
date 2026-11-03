import { describe, it, expect } from "vitest";
import {
  MAX_DELIVERY_ATTEMPTS,
  getRetryDecision,
} from "../src/services/deliveryRetryPolicy.js";

describe("Module 5 PR2 - Delivery Retry Policy", () => {
  const now = Date.parse("2026-10-27T12:00:00.000Z");

  it.each([
    [1, 30_000],
    [2, 60_000],
    [3, 120_000],
    [4, 240_000],
  ])("schedules retry after attempt %i", (attemptCount, delay) => {
    const result = getRetryDecision(attemptCount, () => 0, now);

    expect(result.status).toBe("FAILED_RETRYABLE");
    expect(result.nextAttemptAt).toEqual(new Date(now + delay));
  });

  it("adds jitter to the retry delay", () => {
    const result = getRetryDecision(1, () => 0.5, now);

    expect(result.nextAttemptAt).toEqual(
      new Date(now + 32_500),
    );
  });

  it("moves the fifth failed attempt to DEAD_LETTER", () => {
    expect(MAX_DELIVERY_ATTEMPTS).toBe(5);

    expect(getRetryDecision(5, () => 0, now)).toEqual({
      status: "DEAD_LETTER",
      nextAttemptAt: null,
    });
  });

  it.each([0, -1, 1.5, NaN])(
    "rejects invalid attempt count %s",
    (attemptCount) => {
      expect(() =>
        getRetryDecision(attemptCount, () => 0, now),
      ).toThrow("Invalid delivery attempt count");
    },
  );

  it.each([-0.1, 1, NaN])(
    "rejects invalid jitter value %s",
    (randomValue) => {
      expect(() =>
        getRetryDecision(1, () => randomValue, now),
      ).toThrow("Invalid jitter value");
    },
  );
});
