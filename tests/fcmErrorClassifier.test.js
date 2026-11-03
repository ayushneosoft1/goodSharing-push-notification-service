import { describe, it, expect } from "vitest";
import { classifyFcmError } from "../src/services/fcmErrorClassifier.js";

describe("Module 5 PR2 - FCM Error Classification", () => {
  it.each([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
  ])("permanently fails and deactivates device for %s", (code) => {
    expect(classifyFcmError({ code })).toEqual({
      status: "FAILED_PERMANENT",
      errorCode: code,
      shouldRetry: false,
      shouldDeactivateDevice: true,
    });
  });

  it("permanently fails invalid-argument without deactivating device", () => {
    expect(classifyFcmError({ code: "messaging/invalid-argument" })).toEqual({
      status: "FAILED_PERMANENT",
      errorCode: "messaging/invalid-argument",
      shouldRetry: false,
      shouldDeactivateDevice: false,
    });
  });

  it.each([
    "messaging/internal-error",
    "messaging/server-unavailable",
    "messaging/unavailable",
    "messaging/quota-exceeded",
    "messaging/message-rate-exceeded",
  ])("retries transient error %s", (code) => {
    const result = classifyFcmError({ code });

    expect(result.status).toBe("FAILED_RETRYABLE");
    expect(result.shouldRetry).toBe(true);
    expect(result.shouldDeactivateDevice).toBe(false);
  });

  it("retries network timeout errors", () => {
    const result = classifyFcmError({
      code: "ETIMEDOUT",
      message: "Network timeout",
    });

    expect(result.status).toBe("FAILED_RETRYABLE");
    expect(result.shouldRetry).toBe(true);
  });

  it("retries unknown errors without deactivating devices", () => {
    expect(classifyFcmError(undefined)).toEqual({
      status: "FAILED_RETRYABLE",
      errorCode: "unknown",
      shouldRetry: true,
      shouldDeactivateDevice: false,
    });
  });
});
