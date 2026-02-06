import OpenAI, { ClientOptions } from 'openai';
import {
  ChatCompletionOptions,
  ChatCompletionResponse,
  StreamChunk,
  ProviderConfig,
} from '../types';
import { BaseProvider } from './base';
import { logger } from '../utils/logger';

/**
 * OpenAI-compatible API Provider
 * Supports OpenAI, Azure OpenAI, and any OpenAI-compatible API
 */
export class OpenAICompatibleProvider extends BaseProvider {
  private client: OpenAI | null = null;

  constructor(config: ProviderConfig) {
    super(config);
  }

  isAvailable(): boolean {
    return this.config.enabled && !!this.config.apiKey;
  }

  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error(`${this.name} API key is not configured`);
    }

    try {
      logger.info(`Initializing ${this.name} provider...`);

      const clientConfig: ClientOptions = {
        apiKey: this.config.apiKey,
      };

      // Set base URL if provided (for Azure or custom endpoints)
      if (this.config.baseUrl) {
        clientConfig.baseURL = this.config.baseUrl;
      }

      this.client = new OpenAI(clientConfig);
      logger.info(`${this.name} provider initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.name} provider:`, error);
      throw error;
    }
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    this.validateOptions(options);

    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      const messages = this.formatMessages(options.messages, options.system);

      const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
        model: options.model,
        messages,
        stream: false,
      };

      // Add optional parameters
      if (options.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      }
      if (options.topP !== undefined) {
        requestParams.top_p = options.topP;
      }
      if (options.maxTokens !== undefined) {
        requestParams.max_tokens = options.maxTokens;
      }
      if (options.tools && options.tools.length > 0) {
        requestParams.tools = options.tools as OpenAI.Chat.ChatCompletionTool[];
      }

      const response = await this.client!.chat.completions.create(requestParams);

      const choice = response.choices[0];
      const message = choice.message;

      return {
        content: message.content || '',
        model: response.model,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
        toolCalls: message.tool_calls,
      };
    } catch (error) {
      this.handleError(error, 'chatCompletion');
    }
  }

  async *chatCompletionStream(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    this.validateOptions(options);

    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      const messages = this.formatMessages(options.messages, options.system);

      const requestParams: OpenAI.Chat.ChatCompletionCreateParams = {
        model: options.model,
        messages,
        stream: true,
      };

      // Add optional parameters
      if (options.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      }
      if (options.topP !== undefined) {
        requestParams.top_p = options.topP;
      }
      if (options.maxTokens !== undefined) {
        requestParams.max_tokens = options.maxTokens;
      }
      if (options.tools && options.tools.length > 0) {
        requestParams.tools = options.tools as OpenAI.Chat.ChatCompletionTool[];
      }

      const stream = await this.client!.chat.completions.create(requestParams);

      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        
        if (delta?.content) {
          yield {
            content: delta.content,
            done: false,
          };
        }

        // Track usage if available in the chunk
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
        }
      }

      yield {
        content: '',
        done: true,
        usage: promptTokens > 0 || completionTokens > 0
          ? {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens,
            }
          : undefined,
      };
    } catch (error) {
      this.handleError(error, 'chatCompletionStream');
    }
  }

  private formatMessages(
    messages: ChatCompletionOptions['messages'],
    systemPrompt?: string
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const formatted: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Add system message if provided
    if (systemPrompt) {
      formatted.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Add conversation messages
    for (const message of messages) {
      if (message.role === 'system' && !systemPrompt) {
        // Only add system messages if we haven't already added a system prompt
        formatted.push({
          role: 'system',
          content: message.content,
        });
      } else if (message.role === 'user') {
        const userMessage: OpenAI.Chat.ChatCompletionUserMessageParam = {
          role: 'user',
          content: message.content,
        };

        // Handle images if present
        if (message.images && message.images.length > 0) {
          const content: OpenAI.Chat.ChatCompletionContentPart[] = [
            { type: 'text', text: message.content },
          ];

          for (const image of message.images) {
            content.push({
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${image.toString('base64')}`,
              },
            });
          }

          userMessage.content = content;
        }

        formatted.push(userMessage);
      } else if (message.role === 'assistant') {
        formatted.push({
          role: 'assistant',
          content: message.content,
        });
      }
    }

    return formatted;
  }

  async generateEmbeddings(input: string | string[]): Promise<number[][]> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      const inputs = Array.isArray(input) ? input : [input];
      
      // Use text-embedding-3-small as default embedding model
      const response = await this.client!.embeddings.create({
        model: 'text-embedding-3-small',
        input: inputs,
      });

      return response.data.map((item: { embedding: number[] }) => item.embedding);
    } catch (error) {
      this.handleError(error, 'generateEmbeddings');
    }
  }

  async listModels(): Promise<string[]> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      const response = await this.client!.models.list();
      return response.data
        .filter((model: { id: string }) => model.id.includes('gpt') || model.id.includes('claude'))
        .map((model: { id: string }) => model.id);
    } catch {
      // Fallback to configured models if API doesn't support listing
      return this.config.models;
    }
  }
}

export default OpenAICompatibleProvider;
