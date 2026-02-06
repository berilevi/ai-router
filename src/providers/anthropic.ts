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
      const { messages, system } = this.formatMessagesAndSystem(options.messages, options.system);

      const requestParams: Anthropic.MessageCreateParams = {
        model: options.model,
        max_tokens: options.maxTokens || 4096,
        messages,
      };

      // Add system message if present
      if (system) {
        requestParams.system = system;
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
      const { messages, system } = this.formatMessagesAndSystem(options.messages, options.system);

      const requestParams: Anthropic.MessageCreateParams = {
        model: options.model,
        max_tokens: options.maxTokens || 4096,
        messages,
        stream: true,
      };

      // Add system message if present
      if (system) {
        requestParams.system = system;
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

      for await (const event of stream as AsyncIterable<Anthropic.MessageStreamEvent>) {
        if (event.type === 'message_start') {
          inputTokens = event.message.usage?.input_tokens || 0;
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
        },
      };
    } catch (error) {
      this.handleError(error, 'chatCompletionStream');
    }
  }

  /**
   * Format messages for Anthropic API and extract system message
   * Anthropic requires system message as a separate parameter, not in messages array
   */
  private formatMessagesAndSystem(
    messages: ChatCompletionMessage[],
    systemPrompt?: string
  ): { messages: Anthropic.MessageParam[]; system?: string } {
    const formatted: Anthropic.MessageParam[] = [];
    let system = systemPrompt;

    for (const message of messages) {
      const extMsg = message as ExtendedChatCompletionMessage;

      if (message.role === 'system') {
        // Accumulate system messages
        if (system) {
          system += '\n\n' + message.content;
        } else {
          system = message.content;
        }
      } else if (message.role === 'user') {
        const content = this.formatUserContent(message);
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
   */
  private formatUserContent(
    message: ChatCompletionMessage
  ): string | Anthropic.ContentBlockParam[] {
    // If no images, return plain text
    if (!message.images || message.images.length === 0) {
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

    // Add text content
    if (message.content) {
      content.push({
        type: 'text',
        text: message.content,
      });
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
}

export default AnthropicProvider;
