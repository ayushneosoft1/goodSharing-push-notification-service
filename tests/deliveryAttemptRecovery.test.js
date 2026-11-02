import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

import { pool } from "../src/db/pool.js";
import { recoverStaleFinalDeliveryAttempts } from "../src/services/deliveryAttemptService.js";

describe("Module 5 PR2 - Fifth Attempt Crash Recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("moves stale final attempts to DEAD_LETTER", async () => {
    pool.query.mockResolvedValue({ rowCount: 2 });

    const recovered = await recoverStaleFinalDeliveryAttempts();

    expect(recovered).toBe(2);

    const sql = pool.query.mock.calls[0][0];

    expect(sql).toContain("status = 'DEAD_LETTER'");
    expect(sql).toContain(
      "error_code = 'delivery/worker-timeout-after-final-attempt'",
    );
    expect(sql).toContain("claim_token = NULL");
    expect(sql).toContain("claimed_at = NULL");
    expect(sql).toContain("next_attempt_at = NULL");
  });

  it("returns zero when no stale final attempts exist", async () => {
    pool.query.mockResolvedValue({ rowCount: 0 });

    expect(await recoverStaleFinalDeliveryAttempts()).toBe(0);
  });

  it("only targets stale PROCESSING attempts at the limit", async () => {
    pool.query.mockResolvedValue({ rowCount: 0 });

    await recoverStaleFinalDeliveryAttempts();

    const sql = pool.query.mock.calls[0][0];

    expect(sql).toContain("WHERE status = 'PROCESSING'");
    expect(sql).toContain("AND attempt_count >= 5");
    expect(sql).toContain(
      "claimed_at < NOW() - INTERVAL '5 minutes'",
    );
  });

  it("propagates database errors", async () => {
    pool.query.mockRejectedValue(new Error("Database unavailable"));

    await expect(
      recoverStaleFinalDeliveryAttempts(),
    ).rejects.toThrow("Database unavailable");
  });
});
