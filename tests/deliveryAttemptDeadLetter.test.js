import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

import { pool } from "../src/db/pool.js";
import { markDeliveryAttemptDeadLetter } from "../src/services/deliveryAttemptService.js";

describe("Module 5 PR2 - DEAD_LETTER", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = {
    attemptId: 10,
    claimToken: "claim-123",
    errorCode: "messaging/unavailable",
  };

  it("marks an owned fifth attempt as DEAD_LETTER", async () => {
    pool.query.mockResolvedValue({ rowCount: 1 });

    const result = await markDeliveryAttemptDeadLetter(input);

    expect(result).toBe(true);

    const [sql, params] = pool.query.mock.calls[0];

    expect(sql).toContain("status = 'DEAD_LETTER'");
    expect(sql).toContain("error_code = $3");
    expect(sql).toContain("next_attempt_at = NULL");
    expect(sql).toContain("claimed_at = NULL");
    expect(sql).toContain("claim_token = NULL");
    expect(sql).toContain("AND claim_token = $2");
    expect(sql).toContain("AND status = 'PROCESSING'");
    expect(sql).toContain("AND attempt_count >= 5");

    expect(params).toEqual([
      10,
      "claim-123",
      "messaging/unavailable",
    ]);
  });

  it("rejects a stale claim", async () => {
    pool.query.mockResolvedValue({ rowCount: 0 });

    const result = await markDeliveryAttemptDeadLetter({
      ...input,
      claimToken: "stale-claim",
    });

    expect(result).toBe(false);
  });

  it("does not update attempts below the maximum", async () => {
    pool.query.mockResolvedValue({ rowCount: 0 });

    const result = await markDeliveryAttemptDeadLetter(input);

    expect(result).toBe(false);
    expect(pool.query.mock.calls[0][0]).toContain(
      "AND attempt_count >= 5",
    );
  });

  it("rejects missing required fields", async () => {
    await expect(
      markDeliveryAttemptDeadLetter({
        ...input,
        claimToken: "",
      }),
    ).rejects.toThrow("Missing dead-letter fields");

    expect(pool.query).not.toHaveBeenCalled();
  });

  it("propagates database errors", async () => {
    pool.query.mockRejectedValue(new Error("Database unavailable"));

    await expect(
      markDeliveryAttemptDeadLetter(input),
    ).rejects.toThrow("Database unavailable");
  });
});
