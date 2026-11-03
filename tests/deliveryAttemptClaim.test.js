import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockConnect, mockClientQuery, mockRelease } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockClientQuery: vi.fn(),
  mockRelease: vi.fn(),
}));

vi.mock("../src/db/pool.js", () => ({
  pool: {
    connect: mockConnect,
  },
}));

import { claimNextDeliveryAttempt } from "../src/services/deliveryAttemptService.js";

describe("Module 5 PR2 - Delivery Attempt Claiming", () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockRelease,
    });
  });

  it("claims a delivery attempt and commits the transaction", async () => {
    const row = {
      id: 1,
      event_id: "event-1",
      status: "PROCESSING",
      attempt_count: 0,
    };

    mockClientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({});

    const result = await claimNextDeliveryAttempt();

    expect(result).toEqual(row);
    expect(mockClientQuery.mock.calls[0][0]).toBe("BEGIN");
    expect(mockClientQuery.mock.calls[2][0]).toBe("COMMIT");
    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it("uses SKIP LOCKED and excludes completed attempts", async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });

    await claimNextDeliveryAttempt();

    const sql = mockClientQuery.mock.calls[1][0];

    expect(sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(sql).toContain("claim_token = gen_random_uuid()");
    expect(sql).toContain("attempt_count = da.attempt_count + 1");
    expect(sql).toContain("attempt_count < 5");
    expect(sql).toContain("status = 'PENDING'");
    expect(sql).toContain("status = 'FAILED_RETRYABLE'");
    expect(sql).toContain("next_attempt_at <= NOW()");
    expect(sql).toContain("status = 'PROCESSING'");
    expect(sql).toContain("INTERVAL '5 minutes'");
    expect(sql).toContain("status = 'PROCESSING',");
    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it("returns null when no delivery attempt is eligible", async () => {
    mockClientQuery.mockResolvedValue({ rows: [] });

    const result = await claimNextDeliveryAttempt();

    expect(result).toBeNull();
    expect(mockClientQuery.mock.calls[2][0]).toBe("COMMIT");
    expect(mockRelease).toHaveBeenCalledOnce();
  });

  it("rolls back and releases connection on query failure", async () => {
    mockClientQuery
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Database query failed"))
      .mockResolvedValueOnce({});

    await expect(claimNextDeliveryAttempt()).rejects.toThrow(
      "Database query failed",
    );

    expect(mockClientQuery.mock.calls[2][0]).toBe("ROLLBACK");
    expect(mockRelease).toHaveBeenCalledOnce();
  });
});
