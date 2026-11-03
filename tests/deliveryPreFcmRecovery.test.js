import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../src/db/pool.js", () => ({
  pool: { query: mockQuery },
}));

import { releasePreFcmFailedAttempt } from "../src/services/deliveryAttemptService.js";

describe("Module 5 PR2 - Pre-FCM failure recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("releases the owned claim without consuming an FCM attempt", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const recovered = await releasePreFcmFailedAttempt({
      attemptId: 10,
      claimToken: "11111111-1111-4111-8111-111111111111",
      nextAttemptAt: new Date(Date.now() + 30_000),
    });

    expect(recovered).toBe(true);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain("status = 'FAILED_RETRYABLE'");
    expect(sql).toContain("attempt_count = attempt_count - 1");
    expect(sql).toContain("claim_token = $2");
    expect(sql).toContain("status = 'PROCESSING'");
    expect(sql).toContain("claim_token = NULL");
    expect(sql).toContain("claimed_at = NULL");
    expect(params[0]).toBe(10);
  });

  it("does not release a claim owned by another worker", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });

    const recovered = await releasePreFcmFailedAttempt({
      attemptId: 10,
      claimToken: "11111111-1111-4111-8111-111111111111",
      nextAttemptAt: new Date(Date.now() + 30_000),
    });

    expect(recovered).toBe(false);
  });
});
