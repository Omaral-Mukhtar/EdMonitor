const AI_RATE_LIMIT_MAX_REQUESTS = 10;
const AI_RATE_LIMIT_WINDOW_MS = 60_000;

const requestTimestampsByUser = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Sliding-window per-user rate limiter (10 requests / 60 seconds).
 */
export function checkAiRateLimit(
  userId: string,
  nowMs: number = Date.now()
): RateLimitResult {
  const windowStart = nowMs - AI_RATE_LIMIT_WINDOW_MS;
  const previous = requestTimestampsByUser.get(userId) ?? [];
  const active = previous.filter((ts) => ts > windowStart);

  if (active.length >= AI_RATE_LIMIT_MAX_REQUESTS) {
    requestTimestampsByUser.set(userId, active);
    const oldest = active[0] ?? nowMs;
    const retryAfterMs = Math.max(1000, oldest + AI_RATE_LIMIT_WINDOW_MS - nowMs);
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    };
  }

  active.push(nowMs);
  requestTimestampsByUser.set(userId, active);
  return {
    allowed: true,
    remaining: Math.max(0, AI_RATE_LIMIT_MAX_REQUESTS - active.length),
    retryAfterSeconds: 0,
  };
}

/**
 * Clears in-memory rate-limit timestamps (for unit tests).
 */
export function resetAiRateLimitStore(): void {
  requestTimestampsByUser.clear();
}
