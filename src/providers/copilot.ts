/**
 * Copilot Provider - GitHub Copilot integration using @github/copilot-sdk
 * Provides chat completions through GitHub Copilot's API
 */

import {
  ChatCompletionOptions,
  ChatCompletionResponse,
  StreamChunk,
  ProviderConfig,
} from '../types';
import { BaseProvider } from './base';
import { logger } from '../utils/logger';
import { copilotConfig } from '../utils/copilotModelMapping';
import { copilotSessionManager } from '../utils/copilotSessionManager';

// Use the actual SDK types via dynamic import
type CopilotClientType = import('@github/copilot-sdk').CopilotClient;
type CopilotClientOptions = import('@github/copilot-sdk').CopilotClientOptions;

/**
 * GitHub Copilot Provider using @github/copilot-sdk
 */
export class CopilotProvider extends BaseProvider {
  private client: CopilotClientType | null = null;
  private availableModels: Set<string> = new Set();
  private isInitialized: boolean = false;

  constructor(config: ProviderConfig) {
    super(config);
  }

  isAvailable(): boolean {
    return this.config.enabled && this.isInitialized;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('Copilot provider already initialized');
      return;
    }

    try {
      logger.info('Initializing Copilot provider...');

      // Dynamic import of the Copilot SDK
      const { CopilotClient } = await import('@github/copilot-sdk');

      const clientOptions: CopilotClientOptions = {
        logLevel: (process.env.LOG_LEVEL || 'info') as 'none' | 'error' | 'warning' | 'info' | 'debug' | 'all',
        autoStart: true,
        autoRestart: true,
      };

      // Add GitHub token if available
      if (copilotConfig.githubToken) {
        clientOptions.githubToken = copilotConfig.githubToken;
      }

      this.client = new CopilotClient(clientOptions);
      await this.client.start();

      // Check authentication status
      const authStatus = await this.client.getAuthStatus();
      if (!authStatus.isAuthenticated) {
        throw new Error('GitHub authentication failed. Please run "gh auth login" or set COPILOT_GITHUB_TOKEN/GH_TOKEN');
      }
      logger.info(`Copilot authenticated as: ${authStatus.login}`);

      // Discover available models
      await this.discoverModels();

      this.isInitialized = true;
      logger.info(`Copilot provider initialized with ${this.availableModels.size} models`);
    } catch (error) {
      logger.error('Failed to initialize Copilot provider:', error);
      throw error;
    }
  }

  /**
   * Discover available models from Copilot
   */
  private async discoverModels(): Promise<void> {
    if (!this.client) return;

    try {
      const models = await this.client.listModels();
      this.availableModels = new Set(models.map(m => m.id));
      logger.debug(`Discovered Copilot models: ${Array.from(this.availableModels).join(', ')}`);
    } catch (error) {
      logger.warn('Failed to discover Copilot models, using defaults:', error);
      // Use default models from config
      this.availableModels = new Set(this.config.models);
    }
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    this.validateOptions(options);

    if (!this.isAvailable()) {
      throw new Error('Copilot provider is not available');
    }

    if (!this.client) {
      await this.initialize();
    }

    try {
      // Convert messages to a single prompt
      const prompt = this.formatMessagesAsPrompt(options);

      // Create a session for this request
      const session = await this.client!.createSession({
        model: options.model,
        streaming: false,
      });

      // Use sendAndWait for simpler non-streaming handling
      const response = await session.sendAndWait({ prompt });

      // Clean up session
      await session.destroy();

      const content = response?.data?.content || '';

      return {
        content,
        model: options.model,
        usage: {
          promptTokens: 0,  // Copilot doesn't provide token counts
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    } catch (error) {
      this.handleError(error, 'chatCompletion');
    }
  }

  async *chatCompletionStream(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    this.validateOptions(options);

    if (!this.isAvailable()) {
      throw new Error('Copilot provider is not available');
    }

    if (!this.client) {
      await this.initialize();
    }

    try {
      // Convert messages to a single prompt
      const prompt = this.formatMessagesAsPrompt(options);

      // Create a streaming session
      const session = await this.client!.createSession({
        model: options.model,
        streaming: true,
      });

      // Create a queue for chunks
      const chunkQueue: StreamChunk[] = [];
      let done = false;
      let error: Error | null = null;

      // Subscribe to events
      session.on('assistant.message_delta', (event) => {
        const deltaContent = (event as { data?: { deltaContent?: string } }).data?.deltaContent;
        if (deltaContent) {
          chunkQueue.push({
            content: deltaContent,
            done: false,
          });
        }
      });

      session.on('session.idle', () => {
        done = true;
      });

      session.on('session.error', (event) => {
        error = new Error((event as { data?: { message?: string } }).data?.message || 'Copilot error');
        done = true;
      });

      // Send the prompt
      await session.send({ prompt });

      // Yield chunks as they arrive
      while (!done || chunkQueue.length > 0) {
        if (error) {
          await session.destroy();
          throw error;
        }

        if (chunkQueue.length > 0) {
          yield chunkQueue.shift()!;
        } else {
          // Wait a bit for more chunks
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      // Yield final chunk
      yield {
        content: '',
        done: true,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
      };

      // Clean up session
      await session.destroy();
    } catch (error) {
      this.handleError(error, 'chatCompletionStream');
    }
  }

  /**
   * Format messages array as a single prompt for Copilot
   */
  private formatMessagesAsPrompt(options: ChatCompletionOptions): string {
    const parts: string[] = [];

    // Add system message if present
    if (options.system) {
      parts.push(`System: ${options.system}`);
    }

    // Format each message
    for (const message of options.messages) {
      if (message.role === 'system') {
        parts.push(`System: ${message.content}`);
      } else if (message.role === 'user') {
        parts.push(`User: ${message.content}`);
      } else if (message.role === 'assistant') {
        parts.push(`Assistant: ${message.content}`);
      } else if (message.role === 'tool') {
        parts.push(`Tool Result: ${message.content}`);
      }
    }

    // If only one user message and no system, just return the content
    if (parts.length === 1 && options.messages[0]?.role === 'user') {
      return options.messages[0].content;
    }

    return parts.join('\n\n');
  }

  async listModels(): Promise<string[]> {
    if (this.availableModels.size > 0) {
      return Array.from(this.availableModels);
    }
    return this.config.models;
  }

  async cleanup(): Promise<void> {
    logger.info('Cleaning up Copilot provider...');

    // Clean up all sessions
    await copilotSessionManager.cleanupAll();

    // Stop the client
    if (this.client) {
      try {
        await this.client.stop();
      } catch (error) {
        logger.warn('Error stopping Copilot client:', error);
      }
      this.client = null;
    }

    this.isInitialized = false;
    logger.info('Copilot provider cleaned up');
  }
}

export default CopilotProvider;
