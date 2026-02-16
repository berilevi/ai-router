import { logger } from './logger';
import { getCircuitBreaker } from './circuitBreaker';

/**
 * Rate limit state for a provider/model combination
 */
interface RateLimitState {
  isLimited: boolean;
  limitedUntil: number;      // Unix timestamp when limit expires
  retryAfter?: number;       // Seconds from Retry-After header
  quotaResetTime?: string;   // Human-readable reset time from error message
  lastLimitedAt: number;     // When the rate limit was detected
  limitCount: number;        // Number of times rate limited
}

/**
 * Parsed rate limit info from error response
 */
export interface RateLimitInfo {
  retryAfterMs: number;      // Milliseconds until retry is allowed
  retryAfterSeconds?: number;
  quotaResetTime?: string;   // Human-readable reset time
  source: 'header' | 'body' | 'default';
}

/**
 * Rate Limit Manager
 * Tracks and manages 429 rate limit responses from providers
 */
export class RateLimitManager {
  private states: Map<string, RateLimitState> = new Map();
  private defaultRetryAfterMs: number;

  constructor(defaultRetryAfterMs: number = 60000) {
    this.defaultRetryAfterMs = defaultRetryAfterMs;
    logger.info('Rate limit manager initialized', { defaultRetryAfterMs });
  }

  /**
   * Generate a unique key for provider/model combination
   */
  private getKey(provider: string, model?: string): string {
    return model ? `${provider}:${model}` : provider;
  }

  /**
   * Parse Retry-After header value
   * Can be either seconds (e.g., "120") or HTTP-date
   */
  parseRetryAfterHeader(headerValue: string | undefined): number | null {
    if (!headerValue) return null;

    // Try parsing as seconds
    const seconds = parseInt(headerValue, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000; // Convert to ms
    }

    // Try parsing as HTTP-date (e.g., "Wed, 21 Oct 2025 07:28:00 GMT")
    const date = new Date(headerValue);
    if (!isNaN(date.getTime())) {
      const now = Date.now();
      const retryTime = date.getTime();
      return Math.max(0, retryTime - now);
    }

    return null;
  }

  /**
   * Parse rate limit info from error message
   * Handles formats like "Your quota will reset after 2h21m51s"
   */
  parseErrorMessage(errorMessage: string | undefined): RateLimitInfo | null {
    if (!errorMessage) return null;

    // Pattern: "reset after Xh Ym Zs" or "Xh Ym Zs" or "X hours Y minutes"
    const patterns = [
      // "2h21m51s" format
      /(\d+)h\s*(\d+)m\s*(\d+)s/i,
      // "2h 21m 51s" format with spaces
      /(\d+)\s*h\s*(\d+)\s*m\s*(\d+)\s*s/i,
      // "2 hours 21 minutes 51 seconds"
      /(\d+)\s*hours?\s*(\d+)\s*minutes?\s*(\d+)\s*seconds?/i,
      // "2 hours 21 minutes"
      /(\d+)\s*hours?\s*(\d+)\s*minutes?/i,
      // "21 minutes 51 seconds"
      /(\d+)\s*minutes?\s*(\d+)\s*seconds?/i,
      // "120 seconds" or "120s"
      /(\d+)\s*s(?:econds?)?/i,
      // "2 minutes" or "2m"
      /(\d+)\s*m(?:inutes?)?/i,
      // "2 hours" or "2h"
      /(\d+)\s*h(?:ours?)?/i,
    ];

    for (const pattern of patterns) {
      const match = errorMessage.match(pattern);
      if (match) {
        let ms = 0;
        const groups = match.slice(1).map(Number);

        // Determine which pattern matched and calculate ms
        if (pattern.source.includes('hours') && pattern.source.includes('minutes') && pattern.source.includes('seconds')) {
          ms = groups[0] * 3600000 + groups[1] * 60000 + groups[2] * 1000;
        } else if (pattern.source.includes('h') && pattern.source.includes('m') && pattern.source.includes('s')) {
          ms = groups[0] * 3600000 + groups[1] * 60000 + groups[2] * 1000;
        } else if (pattern.source.includes('hours') && pattern.source.includes('minutes')) {
          ms = groups[0] * 3600000 + groups[1] * 60000;
        } else if (pattern.source.includes('minutes') && pattern.source.includes('seconds')) {
          ms = groups[0] * 60000 + groups[1] * 1000;
        } else if (pattern.source.includes('seconds') || pattern.source.includes('s(?:econds')) {
          ms = groups[0] * 1000;
        } else if (pattern.source.includes('minutes') || pattern.source.includes('m(?:inutes')) {
          ms = groups[0] * 60000;
        } else if (pattern.source.includes('hours') || pattern.source.includes('h(?:ours')) {
          ms = groups[0] * 3600000;
        }

        if (ms > 0) {
          // Extract the human-readable reset time
          const resetMatch = errorMessage.match(/reset\s+(?:after\s+)?([^.]+)/i);
          const quotaResetTime = resetMatch ? resetMatch[1].trim() : match[0];

          return {
            retryAfterMs: ms,
            retryAfterSeconds: Math.ceil(ms / 1000),
            quotaResetTime,
            source: 'body',
          };
        }
      }
    }

    return null;
  }

  /**
   * Extract rate limit info from error response
   */
  extractRateLimitInfo(
    statusCode: number,
    headers?: Record<string, string>,
    errorMessage?: string
  ): RateLimitInfo {
    // Only process 429 errors
    if (statusCode !== 429) {
      return {
        retryAfterMs: this.defaultRetryAfterMs,
        source: 'default',
      };
    }

    // Try Retry-After header first (most reliable)
    if (headers) {
      const retryAfter = headers['retry-after'] || headers['Retry-After'];
      const headerMs = this.parseRetryAfterHeader(retryAfter);
      if (headerMs !== null) {
        return {
          retryAfterMs: headerMs,
          retryAfterSeconds: Math.ceil(headerMs / 1000),
          source: 'header',
        };
      }
    }

    // Try parsing error message
    const bodyInfo = this.parseErrorMessage(errorMessage);
    if (bodyInfo) {
      return bodyInfo;
    }

    // Default fallback
    return {
      retryAfterMs: this.defaultRetryAfterMs,
      source: 'default',
    };
  }

  /**
   * Handle a 429 rate limit error
   */
  handleRateLimitError(
    provider: string,
    model: string | undefined,
    statusCode: number,
    headers?: Record<string, string>,
    errorMessage?: string
  ): RateLimitInfo {
    const key = this.getKey(provider, model);
    const info = this.extractRateLimitInfo(statusCode, headers, errorMessage);
    const now = Date.now();

    // Get or create state
    let state = this.states.get(key);
    if (!state) {
      state = {
        isLimited: false,
        limitedUntil: 0,
        lastLimitedAt: 0,
        limitCount: 0,
      };
      this.states.set(key, state);
    }

    // Update state
    state.isLimited = true;
    state.limitedUntil = now + info.retryAfterMs;
    state.retryAfter = info.retryAfterSeconds;
    state.quotaResetTime = info.quotaResetTime;
    state.lastLimitedAt = now;
    state.limitCount++;

    // Also update circuit breaker to prevent requests during rate limit
    const circuitBreaker = getCircuitBreaker();
    circuitBreaker.forceOpen(provider, model, info.retryAfterMs);

    logger.warn(`Rate limit detected for ${key}`, {
      retryAfterMs: info.retryAfterMs,
      retryAfterSeconds: info.retryAfterSeconds,
      quotaResetTime: info.quotaResetTime,
      source: info.source,
      limitCount: state.limitCount,
    });

    return info;
  }

  /**
   * Check if a provider/model is currently rate limited
   */
  isRateLimited(provider: string, model?: string): boolean {
    const key = this.getKey(provider, model);
    const state = this.states.get(key);

    if (!state || !state.isLimited) {
      return false;
    }

    const now = Date.now();
    if (now >= state.limitedUntil) {
      // Rate limit has expired
      state.isLimited = false;
      logger.info(`Rate limit expired for ${key}`);
      return false;
    }

    return true;
  }

  /**
   * Get rate limit status for a provider/model
   */
  getRateLimitStatus(provider: string, model?: string): {
    isLimited: boolean;
    timeUntilReset: number;
    quotaResetTime?: string;
    limitCount: number;
  } {
    const key = this.getKey(provider, model);
    const state = this.states.get(key);
    const now = Date.now();

    if (!state) {
      return {
        isLimited: false,
        timeUntilReset: 0,
        limitCount: 0,
      };
    }

    const isLimited = state.isLimited && now < state.limitedUntil;

    return {
      isLimited,
      timeUntilReset: isLimited ? state.limitedUntil - now : 0,
      quotaResetTime: state.quotaResetTime,
      limitCount: state.limitCount,
    };
  }

  /**
   * Get all rate limit states (for monitoring)
   */
  getAllStates(): Map<string, {
    isLimited: boolean;
    timeUntilReset: number;
    quotaResetTime?: string;
    limitCount: number;
  }> {
    const result = new Map();
    const now = Date.now();

    for (const [key, state] of this.states.entries()) {
      const isLimited = state.isLimited && now < state.limitedUntil;
      result.set(key, {
        isLimited,
        timeUntilReset: isLimited ? state.limitedUntil - now : 0,
        quotaResetTime: state.quotaResetTime,
        limitCount: state.limitCount,
      });
    }

    return result;
  }

  /**
   * Clear rate limit for a provider/model (manual reset)
   */
  clearRateLimit(provider: string, model?: string): void {
    const key = this.getKey(provider, model);
    const state = this.states.get(key);

    if (state) {
      state.isLimited = false;
      logger.info(`Rate limit cleared for ${key}`);
    }

    // Also reset circuit breaker
    const circuitBreaker = getCircuitBreaker();
    circuitBreaker.forceClose(provider, model);
  }

  /**
   * Reset all rate limit states
   */
  resetAll(): void {
    this.states.clear();
    logger.info('All rate limit states reset');
  }
}

// Global rate limit manager instance
let globalRateLimitManager: RateLimitManager | null = null;

export function initializeRateLimitManager(defaultRetryAfterMs?: number): RateLimitManager {
  globalRateLimitManager = new RateLimitManager(defaultRetryAfterMs);
  return globalRateLimitManager;
}

export function getRateLimitManager(): RateLimitManager {
  if (!globalRateLimitManager) {
    globalRateLimitManager = new RateLimitManager();
  }
  return globalRateLimitManager;
}
