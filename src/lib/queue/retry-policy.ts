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
