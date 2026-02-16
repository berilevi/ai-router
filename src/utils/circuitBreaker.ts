import { logger } from './logger';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation, requests flow through
  OPEN = 'OPEN',         // Circuit is open, requests are rejected immediately
  HALF_OPEN = 'HALF_OPEN' // Testing state, allow limited requests to test recovery
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;    // Number of failures before opening circuit
  successThreshold: number;    // Number of successes in HALF_OPEN to close circuit
  timeout: number;             // Time in ms before transitioning from OPEN to HALF_OPEN
  monitoredErrors?: string[];  // Error types to monitor (empty = all errors)
}

/**
 * Default circuit breaker configuration
 */
export const defaultCircuitBreakerConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 1 minute
  monitoredErrors: ['rate_limit', 'timeout', 'server_error', '429', '503', '502'],
};

/**
 * Circuit breaker state for a single entity (provider/model combination)
 */
interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  lastStateChange: number;
  nextRetryTime: number;
}

/**
 * Circuit Breaker implementation
 * Prevents cascading failures by temporarily disabling failing services
 */
export class CircuitBreaker {
  private states: Map<string, CircuitBreakerState> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...defaultCircuitBreakerConfig, ...config };
    logger.info('Circuit breaker initialized', {
      failureThreshold: this.config.failureThreshold,
      successThreshold: this.config.successThreshold,
      timeout: this.config.timeout,
    });
  }

  /**
   * Generate a unique key for provider/model combination
   */
  private getKey(provider: string, model?: string): string {
    return model ? `${provider}:${model}` : provider;
  }

  /**
   * Get or create circuit breaker state
   */
  private getState(key: string): CircuitBreakerState {
    if (!this.states.has(key)) {
      this.states.set(key, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        successCount: 0,
        lastFailureTime: 0,
        lastStateChange: Date.now(),
        nextRetryTime: 0,
      });
    }
    return this.states.get(key)!;
  }

  /**
   * Check if request should be allowed
   * @returns true if request can proceed, false if circuit is open
   */
  canExecute(provider: string, model?: string): boolean {
    const key = this.getKey(provider, model);
    const state = this.getState(key);
    const now = Date.now();

    switch (state.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // Check if timeout has passed
        if (now >= state.nextRetryTime) {
          this.transitionTo(key, CircuitState.HALF_OPEN);
          logger.info(`Circuit breaker HALF_OPEN for ${key}`);
          return true;
        }
        logger.debug(`Circuit breaker OPEN for ${key}, retry in ${state.nextRetryTime - now}ms`);
        return false;

      case CircuitState.HALF_OPEN:
        // Allow limited requests in half-open state
        return true;

      default:
        return true;
    }
  }

  /**
   * Record a successful request
   */
  recordSuccess(provider: string, model?: string): void {
    const key = this.getKey(provider, model);
    const state = this.getState(key);

    if (state.state === CircuitState.HALF_OPEN) {
      state.successCount++;
      logger.debug(`Circuit breaker success recorded for ${key}, count: ${state.successCount}`);

      if (state.successCount >= this.config.successThreshold) {
        this.transitionTo(key, CircuitState.CLOSED);
        logger.info(`Circuit breaker CLOSED for ${key} after ${state.successCount} successes`);
      }
    } else if (state.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      state.failureCount = 0;
    }
  }

  /**
   * Record a failed request
   * @param error - Error message or type
   */
  recordFailure(provider: string, model?: string, error?: string): void {
    const key = this.getKey(provider, model);
    const state = this.getState(key);
    const now = Date.now();

    // Check if this error type should be monitored
    if (this.config.monitoredErrors && this.config.monitoredErrors.length > 0 && error) {
      const shouldMonitor = this.config.monitoredErrors.some(
        (e) => error.toLowerCase().includes(e.toLowerCase())
      );
      if (!shouldMonitor) {
        logger.debug(`Error type not monitored for circuit breaker: ${error}`);
        return;
      }
    }

    state.failureCount++;
    state.lastFailureTime = now;
    logger.debug(`Circuit breaker failure recorded for ${key}, count: ${state.failureCount}`);

    if (state.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.transitionTo(key, CircuitState.OPEN);
      logger.warn(`Circuit breaker OPEN for ${key} after failure in HALF_OPEN state`);
    } else if (state.state === CircuitState.CLOSED) {
      if (state.failureCount >= this.config.failureThreshold) {
        this.transitionTo(key, CircuitState.OPEN);
        logger.warn(`Circuit breaker OPEN for ${key} after ${state.failureCount} failures`);
      }
    }
  }

  /**
   * Transition to a new state
   */
  private transitionTo(key: string, newState: CircuitState): void {
    const state = this.getState(key);
    const now = Date.now();

    state.state = newState;
    state.lastStateChange = now;

    if (newState === CircuitState.OPEN) {
      state.nextRetryTime = now + this.config.timeout;
      state.successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      state.successCount = 0;
    } else if (newState === CircuitState.CLOSED) {
      state.failureCount = 0;
      state.successCount = 0;
    }
  }

  /**
   * Force open the circuit (e.g., when 429 is received with specific reset time)
   * @param timeoutMs - Custom timeout in milliseconds
   */
  forceOpen(provider: string, model?: string, timeoutMs?: number): void {
    const key = this.getKey(provider, model);
    const state = this.getState(key);
    const timeout = timeoutMs || this.config.timeout;

    state.state = CircuitState.OPEN;
    state.lastStateChange = Date.now();
    state.nextRetryTime = Date.now() + timeout;
    state.successCount = 0;

    logger.warn(`Circuit breaker FORCE OPEN for ${key}, retry in ${timeout}ms`);
  }

  /**
   * Force close the circuit (manual reset)
   */
  forceClose(provider: string, model?: string): void {
    const key = this.getKey(provider, model);
    const state = this.getState(key);

    state.state = CircuitState.CLOSED;
    state.lastStateChange = Date.now();
    state.failureCount = 0;
    state.successCount = 0;

    logger.info(`Circuit breaker FORCE CLOSED for ${key}`);
  }

  /**
   * Get current state for a provider/model
   */
  getCircuitState(provider: string, model?: string): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    nextRetryTime: number;
    timeUntilRetry: number;
  } {
    const key = this.getKey(provider, model);
    const state = this.getState(key);
    const now = Date.now();

    return {
      state: state.state,
      failureCount: state.failureCount,
      successCount: state.successCount,
      nextRetryTime: state.nextRetryTime,
      timeUntilRetry: Math.max(0, state.nextRetryTime - now),
    };
  }

  /**
   * Get all circuit states (for monitoring/debugging)
   */
  getAllStates(): Map<string, {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    nextRetryTime: number;
    timeUntilRetry: number;
  }> {
    const result = new Map();
    const now = Date.now();

    for (const [key, state] of this.states.entries()) {
      result.set(key, {
        state: state.state,
        failureCount: state.failureCount,
        successCount: state.successCount,
        nextRetryTime: state.nextRetryTime,
        timeUntilRetry: Math.max(0, state.nextRetryTime - now),
      });
    }

    return result;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.states.clear();
    logger.info('All circuit breakers reset');
  }
}

// Global circuit breaker instance
let globalCircuitBreaker: CircuitBreaker | null = null;

export function initializeCircuitBreaker(config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  globalCircuitBreaker = new CircuitBreaker(config);
  return globalCircuitBreaker;
}

export function getCircuitBreaker(): CircuitBreaker {
  if (!globalCircuitBreaker) {
    globalCircuitBreaker = new CircuitBreaker();
  }
  return globalCircuitBreaker;
}
