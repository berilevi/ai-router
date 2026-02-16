import { logger } from './logger';
import { ProviderType } from '../types';
import { getCircuitBreaker, initializeCircuitBreaker, CircuitState } from './circuitBreaker';
import { getRateLimitManager, initializeRateLimitManager } from './rateLimitManager';
import { getKeyRotator, initializeKeyRotator } from './keyRotator';
import { providerConfigs } from './config';

/**
 * Single entry in a fallback chain
 * The model field is what the client requests
 */
export interface FallbackChainEntry {
  model: string;
  provider: ProviderType;
}

/**
 * Load balancer configuration
 */
export interface LoadBalancerConfig {
  // Circuit breaker settings
  circuitBreakerFailureThreshold?: number;
  circuitBreakerSuccessThreshold?: number;
  circuitBreakerTimeout?: number;

  // Rate limit settings
  defaultRateLimitRetryMs?: number;

  // Key rotation settings
  keyRotationFailureThreshold?: number;
  keyRotationDisableTimeout?: number;

  // Fallback chain - array where index = priority (0 is highest)
  fallbackChain?: FallbackChainEntry[];
}

/**
 * Provider selection result
 */
export interface ProviderSelection {
  provider: ProviderType;
  providerModel: string;
  apiKey?: string;
  isFallback: boolean;
  fallbackIndex: number;
}

/**
 * Load Balancer
 * Coordinates circuit breaker, rate limiting, key rotation, and fallback chains
 *
 * The fallback chain is a simple array - walk through it until you find a working provider.
 * Array index = priority (0 is highest priority).
 */
export class LoadBalancer {
  private config: LoadBalancerConfig;
  private fallbackChain: FallbackChainEntry[] = [];
  private initialized: boolean = false;

  constructor(config: LoadBalancerConfig = {}) {
    this.config = config;
  }

  /**
   * Initialize all load balancer components
   */
  initialize(): void {
    if (this.initialized) return;

    // Initialize circuit breaker
    initializeCircuitBreaker({
      failureThreshold: this.config.circuitBreakerFailureThreshold || 5,
      successThreshold: this.config.circuitBreakerSuccessThreshold || 2,
      timeout: this.config.circuitBreakerTimeout || 60000,
    });

    // Initialize rate limit manager
    initializeRateLimitManager(this.config.defaultRateLimitRetryMs || 60000);

    // Initialize key rotator
    initializeKeyRotator({
      failureThreshold: this.config.keyRotationFailureThreshold || 5,
      disableTimeoutMs: this.config.keyRotationDisableTimeout || 300000,
    });

    // Register API keys from provider configs
    this.registerApiKeys();

    // Load fallback chain from config
    if (this.config.fallbackChain && this.config.fallbackChain.length > 0) {
      this.fallbackChain = this.config.fallbackChain;
      logger.info(`Fallback chain loaded with ${this.fallbackChain.length} entries`);
    }

    this.initialized = true;
    logger.info('Load balancer initialized');
  }

  /**
   * Register API keys from provider configs
   */
  private registerApiKeys(): void {
    const keyRotator = getKeyRotator();

    for (const provider of providerConfigs) {
      if (!provider.enabled) continue;

      // Check for multiple API keys (comma-separated or from env)
      const apiKeysEnv = process.env[`${provider.type.toUpperCase().replace('-', '_')}_API_KEYS`];

      if (apiKeysEnv) {
        // Multiple keys from env var
        const keys = apiKeysEnv.split(',').map((k) => k.trim());
        keyRotator.registerKeys(provider.type, keys);
      } else if (provider.apiKey) {
        // Single key from config
        keyRotator.registerKeys(provider.type, provider.apiKey);
      }
    }
  }

  /**
   * Select a provider for the request
   * Walks through the fallback chain (array) from index 0 until finding a working provider.
   *
   * @returns ProviderSelection if a provider is available, null if all failed
   */
  selectProvider(): ProviderSelection | null {
    if (!this.initialized) {
      this.initialize();
    }

    // If no fallback chain configured, return null (let caller handle default routing)
    if (this.fallbackChain.length === 0) {
      logger.debug('No fallback chain configured, using default routing');
      return null;
    }

    const circuitBreaker = getCircuitBreaker();
    const rateLimitManager = getRateLimitManager();
    const keyRotator = getKeyRotator();

    // Walk through the chain in order (index 0 = highest priority)
    for (let i = 0; i < this.fallbackChain.length; i++) {
      const entry = this.fallbackChain[i];
      const { model, provider } = entry;

      // Check if provider is enabled
      const providerConfig = providerConfigs.find((p) => p.type === provider);
      if (!providerConfig?.enabled) {
        logger.debug(`Provider ${provider} not enabled, skipping`);
        continue;
      }

      // Check circuit breaker
      if (!circuitBreaker.canExecute(provider, model)) {
        const state = circuitBreaker.getCircuitState(provider, model);
        logger.debug(`Circuit breaker OPEN for ${provider}:${model}, retry in ${state.timeUntilRetry}ms`);
        continue;
      }

      // Check rate limit
      if (rateLimitManager.isRateLimited(provider, model)) {
        const status = rateLimitManager.getRateLimitStatus(provider, model);
        logger.debug(`Rate limited for ${provider}:${model}, retry in ${status.timeUntilReset}ms`);
        continue;
      }

      // Get API key (with rotation)
      let apiKey: string | undefined;
      if (keyRotator.hasKeys(provider)) {
        const key = keyRotator.getNextKey(provider);
        if (!key) {
          logger.debug(`No available API keys for ${provider}`);
          continue;
        }
        apiKey = key;
      } else {
        // Use default key from config
        apiKey = providerConfig.apiKey;
      }

      logger.debug(`Selected provider ${provider}:${model} at index ${i}`, {
        isFallback: i > 0,
      });

      return {
        provider,
        providerModel: model,
        apiKey,
        isFallback: i > 0,
        fallbackIndex: i,
      };
    }

    logger.error('No available providers in fallback chain');
    return null;
  }

  /**
   * Record a successful request
   */
  recordSuccess(provider: ProviderType, model?: string, apiKey?: string): void {
    const circuitBreaker = getCircuitBreaker();
    const keyRotator = getKeyRotator();

    circuitBreaker.recordSuccess(provider, model);

    if (apiKey) {
      keyRotator.recordSuccess(provider, apiKey);
    }
  }

  /**
   * Record a failed request
   */
  recordFailure(
    provider: ProviderType,
    model: string | undefined,
    apiKey: string | undefined,
    error: {
      statusCode?: number;
      headers?: Record<string, string>;
      message?: string;
    }
  ): void {
    const circuitBreaker = getCircuitBreaker();
    const rateLimitManager = getRateLimitManager();
    const keyRotator = getKeyRotator();

    // Handle 429 rate limit errors specially
    if (error.statusCode === 429) {
      rateLimitManager.handleRateLimitError(
        provider,
        model,
        error.statusCode,
        error.headers,
        error.message
      );
    } else {
      // Record regular failure in circuit breaker
      circuitBreaker.recordFailure(provider, model, error.message);
    }

    // Record key failure
    if (apiKey) {
      keyRotator.recordFailure(provider, apiKey);
    }
  }

  /**
   * Set the fallback chain
   */
  setFallbackChain(chain: FallbackChainEntry[]): void {
    this.fallbackChain = chain;
    logger.info(`Fallback chain updated with ${chain.length} entries`);
  }

  /**
   * Get the current fallback chain
   */
  getFallbackChain(): FallbackChainEntry[] {
    return this.fallbackChain;
  }

  /**
   * Get load balancer status (for monitoring)
   */
  getStatus(): {
    circuitBreakers: Map<string, {
      state: CircuitState;
      failureCount: number;
      timeUntilRetry: number;
    }>;
    rateLimits: Map<string, {
      isLimited: boolean;
      timeUntilReset: number;
      limitCount: number;
    }>;
    keyRotators: Map<string, {
      totalKeys: number;
      availableKeys: number;
    }>;
    fallbackChain: FallbackChainEntry[];
  } {
    const circuitBreaker = getCircuitBreaker();
    const rateLimitManager = getRateLimitManager();
    const keyRotator = getKeyRotator();

    // Get key rotator status per provider
    const keyRotatorStatus = new Map<string, { totalKeys: number; availableKeys: number }>();
    for (const provider of providerConfigs) {
      if (keyRotator.hasKeys(provider.type)) {
        keyRotatorStatus.set(provider.type, {
          totalKeys: keyRotator.getTotalKeyCount(provider.type),
          availableKeys: keyRotator.getAvailableKeyCount(provider.type),
        });
      }
    }

    return {
      circuitBreakers: circuitBreaker.getAllStates(),
      rateLimits: rateLimitManager.getAllStates(),
      keyRotators: keyRotatorStatus,
      fallbackChain: this.fallbackChain,
    };
  }

  /**
   * Reset all load balancer state
   */
  resetAll(): void {
    getCircuitBreaker().resetAll();
    getRateLimitManager().resetAll();
    getKeyRotator().resetAll();
    logger.info('Load balancer state reset');
  }
}

// Global load balancer instance
let globalLoadBalancer: LoadBalancer | null = null;

export function initializeLoadBalancer(config?: LoadBalancerConfig): LoadBalancer {
  globalLoadBalancer = new LoadBalancer(config);
  globalLoadBalancer.initialize();
  return globalLoadBalancer;
}

export function getLoadBalancer(): LoadBalancer {
  if (!globalLoadBalancer) {
    globalLoadBalancer = new LoadBalancer();
    globalLoadBalancer.initialize();
  }
  return globalLoadBalancer;
}
