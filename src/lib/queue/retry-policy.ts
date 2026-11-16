export type RetryDecision = {
  retry: boolean;
  nextAttemptAt: Date | null;
  errorCode: string;
  errorMessage: string;
};

export function getRetryDecision(input: {
  attemptCount: number;
  maxAttempts: number;
  errorCode: string;
  errorMessage: string;
  now?: Date;
  baseDelayMs?: number;
  maxDelayMs?: number;
}): RetryDecision {
  const { attemptCount, maxAttempts, errorCode, errorMessage } = input;
  if (attemptCount >= maxAttempts) {
    return { retry: false, nextAttemptAt: null, errorCode, errorMessage };
  }
  const base = input.baseDelayMs ?? 30_000;
  const ceiling = input.maxDelayMs ?? 60 * 60 * 1000;
  const exponent = Math.max(0, Math.min(attemptCount - 1, 20));
  const delay = Math.min(ceiling, base * 2 ** exponent);
  return {
    retry: true,
    nextAttemptAt: new Date((input.now ?? new Date()).getTime() + delay),
    errorCode,
    errorMessage,
  };
}

const PERMANENT_ERROR_CODES = new Set([
  "INVALID_RECIPIENT",
  "CONSENT_REQUIRED",
  "CONSENT_REVOKED",
  "SENDER_NOT_CONNECTED",
  "CONNECTOR_NOT_CONFIGURED",
  "UNSUPPORTED_CONNECTOR",
  "AUTHENTICATION_FAILED",
  "INVALID_MESSAGE",
]);

export function isRetryableConnectorError(errorCode: string): boolean {
  const normalized = errorCode.trim().toUpperCase();
  if (PERMANENT_ERROR_CODES.has(normalized)) return false;
  return /^(TEMPORARY|RATE_LIMIT|TIMEOUT|NETWORK|PROVIDER_5XX|CONNECTOR_ERROR)/.test(normalized);
}
