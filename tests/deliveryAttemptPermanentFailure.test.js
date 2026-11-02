import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { pool } from "../src/db/pool.js";
import { markDeliveryAttemptPermanentFailure } from "../src/services/deliveryAttemptService.js";

describe("Permanent delivery failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the owned attempt as FAILED_PERMANENT", async () => {
    pool.query.mockResolvedValue({ rowCount: 1 });

    const result = await markDeliveryAttemptPermanentFailure({
      attemptId: 10,
      claimToken: "claim-123",
      errorCode: "messaging/invalid-registration-token",
    });

    expect(result).toBe(true);

    const [sql, params] = pool.query.mock.calls[0];

    expect(sql).toContain("status = 'FAILED_PERMANENT'");
    expect(sql).toContain("error_code = $3");
    expect(sql).toContain("next_attempt_at = NULL");
    expect(sql).toContain("claim_token = NULL");
    expect(sql).toContain("AND claim_token = $2");
    expect(sql).toContain("AND status = 'PROCESSING'");

    expect(params).toEqual([
      10,
      "claim-123",
      "messaging/invalid-registration-token",
    ]);
  });

  it("rejects a stale claim without updating the attempt", async () => {
    pool.query.mockResolvedValue({ rowCount: 0 });

    const result = await markDeliveryAttemptPermanentFailure({
      attemptId: 10,
      claimToken: "stale-claim",
      errorCode: "messaging/invalid-argument",
    });

    expect(result).toBe(false);
  });

  it("rejects missing required fields", async () => {
    await expect(
      markDeliveryAttemptPermanentFailure({
        attemptId: 10,
        claimToken: "",
        errorCode: "messaging/invalid-argument",
      }),
    ).rejects.toThrow("Missing permanent failure fields");

    expect(pool.query).not.toHaveBeenCalled();
  });

  it("propagates database errors", async () => {
    pool.query.mockRejectedValue(new Error("Database unavailable"));

    await expect(
      markDeliveryAttemptPermanentFailure({
        attemptId: 10,
        claimToken: "claim-123",
        errorCode: "messaging/invalid-argument",
      }),
    ).rejects.toThrow("Database unavailable");
  });
});
