/**
 * Anthropic Messages API Translator
 * Bidirectional translation between Anthropic Messages API format and internal format
 */

import {
  AnthropicMessagesRequest,
  AnthropicMessagesResponse,
  AnthropicMessage,
  AnthropicContentBlock,
  AnthropicTextBlock,
  AnthropicImageBlock,
  AnthropicToolUseBlock,
  AnthropicToolResultBlock,
  AnthropicTool,
  AnthropicStreamEvent,
  AnthropicMessageStartEvent,
  AnthropicContentBlockStartEvent,
  AnthropicContentBlockDeltaEvent,
  AnthropicContentBlockStopEvent,
  AnthropicMessageDeltaEvent,
  AnthropicMessageStopEvent,
  AnthropicErrorResponse,
  ERROR_TYPE_MAP,
  generateMessageId,
  generateToolUseId,
} from '../types/anthropic';
import {
  ChatCompletionOptions,
  ChatCompletionMessage,
  ChatCompletionResponse,
  StreamChunk,
} from '../types';
import { logger } from './logger';

/**
 * Extended internal message type with tool support
 */
interface ExtendedChatCompletionMessage extends ChatCompletionMessage {
  tool_call_id?: string;
  tool_use?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
}

/**
 * Translate Anthropic Messages API request to internal ChatCompletionOptions
 */
export function translateRequest(request: AnthropicMessagesRequest): ChatCompletionOptions {
  const messages = translateMessages(request.messages);

  const options: ChatCompletionOptions = {
    model: request.model,
    messages,
    maxTokens: request.max_tokens,
    stream: request.stream,
  };

  // Add optional parameters
  if (request.system) {
    options.system = request.system;
  }
  if (request.temperature !== undefined) {
    options.temperature = request.temperature;
  }
  if (request.top_p !== undefined) {
    options.topP = request.top_p;
  }
  if (request.top_k !== undefined) {
    options.topK = request.top_k;
  }
  if (request.stop_sequences && request.stop_sequences.length > 0) {
    options.stopSequences = request.stop_sequences;
  }
  if (request.tools && request.tools.length > 0) {
    options.tools = translateTools(request.tools);
  }

  return options;
}

/**
 * Translate Anthropic messages to internal format
 */
export function translateMessages(messages: AnthropicMessage[]): ChatCompletionMessage[] {
  const result: ExtendedChatCompletionMessage[] = [];

  for (const message of messages) {
    if (typeof message.content === 'string') {
      // Simple text message
      result.push({
        role: message.role,
        content: message.content,
      });
    } else {
      // Array of content blocks
      const textParts: string[] = [];
      const images: Buffer[] = [];
      let toolCallId: string | undefined;
      const toolUseBlocks: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

      for (const block of message.content) {
        switch (block.type) {
          case 'text':
            textParts.push((block as AnthropicTextBlock).text);
            break;
          case 'image':
            const imageBuffer = translateImageContent(block as AnthropicImageBlock);
            if (imageBuffer) {
              images.push(imageBuffer);
            }
            break;
          case 'tool_use':
            const toolUse = block as AnthropicToolUseBlock;
            toolUseBlocks.push({
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input,
            });
            break;
          case 'tool_result':
            const toolResult = block as AnthropicToolResultBlock;
            toolCallId = toolResult.tool_use_id;
            // Add tool result as separate message
            const toolResultContent = typeof toolResult.content === 'string'
              ? toolResult.content
              : toolResult.content.map(b => (b as AnthropicTextBlock).text || '').join('');
            result.push({
              role: 'tool' as const,
              content: toolResultContent,
              tool_call_id: toolCallId,
            });
            break;
        }
      }

      // Add the main message if it has text content
      if (textParts.length > 0 || images.length > 0 || toolUseBlocks.length > 0) {
        const msg: ExtendedChatCompletionMessage = {
          role: message.role,
          content: textParts.join('\n'),
        };
        if (images.length > 0) {
          msg.images = images;
        }
        if (toolUseBlocks.length > 0) {
          msg.tool_use = toolUseBlocks;
        }
        if (toolCallId) {
          msg.tool_call_id = toolCallId;
        }
        result.push(msg);
      }
    }
  }

  return result;
}

/**
 * Translate image content from Anthropic format to Buffer
 */
export function translateImageContent(block: AnthropicImageBlock): Buffer | null {
  try {
    if (block.source.type === 'base64') {
      return Buffer.from(block.source.data, 'base64');
    } else if (block.source.type === 'url') {
      // URL images would need to be fetched - for now, log a warning
      logger.warn('URL-based images are not yet supported, skipping');
      return null;
    }
  } catch (error) {
    logger.error('Failed to decode image:', error);
  }
  return null;
}

/**
 * Translate internal tools format to pass through
 * (Tools are already in a compatible format)
 */
export function translateTools(tools: AnthropicTool[]): unknown[] {
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  }));
}

/**
 * Translate internal ChatCompletionResponse to Anthropic format
 */
export function translateResponse(
  response: ChatCompletionResponse,
  model: string,
  inputTokens: number = 0
): AnthropicMessagesResponse {
  const content: AnthropicContentBlock[] = [];

  // Add text content
  if (response.content) {
    content.push({
      type: 'text',
      text: response.content,
    });
  }

  // Add tool use blocks if present
  if (response.toolCalls && response.toolCalls.length > 0) {
    for (const toolCall of response.toolCalls) {
      const tc = toolCall as { id?: string; name: string; input?: Record<string, unknown>; arguments?: Record<string, unknown> };
      content.push({
        type: 'tool_use',
        id: tc.id || generateToolUseId(),
        name: tc.name,
        input: tc.input || tc.arguments || {},
      });
    }
  }

  // Determine stop reason
  let stopReason: AnthropicMessagesResponse['stop_reason'] = 'end_turn';
  if (response.toolCalls && response.toolCalls.length > 0) {
    stopReason = 'tool_use';
  }

  return {
    id: generateMessageId(),
    type: 'message',
    role: 'assistant',
    content,
    model: response.model || model,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: inputTokens || response.usage?.promptTokens || 0,
      output_tokens: response.usage?.completionTokens || 0,
    },
  };
}

/**
 * Stream event generator - generates Anthropic SSE events from stream chunks
 */
export class StreamEventGenerator {
  private messageId: string;
  private model: string;
  private inputTokens: number;
  private outputTokens: number;
  private contentIndex: number;
  private hasStartedContent: boolean;

  constructor(model: string, inputTokens: number = 0) {
    this.messageId = generateMessageId();
    this.model = model;
    this.inputTokens = inputTokens;
    this.outputTokens = 0;
    this.contentIndex = 0;
    this.hasStartedContent = false;
  }

  /**
   * Generate message_start event
   */
  getMessageStartEvent(): AnthropicMessageStartEvent {
    return {
      type: 'message_start',
      message: {
        id: this.messageId,
        type: 'message',
        role: 'assistant',
        content: [],
        model: this.model,
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: this.inputTokens,
          output_tokens: 0,
        },
      },
    };
  }

  /**
   * Generate content_block_start event
   */
  getContentBlockStartEvent(): AnthropicContentBlockStartEvent {
    this.hasStartedContent = true;
    return {
      type: 'content_block_start',
      index: this.contentIndex,
      content_block: {
        type: 'text',
        text: '',
      },
    };
  }

  /**
   * Generate content_block_delta event for a text chunk
   */
  getContentBlockDeltaEvent(text: string): AnthropicContentBlockDeltaEvent {
    return {
      type: 'content_block_delta',
      index: this.contentIndex,
      delta: {
        type: 'text_delta',
        text,
      },
    };
  }

  /**
   * Generate content_block_stop event
   */
  getContentBlockStopEvent(): AnthropicContentBlockStopEvent {
    return {
      type: 'content_block_stop',
      index: this.contentIndex,
    };
  }

  /**
   * Generate message_delta event
   */
  getMessageDeltaEvent(outputTokens: number = 0): AnthropicMessageDeltaEvent {
    this.outputTokens = outputTokens;
    return {
      type: 'message_delta',
      delta: {
        stop_reason: 'end_turn',
        stop_sequence: null,
      },
      usage: {
        output_tokens: outputTokens,
      },
    };
  }

  /**
   * Generate message_stop event
   */
  getMessageStopEvent(): AnthropicMessageStopEvent {
    return {
      type: 'message_stop',
    };
  }

  /**
   * Process a stream chunk and generate appropriate events
   */
  *processChunk(chunk: StreamChunk): Generator<AnthropicStreamEvent> {
    // If this is the first content, emit content_block_start
    if (!this.hasStartedContent && chunk.content) {
      yield this.getContentBlockStartEvent();
    }

    // Emit content delta if there's content
    if (chunk.content) {
      yield this.getContentBlockDeltaEvent(chunk.content);
    }

    // If done, emit closing events
    if (chunk.done) {
      if (this.hasStartedContent) {
        yield this.getContentBlockStopEvent();
      }
      yield this.getMessageDeltaEvent(chunk.usage?.completionTokens || 0);
      yield this.getMessageStopEvent();
    }
  }
}

/**
 * Format SSE event for writing to response
 */
export function formatSSE(event: AnthropicStreamEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Translate an error to Anthropic error format
 */
export function translateError(
  error: Error,
  statusCode?: number
): { response: AnthropicErrorResponse; status: number } {
  const message = error.message.toLowerCase();

  // Try to match error type
  let errorType: AnthropicErrorResponse['error']['type'] = 'api_error';
  let status = statusCode || 500;

  for (const [keyword, mapping] of Object.entries(ERROR_TYPE_MAP)) {
    if (message.includes(keyword)) {
      errorType = mapping.type;
      status = mapping.status;
      break;
    }
  }

  return {
    response: {
      type: 'error',
      error: {
        type: errorType,
        message: error.message,
      },
    },
    status,
  };
}

export default {
  translateRequest,
  translateMessages,
  translateResponse,
  translateImageContent,
  translateTools,
  translateError,
  formatSSE,
  StreamEventGenerator,
};
