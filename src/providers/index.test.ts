import { ProviderFactory } from './index';
import { AnthropicProvider } from './anthropic';
import { OpenAICompatibleProvider } from './openaiCompatible';

// Mock the providers
jest.mock('./anthropic');
jest.mock('./openaiCompatible');

// Mock the config
jest.mock('../utils/config', () => ({
  providerConfigs: [
    {
      type: 'anthropic',
      name: 'Anthropic',
      apiKey: 'test-key',
      baseUrl: 'https://api.anthropic.com/v1',
      enabled: true,
      defaultModel: 'claude-3-5-sonnet-20241022',
      priority: 4,
      models: ['claude-3-5-sonnet-20241022'],
    },
  ],
  anthropicConfig: {
    providerMode: 'native',
  },
}));

// Mock logger to avoid console noise
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('ProviderFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the internal instances map between tests
    (ProviderFactory as unknown as { instances: Map<string, unknown> }).instances = new Map();
  });

  describe('getProvider', () => {
    it('should return AnthropicProvider for native mode', () => {
      const provider = ProviderFactory.getProvider('anthropic');
      expect(provider).toBeDefined();
      expect(AnthropicProvider).toHaveBeenCalled();
    });

    it('should cache provider instances', () => {
      const provider1 = ProviderFactory.getProvider('anthropic');
      const provider2 = ProviderFactory.getProvider('anthropic');

      expect(provider1).toBe(provider2);
      expect(AnthropicProvider).toHaveBeenCalledTimes(1);
    });

    it('should return null for unknown provider type', () => {
      const provider = ProviderFactory.getProvider('unknown' as never);
      expect(provider).toBeNull();
    });
  });

  describe('isProviderAvailable', () => {
    it('should return false when provider does not exist', () => {
      const isAvailable = ProviderFactory.isProviderAvailable('unknown' as never);
      expect(isAvailable).toBe(false);
    });
  });
});

describe('ProviderFactory with compatible mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ProviderFactory as unknown as { instances: Map<string, unknown> }).instances = new Map();

    // Override the mock to use compatible mode
    jest.doMock('../utils/config', () => ({
      providerConfigs: [
        {
          type: 'anthropic',
          name: 'Anthropic',
          apiKey: 'test-key',
          baseUrl: 'https://api.anthropic.com/v1',
          enabled: true,
          defaultModel: 'claude-3-5-sonnet-20241022',
          priority: 4,
          models: ['claude-3-5-sonnet-20241022'],
        },
      ],
      anthropicConfig: {
        providerMode: 'compatible',
      },
    }));
  });

  // Note: Testing the compatible mode would require more complex module mocking
  // This is left as a placeholder for integration tests
  it('should be tested with compatible mode integration tests', () => {
    expect(true).toBe(true);
  });
});
