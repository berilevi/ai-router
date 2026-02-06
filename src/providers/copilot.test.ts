/**
 * Copilot Provider Unit Tests
 */

import { CopilotProvider } from './copilot';
import { ProviderConfig } from '../types';

// Mock configuration
const mockConfig: ProviderConfig = {
  type: 'copilot',
  name: 'GitHub Copilot',
  enabled: true,
  defaultModel: 'gpt-4.1',
  priority: 0,
  models: ['gpt5', 'gpt-4.1', 'opus', 'sonnet', 'haiku'],
};

describe('CopilotProvider', () => {
  let provider: CopilotProvider;

  beforeEach(() => {
    provider = new CopilotProvider(mockConfig);
  });

  describe('constructor', () => {
    it('should create a provider instance', () => {
      expect(provider).toBeInstanceOf(CopilotProvider);
    });

    it('should not be available before initialization', () => {
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('getInfo', () => {
    it('should return provider info', () => {
      const info = provider.getInfo();
      expect(info.name).toBe('GitHub Copilot');
      expect(info.type).toBe('copilot');
      expect(info.enabled).toBe(true);
      expect(info.models).toContain('gpt5');
    });
  });

  describe('listModels', () => {
    it('should return configured models', async () => {
      const models = await provider.listModels();
      expect(models).toContain('gpt5');
      expect(models).toContain('gpt-4.1');
      expect(models).toContain('opus');
    });
  });

  // Note: Full integration tests require actual GitHub authentication
  // These tests verify the structure and error handling

  describe('chatCompletion', () => {
    it('should throw error if not initialized', async () => {
      await expect(provider.chatCompletion({
        model: 'gpt5',
        messages: [{ role: 'user', content: 'Hello' }],
      })).rejects.toThrow('Copilot provider is not available');
    });

    it('should throw error if messages are empty', async () => {
      // Mock initialization
      (provider as unknown as { isInitialized: boolean }).isInitialized = true;

      await expect(provider.chatCompletion({
        model: 'gpt5',
        messages: [],
      })).rejects.toThrow('Messages are required');
    });
  });

  describe('cleanup', () => {
    it('should clean up without errors', async () => {
      await expect(provider.cleanup()).resolves.not.toThrow();
    });
  });
});

describe('CopilotProvider - formatMessagesAsPrompt', () => {
  let provider: CopilotProvider;

  beforeEach(() => {
    provider = new CopilotProvider(mockConfig);
  });

  it('should format single user message correctly', () => {
    const formatMethod = (provider as unknown as { formatMessagesAsPrompt: (opts: unknown) => string }).formatMessagesAsPrompt.bind(provider);
    const result = formatMethod({
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(result).toBe('Hello');
  });

  it('should include system prompt', () => {
    const formatMethod = (provider as unknown as { formatMessagesAsPrompt: (opts: unknown) => string }).formatMessagesAsPrompt.bind(provider);
    const result = formatMethod({
      system: 'You are a helpful assistant',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(result).toContain('System: You are a helpful assistant');
    expect(result).toContain('User: Hello');
  });

  it('should format multi-turn conversation', () => {
    const formatMethod = (provider as unknown as { formatMessagesAsPrompt: (opts: unknown) => string }).formatMessagesAsPrompt.bind(provider);
    const result = formatMethod({
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
        { role: 'user', content: 'How are you?' },
      ],
    });
    expect(result).toContain('User: Hi');
    expect(result).toContain('Assistant: Hello!');
    expect(result).toContain('User: How are you?');
  });
});
