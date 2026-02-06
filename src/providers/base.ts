import {
  ChatCompletionOptions,
  ChatCompletionResponse,
  StreamChunk,
  ProviderConfig,
  ProviderError,
} from '../types';
import { logger } from '../utils/logger';

/**
 * Abstract base class for AI providers
 */
export abstract class BaseProvider {
  protected config: ProviderConfig;
  protected name: string;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.name = config.name;
  }

  /**
   * Check if the provider is available/initialized
   */
  abstract isAvailable(): boolean;

  /**
   * Initialize the provider (if needed)
   */
  abstract initialize(): Promise<void>;

  /**
   * Generate a chat completion
   */
  abstract chatCompletion(
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResponse>;

  /**
   * Generate a streaming chat completion
   */
  abstract chatCompletionStream(
    options: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk>;

  /**
   * Generate embeddings (optional)
   */
  async generateEmbeddings?(_input: string | string[]): Promise<number[][]> {
    throw new ProviderError(
      'Embeddings not supported by this provider',
      this.config.type
    );
  }

  /**
   * List available models from the provider
   */
  async listModels?(): Promise<string[]> {
    return this.config.models;
  }

  /**
   * Get provider info
   */
  getInfo(): {
    name: string;
    type: string;
    enabled: boolean;
    models: string[];
  } {
    return {
      name: this.name,
      type: this.config.type,
      enabled: this.config.enabled,
      models: this.config.models,
    };
  }

  /**
   * Handle errors consistently
   */
  protected handleError(error: unknown, context: string): never {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`${this.name} error in ${context}: ${message}`);
    
    throw new ProviderError(
      `${this.name} error: ${message}`,
      this.config.type,
      undefined,
      error instanceof Error ? error : undefined
    );
  }

  /**
   * Validate options before making requests
   */
  protected validateOptions(options: ChatCompletionOptions): void {
    if (!options.model) {
      throw new ProviderError('Model is required', this.config.type);
    }
    
    if (!options.messages || options.messages.length === 0) {
      throw new ProviderError('Messages are required', this.config.type);
    }
  }

  /**
   * Clean up resources
   */
  async cleanup?(): Promise<void> {
    // Override in subclasses if needed
  }
}

export default BaseProvider;
