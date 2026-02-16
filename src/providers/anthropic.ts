import Anthropic from '@anthropic-ai/sdk';
import {
  ChatCompletionOptions,
  ChatCompletionResponse,
  ChatCompletionMessage,
  StreamChunk,
  ProviderConfig,
} from '../types';
import { BaseProvider } from './base';
import { logger } from '../utils/logger';
import { anthropicPromptCacheConfig } from '../utils/config';

/**
 * Extended ChatCompletionMessage type with tool-related fields
 * Used for handling tool result messages in multi-turn conversations
 */
interface ExtendedChatCompletionMessage extends ChatCompletionMessage {
  /** Tool call ID for tool result messages */
  tool_call_id?: string;
  /** Tool use blocks from assistant response (for multi-turn tool conversations) */
  tool_use?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
}

/**
 * Native Anthropic Provider using official @anthropic-ai/sdk
 * Provides direct integration with Anthropic's API without OpenAI compatibility wrapper
 */
export class AnthropicProvider extends BaseProvider {
  private client: Anthropic | null = null;

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
      logger.info(`Initializing ${this.name} native provider...`);

      this.client = new Anthropic({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl || undefined,
      });

      logger.info(`${this.name} native provider initialized successfully`);
    } catch (error) {
      logger.error(`Failed to initialize ${this.name} native provider:`, error);
      throw error;
    }
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    this.validateOptions(options);

    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    if (!this.client) {
      await this.initialize();
    }

    try {
      // Calculate content length for cache decision
      const systemLength = options.system?.length || 0;
      const messagesLength = options.messages.reduce((sum, msg) => sum + msg.content.length, 0);
      const totalLength = systemLength + messagesLength;

      // Determine caching strategy
      const cacheStrategy = this.shouldEnableCache(options, totalLength);

      const { messages, system } = this.formatMessagesAndSystem(
        options.messages,
        options.system,
        cacheStrategy.enabled ? true : options.enableCache, // Use strategy or client override
        options.cacheBreakpoints
      );

      const requestParams: Anthropic.MessageCreateParams = {
        model: options.model,
        max_tokens: options.maxTokens || 4096,
        messages,
      };

      // Add system message if present (with caching support)
      if (system) {
        if (cacheStrategy.enabled && cacheStrategy.cacheSystemPrompt && typeof system === 'string') {
          // Enable caching for system prompt
          requestParams.system = [
            {
              type: 'text',
              text: system,
              cache_control: { type: 'ephemeral' },
            },
          ];
          logger.debug('Prompt caching enabled for system prompt');
        } else {
          requestParams.system = system;
        }
      }

      // Add optional parameters
      if (options.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      }
      if (options.topP !== undefined) {
        requestParams.top_p = options.topP;
      }
      if (options.tools && options.tools.length > 0) {
        requestParams.tools = this.formatTools(options.tools);
      }

      const response = await this.client!.messages.create(requestParams);

      // Extract text content from response
      let content = '';
      const toolCalls: Anthropic.ToolUseBlock[] = [];

      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push(block);
        }
      }

      return {
        content,
        model: response.model,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens,
          // Add caching metrics if available
          cacheCreationInputTokens: (response.usage as { cache_creation_input_tokens?: number }).cache_creation_input_tokens,
          cacheReadInputTokens: (response.usage as { cache_read_input_tokens?: number }).cache_read_input_tokens,
        },
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
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

    if (!this.client) {
      await this.initialize();
    }

    try {
      // Calculate content length for cache decision
      const systemLength = options.system?.length || 0;
      const messagesLength = options.messages.reduce((sum, msg) => sum + msg.content.length, 0);
      const totalLength = systemLength + messagesLength;

      // Determine caching strategy
      const cacheStrategy = this.shouldEnableCache(options, totalLength);

      const { messages, system } = this.formatMessagesAndSystem(
        options.messages,
        options.system,
        cacheStrategy.enabled ? true : options.enableCache, // Use strategy or client override
        options.cacheBreakpoints
      );

      const requestParams: Anthropic.MessageCreateParams = {
        model: options.model,
        max_tokens: options.maxTokens || 4096,
        messages,
        stream: true,
      };

      // Add system message if present (with caching support)
      if (system) {
        if (cacheStrategy.enabled && cacheStrategy.cacheSystemPrompt && typeof system === 'string') {
          // Enable caching for system prompt
          requestParams.system = [
            {
              type: 'text',
              text: system,
              cache_control: { type: 'ephemeral' },
            },
          ];
          logger.debug('Prompt caching enabled for system prompt (streaming)');
        } else {
          requestParams.system = system;
        }
      }

      // Add optional parameters
      if (options.temperature !== undefined) {
        requestParams.temperature = options.temperature;
      }
      if (options.topP !== undefined) {
        requestParams.top_p = options.topP;
      }
      if (options.tools && options.tools.length > 0) {
        requestParams.tools = this.formatTools(options.tools);
      }

      const stream = await this.client!.messages.create(requestParams);

      let inputTokens = 0;
      let outputTokens = 0;
      let cacheCreationInputTokens = 0;
      let cacheReadInputTokens = 0;

      for await (const event of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
        if (event.type === 'message_start') {
          inputTokens = event.message.usage?.input_tokens || 0;
          // Track cache metrics from message_start
          const usage = event.message.usage as { cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
          cacheCreationInputTokens = usage?.cache_creation_input_tokens || 0;
          cacheReadInputTokens = usage?.cache_read_input_tokens || 0;
        } else if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if ('text' in delta) {
            yield {
              content: delta.text,
              done: false,
            };
          }
        } else if (event.type === 'message_delta') {
          outputTokens = event.usage?.output_tokens || 0;
        }
      }

      yield {
        content: '',
        done: true,
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
          cacheCreationInputTokens: cacheCreationInputTokens > 0 ? cacheCreationInputTokens : undefined,
          cacheReadInputTokens: cacheReadInputTokens > 0 ? cacheReadInputTokens : undefined,
        },
      };
    } catch (error) {
      this.handleError(error, 'chatCompletionStream');
    }
  }

  /**
   * Determine if prompt caching should be enabled based on global config and request options
   *
   * Priority:
   * 1. Client explicitly sets enableCache (true or false) → use client's choice
   * 2. Global config disabled → don't enable
   * 3. Content too small (< minTokens) → don't enable
   * 4. Global config enabled + sufficient content → enable
   */
  private shouldEnableCache(
    options: ChatCompletionOptions,
    contentLength: number
  ): { enabled: boolean; cacheSystemPrompt: boolean; cacheLastMessage: boolean } {
    // Client explicitly disabled caching
    if (options.enableCache === false) {
      return { enabled: false, cacheSystemPrompt: false, cacheLastMessage: false };
    }

    // Client explicitly enabled caching
    if (options.enableCache === true) {
      return {
        enabled: true,
        cacheSystemPrompt: true,
        cacheLastMessage: options.cacheBreakpoints !== undefined, // Use custom breakpoints if provided
      };
    }

    // Use global config defaults
    if (!anthropicPromptCacheConfig.enabled) {
      return { enabled: false, cacheSystemPrompt: false, cacheLastMessage: false };
    }

    // Estimate if content is large enough (rough estimate: ~4 chars per token)
    const estimatedTokens = Math.floor(contentLength / 4);
    if (estimatedTokens < anthropicPromptCacheConfig.minTokens) {
      logger.debug(`Prompt caching disabled: estimated ${estimatedTokens} tokens < ${anthropicPromptCacheConfig.minTokens} minimum`);
      return { enabled: false, cacheSystemPrompt: false, cacheLastMessage: false };
    }

    // Global config says enable
    return {
      enabled: true,
      cacheSystemPrompt: anthropicPromptCacheConfig.cacheSystemPrompt,
      cacheLastMessage: anthropicPromptCacheConfig.cacheLastMessage,
    };
  }

  /**
   * Format messages for Anthropic API and extract system message
   * Anthropic requires system message as a separate parameter, not in messages array
   * Supports prompt caching via cache_control blocks
   */
  private formatMessagesAndSystem(
    messages: ChatCompletionMessage[],
    systemPrompt?: string,
    enableCache?: boolean,
    cacheBreakpoints?: number[]
  ): { messages: Anthropic.MessageParam[]; system?: string | Anthropic.TextBlockParam[] } {
    const formatted: Anthropic.MessageParam[] = [];
    let system = systemPrompt;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const extMsg = message as ExtendedChatCompletionMessage;
      const shouldCache = enableCache && cacheBreakpoints?.includes(i);

      if (message.role === 'system') {
        // Accumulate system messages
        if (system) {
          system += '\n\n' + message.content;
        } else {
          system = message.content;
        }
      } else if (message.role === 'user') {
        const content = this.formatUserContent(message, shouldCache);
        formatted.push({
          role: 'user',
          content,
        });
      } else if (message.role === 'assistant') {
        // Handle assistant messages with potential tool_use blocks
        if (extMsg.tool_use && extMsg.tool_use.length > 0) {
          // Assistant message with tool use blocks for multi-turn tool conversations
          const contentBlocks: Anthropic.ContentBlockParam[] = [];

          // Add text content if present
          if (message.content) {
            contentBlocks.push({
              type: 'text',
              text: message.content,
            });
          }

          // Add tool_use blocks
          for (const toolUse of extMsg.tool_use) {
            contentBlocks.push({
              type: 'tool_use',
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input,
            });
          }

          formatted.push({
            role: 'assistant',
            content: contentBlocks,
          });
        } else {
          // Plain text assistant message
          formatted.push({
            role: 'assistant',
            content: message.content,
          });
        }
      } else if (message.role === 'tool') {
        // Handle tool result messages
        // Anthropic expects tool results as user messages with tool_result content blocks
        const toolResultContent: Anthropic.ToolResultBlockParam = {
          type: 'tool_result',
          tool_use_id: extMsg.tool_call_id || '',
          content: message.content,
        };

        // Check if the last message is a user message with tool results
        // If so, add to that message; otherwise create a new user message
        const lastMessage = formatted[formatted.length - 1];
        if (lastMessage && lastMessage.role === 'user' && Array.isArray(lastMessage.content)) {
          // Check if last user message contains tool_result blocks
          const hasToolResult = (lastMessage.content as Anthropic.ContentBlockParam[]).some(
            (block) => block.type === 'tool_result'
          );
          if (hasToolResult) {
            (lastMessage.content as Anthropic.ToolResultBlockParam[]).push(toolResultContent);
            continue;
          }
        }

        // Create new user message with tool result
        formatted.push({
          role: 'user',
          content: [toolResultContent],
        });
      }
    }

    return { messages: formatted, system };
  }

  /**
   * Format user message content, including images if present
   * Supports cache_control for prompt caching
   */
  private formatUserContent(
    message: ChatCompletionMessage,
    enableCache?: boolean
  ): string | Anthropic.ContentBlockParam[] {
    // If no images, return plain text (with optional caching)
    if (!message.images || message.images.length === 0) {
      if (enableCache) {
        return [
          {
            type: 'text',
            text: message.content,
            cache_control: { type: 'ephemeral' },
          },
        ];
      }
      return message.content;
    }

    // With images, use content block array
    const content: Anthropic.ContentBlockParam[] = [];

    // Add images first
    for (const image of message.images) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: this.detectImageMediaType(image),
          data: image.toString('base64'),
        },
      });
    }

    // Add text content (with optional caching on last block)
    if (message.content) {
      const textBlock: Anthropic.TextBlockParam = {
        type: 'text',
        text: message.content,
      };
      if (enableCache) {
        textBlock.cache_control = { type: 'ephemeral' };
      }
      content.push(textBlock);
    }

    return content;
  }

  /**
   * Detect image media type from buffer magic bytes
   * Safely handles empty or small buffers
   */
  private detectImageMediaType(buffer: Buffer): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
    // Safety check for empty or too small buffers
    if (!buffer || buffer.length < 4) {
      return 'image/jpeg'; // Default to JPEG for unknown/invalid buffers
    }

    // Check magic bytes
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'image/jpeg';
    }
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'image/png';
    }
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'image/gif';
    }
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      return 'image/webp';
    }
    // Default to JPEG if unknown
    return 'image/jpeg';
  }

  /**
   * Format tools for Anthropic API
   */
  private formatTools(tools: unknown[]): Anthropic.Tool[] {
    return tools.map((tool) => {
      const t = tool as {
        type?: string;
        function?: {
          name: string;
          description?: string;
          parameters?: Record<string, unknown>;
        };
        name?: string;
        description?: string;
        input_schema?: Record<string, unknown>;
      };

      // Handle OpenAI-style tool format
      if (t.type === 'function' && t.function) {
        return {
          name: t.function.name,
          description: t.function.description || '',
          input_schema: (t.function.parameters || { type: 'object', properties: {} }) as Anthropic.Tool.InputSchema,
        };
      }

      // Handle Anthropic-style tool format (pass through)
      return {
        name: t.name || '',
        description: t.description || '',
        input_schema: (t.input_schema || { type: 'object', properties: {} }) as Anthropic.Tool.InputSchema,
      };
    });
  }

  async listModels(): Promise<string[]> {
    // Anthropic doesn't have a public models list API, return configured models
    return this.config.models;
  }

  /**
   * Create a message batch for bulk processing
   */
  async createBatch(requests: unknown[]): Promise<unknown> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    if (!this.client) {
      await this.initialize();
    }

    try {
      logger.info(`Creating batch with ${requests.length} requests`);
      const batch = await this.client!.beta.messages.batches.create({ requests: requests as never[] });
      logger.info(`Batch created: ${batch.id}, status: ${batch.processing_status}`);
      return batch;
    } catch (error) {
      this.handleError(error, 'createBatch');
    }
  }

  /**
   * Get batch status and metadata
   */
  async getBatch(batchId: string): Promise<unknown> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    if (!this.client) {
      await this.initialize();
    }

    try {
      logger.debug(`Retrieving batch: ${batchId}`);
      return await this.client!.beta.messages.batches.retrieve(batchId);
    } catch (error) {
      this.handleError(error, 'getBatch');
    }
  }

  /**
   * Get batch results as async iterator
   */
  async *getBatchResults(batchId: string): AsyncGenerator<unknown> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    if (!this.client) {
      await this.initialize();
    }

    try {
      logger.debug(`Retrieving results for batch: ${batchId}`);
      const decoder = await this.client!.beta.messages.batches.results(batchId);

      for await (const result of decoder) {
        yield result;
      }
    } catch (error) {
      this.handleError(error, 'getBatchResults');
    }
  }

  /**
   * List batches with pagination
   */
  async listBatches(params?: {
    before?: string;
    after?: string;
    limit?: number;
  }): Promise<unknown> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    if (!this.client) {
      await this.initialize();
    }

    try {
      logger.debug('Listing batches', params);
      return await this.client!.beta.messages.batches.list(params);
    } catch (error) {
      this.handleError(error, 'listBatches');
    }
  }

  /**
   * Cancel a batch
   */
  async cancelBatch(batchId: string): Promise<unknown> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    if (!this.client) {
      await this.initialize();
    }

    try {
      logger.info(`Cancelling batch: ${batchId}`);
      const batch = await this.client!.beta.messages.batches.cancel(batchId);
      logger.info(`Batch cancelled: ${batch.id}, status: ${batch.processing_status}`);
      return batch;
    } catch (error) {
      this.handleError(error, 'cancelBatch');
    }
  }
}

export default AnthropicProvider;
