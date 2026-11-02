const PERMANENT_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

const TRANSIENT_ERRORS = new Set([
  "messaging/internal-error",
  "messaging/server-unavailable",
  "messaging/unavailable",
  "messaging/quota-exceeded",
  "messaging/message-rate-exceeded",
  "messaging/device-message-rate-exceeded",
  "messaging/topics-message-rate-exceeded",
]);

const TOKEN_DEACTIVATION_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export function classifyFcmError(error) {
  const code = error?.code || "unknown";

  if (PERMANENT_ERRORS.has(code)) {
    return {
      status: "FAILED_PERMANENT",
      errorCode: code,
      shouldRetry: false,
      shouldDeactivateDevice: TOKEN_DEACTIVATION_ERRORS.has(code),
    };
  }

  if (
    TRANSIENT_ERRORS.has(code) ||
    /timeout|timed out|network|rate.limit|quota|unavailable/i.test(
      `${code} ${error?.message || ""}`,
    )
  ) {
    return {
      status: "FAILED_RETRYABLE",
      errorCode: code,
      shouldRetry: true,
      shouldDeactivateDevice: false,
    };
  }

  // Unknown errors are retryable, subject to the maximum attempt limit.
  return {
    status: "FAILED_RETRYABLE",
    errorCode: code,
    shouldRetry: true,
    shouldDeactivateDevice: false,
  };
}
