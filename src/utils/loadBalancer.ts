import { logger } from './logger';
import { ProviderType, ModelMapping } from '../types';
import { getCircuitBreaker, initializeCircuitBreaker, CircuitState } from './circuitBreaker';
import { getRateLimitManager, initializeRateLimitManager } from './rateLimitManager';
import { getKeyRotator, initializeKeyRotator } from './keyRotator';
import { modelMappings, providerConfigs } from './config';

/**
 * Fallback chain configuration for a model
 */
export interface FallbackChainConfig {
  primary: {
    provider: ProviderType;
    model: string;
  };
  fallbacks: Array<{
    provider: ProviderType;
    model: string;
    priority: number;
  }>;
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

  // Fallback chains per model
  fallbackChains?: Record<string, FallbackChainConfig>;
}

/**
 * Provider selection result
 */
export interface ProviderSelection {
  provider: ProviderType;
  providerModel: string;
  apiKey?: string;
  isFallback: boolean;
  fallbackReason?: string;
}

/**
 * Load Balancer
 * Coordinates circuit breaker, rate limiting, key rotation, and fallback chains
 */
export class LoadBalancer {
  private config: LoadBalancerConfig;
  private fallbackChains: Map<string, FallbackChainConfig> = new Map();
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

    // Load fallback chains
    if (this.config.fallbackChains) {
      for (const [model, chain] of Object.entries(this.config.fallbackChains)) {
        this.fallbackChains.set(model, chain);
      }
    }

    // Setup default fallback chains based on model mappings
    this.setupDefaultFallbackChains();

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
   * Setup default fallback chains based on model mappings and provider priorities
   */
  private setupDefaultFallbackChains(): void {
    // Group models by ollamaModel name
    const modelGroups = new Map<string, ModelMapping[]>();

    for (const mapping of modelMappings) {
      const existing = modelGroups.get(mapping.ollamaModel) || [];
      existing.push(mapping);
      modelGroups.set(mapping.ollamaModel, existing);
    }

    // For models available from multiple providers, create fallback chains
    for (const [model, mappings] of modelGroups.entries()) {
      if (mappings.length > 1 && !this.fallbackChains.has(model)) {
        // Sort by provider priority
        const sorted = mappings.sort((a, b) => {
          const priorityA = providerConfigs.find((p) => p.type === a.provider)?.priority ?? 99;
          const priorityB = providerConfigs.find((p) => p.type === b.provider)?.priority ?? 99;
          return priorityA - priorityB;
        });

        const primary = sorted[0];
        const fallbacks = sorted.slice(1).map((m, i) => ({
          provider: m.provider,
          model: m.providerModel,
          priority: i + 1,
        }));

        this.fallbackChains.set(model, {
          primary: { provider: primary.provider, model: primary.providerModel },
          fallbacks,
        });
      }
    }
  }

  /**
   * Select a provider for a model request
   * Considers circuit breaker state, rate limits, and fallback chains
   */
  selectProvider(model: string): ProviderSelection | null {
    if (!this.initialized) {
      this.initialize();
    }

    const circuitBreaker = getCircuitBreaker();
    const rateLimitManager = getRateLimitManager();
    const keyRotator = getKeyRotator();

    // Get the fallback chain for this model
    const chain = this.fallbackChains.get(model);

    // Get direct model mapping
    const directMapping = modelMappings.find((m) => m.ollamaModel === model);

    if (!chain && !directMapping) {
      logger.warn(`No model mapping found for: ${model}`);
      return null;
    }

    // Build list of providers to try (primary + fallbacks)
    const providers: Array<{ provider: ProviderType; model: string; priority: number }> = [];

    if (chain) {
      providers.push({ ...chain.primary, priority: 0 });
      providers.push(...chain.fallbacks);
    } else if (directMapping) {
      providers.push({
        provider: directMapping.provider,
        model: directMapping.providerModel,
        priority: 0,
      });

      // Add fallback providers with same capability
      const fallbackProviders = this.getFallbackProviders(directMapping);
      providers.push(...fallbackProviders);
    }

    // Try each provider in order
    for (const candidate of providers.sort((a, b) => a.priority - b.priority)) {
      const { provider, model: providerModel } = candidate;

      // Check if provider is enabled
      const providerConfig = providerConfigs.find((p) => p.type === provider);
      if (!providerConfig?.enabled) {
        continue;
      }

      // Check circuit breaker
      if (!circuitBreaker.canExecute(provider, providerModel)) {
        const state = circuitBreaker.getCircuitState(provider, providerModel);
        logger.debug(`Circuit breaker OPEN for ${provider}:${providerModel}, retry in ${state.timeUntilRetry}ms`);
        continue;
      }

      // Check rate limit
      if (rateLimitManager.isRateLimited(provider, providerModel)) {
        const status = rateLimitManager.getRateLimitStatus(provider, providerModel);
        logger.debug(`Rate limited for ${provider}:${providerModel}, retry in ${status.timeUntilReset}ms`);
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

      const isFallback = candidate.priority > 0;
      const fallbackReason = isFallback
        ? `Primary provider unavailable, using fallback (priority ${candidate.priority})`
        : undefined;

      logger.debug(`Selected provider ${provider}:${providerModel} for model ${model}`, {
        isFallback,
        fallbackReason,
      });

      return {
        provider,
        providerModel,
        apiKey,
        isFallback,
        fallbackReason,
      };
    }

    logger.error(`No available providers for model: ${model}`);
    return null;
  }

  /**
   * Get fallback providers for a model mapping
   */
  private getFallbackProviders(
    mapping: ModelMapping
  ): Array<{ provider: ProviderType; model: string; priority: number }> {
    const fallbacks: Array<{ provider: ProviderType; model: string; priority: number }> = [];

    // Find other providers with similar models
    const similarMappings = modelMappings.filter(
      (m) =>
        m.provider !== mapping.provider &&
        m.supportsImages === mapping.supportsImages &&
        m.supportsTools === mapping.supportsTools
    );

    // Sort by provider priority
    const sorted = similarMappings.sort((a, b) => {
      const priorityA = providerConfigs.find((p) => p.type === a.provider)?.priority ?? 99;
      const priorityB = providerConfigs.find((p) => p.type === b.provider)?.priority ?? 99;
      return priorityA - priorityB;
    });

    // Take top 3 fallbacks
    for (let i = 0; i < Math.min(3, sorted.length); i++) {
      fallbacks.push({
        provider: sorted[i].provider,
        model: sorted[i].providerModel,
        priority: i + 1,
      });
    }

    return fallbacks;
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
   * Add a custom fallback chain for a model
   */
  setFallbackChain(model: string, chain: FallbackChainConfig): void {
    this.fallbackChains.set(model, chain);
    logger.info(`Fallback chain set for model: ${model}`);
  }

  /**
   * Get fallback chain for a model
   */
  getFallbackChain(model: string): FallbackChainConfig | undefined {
    return this.fallbackChains.get(model);
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
    fallbackChains: string[];
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
      fallbackChains: Array.from(this.fallbackChains.keys()),
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
