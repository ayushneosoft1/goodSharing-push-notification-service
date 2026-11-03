import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

import { pool } from "../src/db/pool.js";
import { markDeliveryAttemptRetryableFailure } from "../src/services/deliveryAttemptService.js";

describe("Retryable delivery failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const futureDate = () => new Date(Date.now() + 60000);

  it("marks an owned attempt as FAILED_RETRYABLE", async () => {
    pool.query.mockResolvedValue({ rowCount: 1 });
    const retryAt = futureDate();

    const result = await markDeliveryAttemptRetryableFailure({
      attemptId: 10,
      claimToken: "claim-123",
      errorCode: "messaging/unavailable",
      nextAttemptAt: retryAt,
    });

    expect(result).toBe(true);

    const [sql, params] = pool.query.mock.calls[0];

    expect(sql).toContain("status = 'FAILED_RETRYABLE'");
    expect(sql).toContain("error_code = $3");
    expect(sql).toContain("next_attempt_at = $4");
    expect(sql).toContain("claim_token = NULL");
    expect(sql).toContain("AND claim_token = $2");
    expect(sql).toContain("AND status = 'PROCESSING'");
    expect(sql).toContain("AND attempt_count < 5");
    expect(params).toEqual([
      10,
      "claim-123",
      "messaging/unavailable",
      retryAt,
    ]);
  });

  it("rejects a stale claim", async () => {
    pool.query.mockResolvedValue({ rowCount: 0 });

    const result = await markDeliveryAttemptRetryableFailure({
      attemptId: 10,
      claimToken: "stale-claim",
      errorCode: "messaging/internal-error",
      nextAttemptAt: futureDate(),
    });

    expect(result).toBe(false);
  });

  it("rejects missing required fields", async () => {
    await expect(
      markDeliveryAttemptRetryableFailure({
        attemptId: 10,
        claimToken: "",
        errorCode: "messaging/unavailable",
        nextAttemptAt: futureDate(),
      }),
    ).rejects.toThrow("Missing retryable failure fields");

    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects an invalid or past retry date", async () => {
    for (const nextAttemptAt of ["invalid-date", new Date(0)]) {
      await expect(
        markDeliveryAttemptRetryableFailure({
          attemptId: 10,
          claimToken: "claim-123",
          errorCode: "messaging/unavailable",
          nextAttemptAt,
        }),
      ).rejects.toThrow("nextAttemptAt must be a valid future date");
    }

    expect(pool.query).not.toHaveBeenCalled();
  });

  it("propagates database errors", async () => {
    pool.query.mockRejectedValue(new Error("Database unavailable"));

    await expect(
      markDeliveryAttemptRetryableFailure({
        attemptId: 10,
        claimToken: "claim-123",
        errorCode: "messaging/unavailable",
        nextAttemptAt: futureDate(),
      }),
    ).rejects.toThrow("Database unavailable");
  });
});
