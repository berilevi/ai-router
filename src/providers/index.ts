import { ProviderType, ProviderConfig } from '../types';
import { BaseProvider } from './base';
import { GeminiWebProvider } from './geminiWeb';
import { GeminiApiProvider } from './geminiApi';
import { OpenAICompatibleProvider } from './openaiCompatible';
import { AnthropicProvider } from './anthropic';
import { providerConfigs, anthropicConfig } from '../utils/config';
import { logger } from '../utils/logger';

/**
 * Provider factory for creating provider instances
 */
export class ProviderFactory {
  private static instances: Map<ProviderType, BaseProvider> = new Map();

  /**
   * Get or create a provider instance
   */
  static getProvider(type: ProviderType): BaseProvider | null {
    // Return existing instance if available
    if (this.instances.has(type)) {
      return this.instances.get(type)!;
    }

    // Get provider config
    const config = providerConfigs.find((p) => p.type === type);
    if (!config) {
      logger.error(`Provider configuration not found for type: ${type}`);
      return null;
    }

    // Create new instance
    const provider = this.createProvider(config);
    if (provider) {
      this.instances.set(type, provider);
    }

    return provider;
  }

  /**
   * Create a new provider instance
   */
  private static createProvider(config: ProviderConfig): BaseProvider | null {
    switch (config.type) {
      case 'gemini-web':
        return new GeminiWebProvider(config);
      case 'gemini-api':
        return new GeminiApiProvider(config);
      case 'anthropic':
        return this.createAnthropicProvider(config);
      case 'openai':
      case 'custom':
        return new OpenAICompatibleProvider(config);
      default:
        logger.error(`Unknown provider type: ${config.type}`);
        return null;
    }
  }

  /**
   * Initialize all enabled providers
   */
  static async initializeAll(): Promise<void> {
    const enabledProviders = providerConfigs.filter((p) => p.enabled);

    logger.info(`Initializing ${enabledProviders.length} enabled providers...`);

    for (const config of enabledProviders) {
      try {
        const provider = this.getProvider(config.type);
        if (provider) {
          await provider.initialize();
          logger.info(`Initialized provider: ${config.name}`);
        }
      } catch (error) {
        logger.error(`Failed to initialize provider ${config.name}:`, error);
        // Continue with other providers
      }
    }
  }

  /**
   * Get all available providers
   */
  static getAvailableProviders(): BaseProvider[] {
    const providers: BaseProvider[] = [];

    for (const config of providerConfigs) {
      if (!config.enabled) continue;

      const provider = this.getProvider(config.type);
      if (provider && provider.isAvailable()) {
        providers.push(provider);
      }
    }

    return providers;
  }

  /**
   * Check if a provider is available
   */
  static isProviderAvailable(type: ProviderType): boolean {
    const provider = this.getProvider(type);
    return provider?.isAvailable() || false;
  }

  /**
   * Get provider info
   */
  static getProviderInfo(type: ProviderType): ReturnType<BaseProvider['getInfo']> | null {
    const provider = this.getProvider(type);
    return provider?.getInfo() || null;
  }

  /**
   * Clean up all providers
   */
  static async cleanupAll(): Promise<void> {
    logger.info('Cleaning up all providers...');

    for (const [type, provider] of this.instances) {
      try {
        if (provider.cleanup) {
          await provider.cleanup();
          logger.info(`Cleaned up provider: ${type}`);
        }
      } catch (error) {
        logger.error(`Error cleaning up provider ${type}:`, error);
      }
    }

    this.instances.clear();
  }

  /**
   * Reset a provider (useful for reconnection)
   */
  static async resetProvider(type: ProviderType): Promise<void> {
    const provider = this.instances.get(type);
    if (provider && provider.cleanup) {
      await provider.cleanup();
    }
    this.instances.delete(type);
  }

  /**
   * Create Anthropic provider with fallback logic based on ANTHROPIC_PROVIDER_MODE
   * - native: Always use native Anthropic SDK
   * - compatible: Always use OpenAI-compatible wrapper
   * - auto (default): Use native provider
   */
  private static createAnthropicProvider(config: ProviderConfig): BaseProvider {
    const mode = anthropicConfig.providerMode;

    if (mode === 'compatible') {
      logger.info('Anthropic provider mode: compatible (OpenAI wrapper)');
      return new OpenAICompatibleProvider(config);
    }

    // For 'native' and 'auto' modes, use native provider
    logger.info(`Anthropic provider mode: ${mode} (native SDK)`);
    return new AnthropicProvider(config);
  }
}

// Export all providers
export { BaseProvider } from './base';
export { GeminiWebProvider } from './geminiWeb';
export { GeminiApiProvider } from './geminiApi';
export { OpenAICompatibleProvider } from './openaiCompatible';
export { AnthropicProvider } from './anthropic';

export default ProviderFactory;
