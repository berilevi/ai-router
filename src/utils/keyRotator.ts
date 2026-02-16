import { logger } from './logger';

/**
 * State for a single API key
 */
interface KeyState {
  key: string;
  isEnabled: boolean;
  failureCount: number;
  successCount: number;
  lastUsedAt: number;
  disabledUntil: number;
  requestCount: number;
}

/**
 * Key rotator configuration
 */
export interface KeyRotatorConfig {
  failureThreshold: number;    // Disable key after N consecutive failures
  disableTimeoutMs: number;    // Time to disable key after failures
  resetOnSuccess: boolean;     // Reset failure count on success
}

/**
 * Default key rotator configuration
 */
export const defaultKeyRotatorConfig: KeyRotatorConfig = {
  failureThreshold: 5,
  disableTimeoutMs: 300000, // 5 minutes
  resetOnSuccess: true,
};

/**
 * API Key Rotator
 * Manages multiple API keys per provider with round-robin selection
 */
export class KeyRotator {
  private keys: Map<string, KeyState[]> = new Map();
  private currentIndex: Map<string, number> = new Map();
  private config: KeyRotatorConfig;

  constructor(config: Partial<KeyRotatorConfig> = {}) {
    this.config = { ...defaultKeyRotatorConfig, ...config };
    logger.info('Key rotator initialized', this.config);
  }

  /**
   * Register API keys for a provider
   * @param provider - Provider name
   * @param apiKeys - Array of API keys (or single key)
   */
  registerKeys(provider: string, apiKeys: string | string[]): void {
    const keyArray = Array.isArray(apiKeys) ? apiKeys : [apiKeys];

    // Filter out empty keys
    const validKeys = keyArray.filter((k) => k && k.trim().length > 0);

    if (validKeys.length === 0) {
      logger.warn(`No valid API keys provided for ${provider}`);
      return;
    }

    const states: KeyState[] = validKeys.map((key) => ({
      key,
      isEnabled: true,
      failureCount: 0,
      successCount: 0,
      lastUsedAt: 0,
      disabledUntil: 0,
      requestCount: 0,
    }));

    this.keys.set(provider, states);
    this.currentIndex.set(provider, 0);

    logger.info(`Registered ${validKeys.length} API key(s) for ${provider}`);
  }

  /**
   * Get the next available API key for a provider (round-robin)
   * @param provider - Provider name
   * @returns API key or null if none available
   */
  getNextKey(provider: string): string | null {
    const keyStates = this.keys.get(provider);
    if (!keyStates || keyStates.length === 0) {
      return null;
    }

    const now = Date.now();
    let startIndex = this.currentIndex.get(provider) || 0;
    let attempts = 0;

    // Try to find an available key starting from current index
    while (attempts < keyStates.length) {
      const index = (startIndex + attempts) % keyStates.length;
      const keyState = keyStates[index];

      // Re-enable key if disable timeout has passed
      if (!keyState.isEnabled && now >= keyState.disabledUntil) {
        keyState.isEnabled = true;
        keyState.failureCount = 0;
        logger.info(`API key re-enabled for ${provider} (index ${index})`);
      }

      if (keyState.isEnabled) {
        // Update state
        keyState.lastUsedAt = now;
        keyState.requestCount++;

        // Move to next key for next request (round-robin)
        this.currentIndex.set(provider, (index + 1) % keyStates.length);

        logger.debug(`Selected API key for ${provider} (index ${index}, requests: ${keyState.requestCount})`);
        return keyState.key;
      }

      attempts++;
    }

    // No available keys
    logger.warn(`No available API keys for ${provider}`);
    return null;
  }

  /**
   * Record a successful request with a key
   */
  recordSuccess(provider: string, apiKey: string): void {
    const keyStates = this.keys.get(provider);
    if (!keyStates) return;

    const keyState = keyStates.find((k) => k.key === apiKey);
    if (keyState) {
      keyState.successCount++;
      if (this.config.resetOnSuccess) {
        keyState.failureCount = 0;
      }
      logger.debug(`API key success recorded for ${provider} (successes: ${keyState.successCount})`);
    }
  }

  /**
   * Record a failed request with a key
   * @returns true if key was disabled
   */
  recordFailure(provider: string, apiKey: string): boolean {
    const keyStates = this.keys.get(provider);
    if (!keyStates) return false;

    const keyState = keyStates.find((k) => k.key === apiKey);
    if (!keyState) return false;

    keyState.failureCount++;
    logger.debug(`API key failure recorded for ${provider} (failures: ${keyState.failureCount})`);

    if (keyState.failureCount >= this.config.failureThreshold) {
      keyState.isEnabled = false;
      keyState.disabledUntil = Date.now() + this.config.disableTimeoutMs;
      logger.warn(`API key disabled for ${provider} after ${keyState.failureCount} failures, re-enable at ${new Date(keyState.disabledUntil).toISOString()}`);
      return true;
    }

    return false;
  }

  /**
   * Disable a specific key (e.g., on 401 invalid key error)
   */
  disableKey(provider: string, apiKey: string, timeoutMs?: number): void {
    const keyStates = this.keys.get(provider);
    if (!keyStates) return;

    const keyState = keyStates.find((k) => k.key === apiKey);
    if (keyState) {
      keyState.isEnabled = false;
      keyState.disabledUntil = Date.now() + (timeoutMs || this.config.disableTimeoutMs);
      logger.warn(`API key manually disabled for ${provider}`);
    }
  }

  /**
   * Enable a specific key (manual reset)
   */
  enableKey(provider: string, apiKey: string): void {
    const keyStates = this.keys.get(provider);
    if (!keyStates) return;

    const keyState = keyStates.find((k) => k.key === apiKey);
    if (keyState) {
      keyState.isEnabled = true;
      keyState.failureCount = 0;
      keyState.disabledUntil = 0;
      logger.info(`API key manually enabled for ${provider}`);
    }
  }

  /**
   * Get statistics for all keys of a provider
   */
  getKeyStats(provider: string): Array<{
    index: number;
    isEnabled: boolean;
    failureCount: number;
    successCount: number;
    requestCount: number;
    timeUntilEnabled: number;
    keyPreview: string;
  }> {
    const keyStates = this.keys.get(provider);
    if (!keyStates) return [];

    const now = Date.now();
    return keyStates.map((state, index) => ({
      index,
      isEnabled: state.isEnabled || now >= state.disabledUntil,
      failureCount: state.failureCount,
      successCount: state.successCount,
      requestCount: state.requestCount,
      timeUntilEnabled: state.isEnabled ? 0 : Math.max(0, state.disabledUntil - now),
      keyPreview: `${state.key.substring(0, 8)}...${state.key.slice(-4)}`,
    }));
  }

  /**
   * Get count of available keys for a provider
   */
  getAvailableKeyCount(provider: string): number {
    const keyStates = this.keys.get(provider);
    if (!keyStates) return 0;

    const now = Date.now();
    return keyStates.filter((k) => k.isEnabled || now >= k.disabledUntil).length;
  }

  /**
   * Get total key count for a provider
   */
  getTotalKeyCount(provider: string): number {
    const keyStates = this.keys.get(provider);
    return keyStates ? keyStates.length : 0;
  }

  /**
   * Check if provider has any registered keys
   */
  hasKeys(provider: string): boolean {
    return this.keys.has(provider) && this.keys.get(provider)!.length > 0;
  }

  /**
   * Reset all keys for a provider
   */
  resetKeys(provider: string): void {
    const keyStates = this.keys.get(provider);
    if (!keyStates) return;

    for (const state of keyStates) {
      state.isEnabled = true;
      state.failureCount = 0;
      state.successCount = 0;
      state.disabledUntil = 0;
    }
    this.currentIndex.set(provider, 0);
    logger.info(`All API keys reset for ${provider}`);
  }

  /**
   * Reset all key rotator state
   */
  resetAll(): void {
    for (const provider of this.keys.keys()) {
      this.resetKeys(provider);
    }
    logger.info('All key rotators reset');
  }
}

// Global key rotator instance
let globalKeyRotator: KeyRotator | null = null;

export function initializeKeyRotator(config?: Partial<KeyRotatorConfig>): KeyRotator {
  globalKeyRotator = new KeyRotator(config);
  return globalKeyRotator;
}

export function getKeyRotator(): KeyRotator {
  if (!globalKeyRotator) {
    globalKeyRotator = new KeyRotator();
  }
  return globalKeyRotator;
}
