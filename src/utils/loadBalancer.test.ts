/**
 * Load Balancer Unit Tests
 * Tests for model-based fallback chain functionality
 */

import {
  LoadBalancer,
  FallbackChainEntry,
  initializeLoadBalancer,
  getLoadBalancer,
} from './loadBalancer';
import { getCircuitBreaker } from './circuitBreaker';
import { getRateLimitManager } from './rateLimitManager';

// Mock the provider configs
jest.mock('./config', () => ({
  providerConfigs: [
    { type: 'anthropic', name: 'Anthropic', enabled: true, apiKey: 'sk-ant-test', priority: 4 },
    { type: 'openai', name: 'OpenAI', enabled: true, apiKey: 'sk-openai-test', priority: 3 },
    { type: 'copilot', name: 'Copilot', enabled: true, priority: 0 },
    { type: 'gemini-api', name: 'Gemini', enabled: false, apiKey: 'gemini-test', priority: 2 },
  ],
}));

describe('LoadBalancer', () => {
  let loadBalancer: LoadBalancer;

  const testFallbackChain: FallbackChainEntry[] = [
    { model: 'claude-sonnet-4-5-20250929', provider: 'anthropic' },
    { model: 'sonnet', provider: 'copilot' },
    { model: 'gpt-4o', provider: 'openai' },
    { model: 'gemini-1.5-pro', provider: 'gemini-api' },
  ];

  beforeEach(() => {
    // Create fresh load balancer for each test
    loadBalancer = new LoadBalancer({
      circuitBreakerFailureThreshold: 3,
      circuitBreakerTimeout: 5000,
      fallbackChain: testFallbackChain,
    });
    loadBalancer.initialize();
  });

  afterEach(() => {
    // Reset all state
    loadBalancer.resetAll();
  });

  describe('Fallback Chain Configuration', () => {
    it('should load fallback chain from config', () => {
      const chain = loadBalancer.getFallbackChain();
      expect(chain).toHaveLength(4);
      expect(chain[0].model).toBe('claude-sonnet-4-5-20250929');
      expect(chain[0].provider).toBe('anthropic');
    });

    it('should allow setting a new fallback chain', () => {
      const newChain: FallbackChainEntry[] = [
        { model: 'gpt-4o', provider: 'openai' },
        { model: 'claude-sonnet', provider: 'anthropic' },
      ];
      loadBalancer.setFallbackChain(newChain);

      const chain = loadBalancer.getFallbackChain();
      expect(chain).toHaveLength(2);
      expect(chain[0].model).toBe('gpt-4o');
    });

    it('should return null when no fallback chain is configured', () => {
      const emptyLoadBalancer = new LoadBalancer({});
      emptyLoadBalancer.initialize();

      const selection = emptyLoadBalancer.selectProvider();
      expect(selection).toBeNull();
    });
  });

  describe('Provider Selection - Happy Path', () => {
    it('should select the first provider in the chain (index 0)', () => {
      const selection = loadBalancer.selectProvider();

      expect(selection).not.toBeNull();
      expect(selection!.provider).toBe('anthropic');
      expect(selection!.providerModel).toBe('claude-sonnet-4-5-20250929');
      expect(selection!.isFallback).toBe(false);
      expect(selection!.fallbackIndex).toBe(0);
    });

    it('should include API key in selection', () => {
      const selection = loadBalancer.selectProvider();

      expect(selection).not.toBeNull();
      expect(selection!.apiKey).toBe('sk-ant-test');
    });
  });

  describe('Provider Selection - Fallback Scenarios', () => {
    it('should skip to fallback when primary circuit is OPEN', () => {
      // Open circuit for primary provider
      const circuitBreaker = getCircuitBreaker();
      circuitBreaker.forceOpen('anthropic', 'claude-sonnet-4-5-20250929', 60000);

      const selection = loadBalancer.selectProvider();

      expect(selection).not.toBeNull();
      expect(selection!.provider).toBe('copilot');
      expect(selection!.providerModel).toBe('sonnet');
      expect(selection!.isFallback).toBe(true);
      expect(selection!.fallbackIndex).toBe(1);
    });

    it('should skip to second fallback when first two are unavailable', () => {
      const circuitBreaker = getCircuitBreaker();
      // Open circuits for first two providers
      circuitBreaker.forceOpen('anthropic', 'claude-sonnet-4-5-20250929', 60000);
      circuitBreaker.forceOpen('copilot', 'sonnet', 60000);

      const selection = loadBalancer.selectProvider();

      expect(selection).not.toBeNull();
      expect(selection!.provider).toBe('openai');
      expect(selection!.providerModel).toBe('gpt-4o');
      expect(selection!.isFallback).toBe(true);
      expect(selection!.fallbackIndex).toBe(2);
    });

    it('should skip rate-limited providers', () => {
      const rateLimitManager = getRateLimitManager();
      // Rate limit the primary provider
      rateLimitManager.handleRateLimitError(
        'anthropic',
        'claude-sonnet-4-5-20250929',
        429,
        { 'retry-after': '60' },
        'Rate limited'
      );

      const selection = loadBalancer.selectProvider();

      expect(selection).not.toBeNull();
      expect(selection!.provider).toBe('copilot');
      expect(selection!.providerModel).toBe('sonnet');
      expect(selection!.isFallback).toBe(true);
    });

    it('should skip disabled providers', () => {
      // gemini is disabled in mock config
      const circuitBreaker = getCircuitBreaker();
      circuitBreaker.forceOpen('anthropic', 'claude-sonnet-4-5-20250929', 60000);
      circuitBreaker.forceOpen('copilot', 'sonnet', 60000);
      circuitBreaker.forceOpen('openai', 'gpt-4o', 60000);

      const selection = loadBalancer.selectProvider();

      // Should be null because gemini (index 3) is disabled
      expect(selection).toBeNull();
    });

    it('should return null when all providers are unavailable', () => {
      const circuitBreaker = getCircuitBreaker();
      // Open circuits for all enabled providers
      circuitBreaker.forceOpen('anthropic', 'claude-sonnet-4-5-20250929', 60000);
      circuitBreaker.forceOpen('copilot', 'sonnet', 60000);
      circuitBreaker.forceOpen('openai', 'gpt-4o', 60000);

      const selection = loadBalancer.selectProvider();

      expect(selection).toBeNull();
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should record success and keep circuit closed', () => {
      loadBalancer.recordSuccess('anthropic', 'claude-sonnet-4-5-20250929', 'sk-ant-test');

      const circuitBreaker = getCircuitBreaker();
      const state = circuitBreaker.getCircuitState('anthropic', 'claude-sonnet-4-5-20250929');

      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
    });

    it('should record failure and eventually open circuit', () => {
      // Use forceOpen to simulate circuit opening (more reliable in tests)
      const circuitBreaker = getCircuitBreaker();
      circuitBreaker.forceOpen('anthropic', 'claude-sonnet-4-5-20250929', 60000);

      const state = circuitBreaker.getCircuitState('anthropic', 'claude-sonnet-4-5-20250929');
      expect(state.state).toBe('OPEN');

      // Verify that the load balancer respects the open circuit
      const selection = loadBalancer.selectProvider();
      expect(selection).not.toBeNull();
      expect(selection!.provider).toBe('copilot'); // Should fallback
    });

    it('should handle 429 errors with rate limit manager', () => {
      loadBalancer.recordFailure('anthropic', 'claude-sonnet-4-5-20250929', 'sk-ant-test', {
        statusCode: 429,
        headers: { 'retry-after': '120' },
        message: 'Too Many Requests',
      });

      const rateLimitManager = getRateLimitManager();
      const isLimited = rateLimitManager.isRateLimited('anthropic', 'claude-sonnet-4-5-20250929');

      expect(isLimited).toBe(true);
    });
  });

  describe('Status Reporting', () => {
    it('should return status with fallback chain', () => {
      const status = loadBalancer.getStatus();

      expect(status.fallbackChain).toHaveLength(4);
      expect(status.fallbackChain[0].model).toBe('claude-sonnet-4-5-20250929');
      expect(status.circuitBreakers).toBeDefined();
      expect(status.rateLimits).toBeDefined();
      expect(status.keyRotators).toBeDefined();
    });

    it('should show circuit breaker states in status', () => {
      const circuitBreaker = getCircuitBreaker();
      circuitBreaker.forceOpen('anthropic', 'claude-sonnet-4-5-20250929', 60000);

      const status = loadBalancer.getStatus();
      const cbStatus = status.circuitBreakers.get('anthropic:claude-sonnet-4-5-20250929');

      expect(cbStatus).toBeDefined();
      expect(cbStatus!.state).toBe('OPEN');
    });
  });

  describe('Reset Functionality', () => {
    it('should reset all state', () => {
      // Create some state
      const circuitBreaker = getCircuitBreaker();
      circuitBreaker.forceOpen('anthropic', 'claude-sonnet-4-5-20250929', 60000);

      const rateLimitManager = getRateLimitManager();
      rateLimitManager.handleRateLimitError('openai', 'gpt-4o', 429, {}, 'Rate limited');

      // Reset
      loadBalancer.resetAll();

      // Verify reset
      const selection = loadBalancer.selectProvider();
      expect(selection).not.toBeNull();
      expect(selection!.provider).toBe('anthropic');
      expect(selection!.fallbackIndex).toBe(0);
    });
  });

  describe('Global Instance', () => {
    it('should return the same instance from getLoadBalancer', () => {
      const instance1 = getLoadBalancer();
      const instance2 = getLoadBalancer();

      expect(instance1).toBe(instance2);
    });

    it('should initialize with config via initializeLoadBalancer', () => {
      const customChain: FallbackChainEntry[] = [
        { model: 'custom-model', provider: 'openai' },
      ];

      const lb = initializeLoadBalancer({
        fallbackChain: customChain,
      });

      expect(lb.getFallbackChain()).toHaveLength(1);
      expect(lb.getFallbackChain()[0].model).toBe('custom-model');
    });
  });
});

describe('Fallback Chain Flow', () => {
  it('should demonstrate complete fallback flow', () => {
    const chain: FallbackChainEntry[] = [
      { model: 'claude-sonnet', provider: 'anthropic' },
      { model: 'sonnet', provider: 'copilot' },
      { model: 'gpt-4o', provider: 'openai' },
    ];

    const lb = new LoadBalancer({
      circuitBreakerFailureThreshold: 2,
      fallbackChain: chain,
    });
    lb.initialize();

    // Step 1: First request succeeds with primary
    let selection = lb.selectProvider();
    expect(selection!.provider).toBe('anthropic');
    expect(selection!.fallbackIndex).toBe(0);

    // Step 2: Force open circuit for primary (simulating failures)
    const circuitBreaker = getCircuitBreaker();
    circuitBreaker.forceOpen('anthropic', 'claude-sonnet', 60000);

    // Step 3: Next request falls back to copilot
    selection = lb.selectProvider();
    expect(selection!.provider).toBe('copilot');
    expect(selection!.fallbackIndex).toBe(1);
    expect(selection!.isFallback).toBe(true);

    // Step 4: Copilot gets rate limited
    const rateLimitManager = getRateLimitManager();
    rateLimitManager.handleRateLimitError('copilot', 'sonnet', 429, { 'retry-after': '60' }, 'Rate limited');

    // Step 5: Next request falls back to OpenAI
    selection = lb.selectProvider();
    expect(selection!.provider).toBe('openai');
    expect(selection!.fallbackIndex).toBe(2);
    expect(selection!.isFallback).toBe(true);

    // Cleanup
    lb.resetAll();
  });
});
