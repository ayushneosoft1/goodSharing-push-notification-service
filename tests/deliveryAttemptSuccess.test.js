import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
}));

vi.mock("../src/db/pool.js", () => ({
  pool: { query: mockQuery },
}));

import { markDeliveryAttemptSuccess } from "../src/services/deliveryAttemptService.js";

describe("Module 5 PR2 - Delivery Attempt SUCCESS", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("marks a currently owned attempt as SUCCESS", async () => {
    mockQuery.mockResolvedValue({ rowCount: 1, rows: [{ id: 1 }] });

    const result = await markDeliveryAttemptSuccess({
      attemptId: 1,
      claimToken: "claim-token-1",
    });

    expect(result).toBe(true);

    const [sql, params] = mockQuery.mock.calls[0];

    expect(sql).toContain("status = 'SUCCESS'");
    expect(sql).toContain("claim_token = $2");
    expect(sql).toContain("status = 'PROCESSING'");
    expect(sql).toContain("claim_token = NULL");
    expect(params).toEqual([1, "claim-token-1"]);
  });

  it("rejects an expired or replaced worker claim", async () => {
    mockQuery.mockResolvedValue({ rowCount: 0, rows: [] });

    const result = await markDeliveryAttemptSuccess({
      attemptId: 1,
      claimToken: "old-claim-token",
    });

    expect(result).toBe(false);
  });

  it("rejects missing ownership fields", async () => {
    await expect(
      markDeliveryAttemptSuccess({ attemptId: 1 }),
    ).rejects.toThrow("Missing delivery attempt ownership fields");

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("propagates database errors", async () => {
    mockQuery.mockRejectedValue(new Error("Database unavailable"));

    await expect(
      markDeliveryAttemptSuccess({
        attemptId: 1,
        claimToken: "claim-token-1",
      }),
    ).rejects.toThrow("Database unavailable");
  });
});
