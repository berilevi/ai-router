import OpenAI, { ClientOptions, toFile } from 'openai';
import {
  ChatCompletionOptions,
  ChatCompletionResponse,
  StreamChunk,
  ProviderConfig,
} from '../types';
import { BaseProvider } from './base';
import { logger } from '../utils/logger';

/**
 * OpenAI Batch request format (JSONL line)
 */
export interface OpenAIBatchRequest {
  custom_id: string;
  method: 'POST';
  url: '/v1/chat/completions' | '/v1/embeddings';
  body: {
    model: string;
    messages?: Array<{ role: string; content: string }>;
    input?: string | string[];
    temperature?: number;
    max_tokens?: number;
    [key: string]: unknown;
  };
}

/**
 * OpenAI Batch creation parameters
 */
export interface OpenAIBatchCreateParams {
  requests?: OpenAIBatchRequest[];
  input_file_id?: string;
  endpoint: '/v1/chat/completions' | '/v1/embeddings';
  completion_window: '24h';
  metadata?: Record<string, string>;
}

/**
 * OpenAI Batch result (JSONL line)
 */
export interface OpenAIBatchResult {
  id: string;
  custom_id: string;
  response?: {
    status_code: number;
    request_id: string;
    body: unknown;
  };
  error?: {
    code: string;
    message: string;
  };
}

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
      const toolCallsMap: Map<number, any> = new Map();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          yield {
            content: delta.content,
            done: false,
          };
        }

        // Accumulate tool calls from streaming chunks
        if (delta?.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;

            if (!toolCallsMap.has(index)) {
              toolCallsMap.set(index, {
                id: toolCallDelta.id || '',
                type: 'function',
                function: {
                  name: toolCallDelta.function?.name || '',
                  arguments: toolCallDelta.function?.arguments || '',
                },
              });
            } else {
              const existing = toolCallsMap.get(index);
              if (toolCallDelta.id) existing.id = toolCallDelta.id;
              if (toolCallDelta.function?.name) existing.function.name = toolCallDelta.function.name;
              if (toolCallDelta.function?.arguments) {
                existing.function.arguments += toolCallDelta.function.arguments;
              }
            }
          }
        }

        // Track usage if available in the chunk
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens;
          completionTokens = chunk.usage.completion_tokens;
        }
      }

      // Convert tool calls map to array
      const toolCalls = toolCallsMap.size > 0
        ? Array.from(toolCallsMap.values())
        : undefined;

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
        toolCalls,
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

  // ==========================================================================
  // BATCH PROCESSING API
  // ==========================================================================

  /**
   * Upload a file for batch processing
   * @param content - JSONL content as string
   * @param filename - Name for the file
   * @returns File object with id
   */
  async uploadBatchFile(content: string, filename: string = 'batch_input.jsonl'): Promise<OpenAI.Files.FileObject> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      logger.debug(`Uploading batch file: ${filename} (${content.length} bytes)`);

      const file = await this.client!.files.create({
        file: await toFile(Buffer.from(content, 'utf-8'), filename),
        purpose: 'batch',
      });

      logger.info(`Batch file uploaded: ${file.id}`);
      return file;
    } catch (error) {
      this.handleError(error, 'uploadBatchFile');
    }
  }

  /**
   * Create a batch from an array of requests
   * Automatically uploads the JSONL file and creates the batch
   * @param params - Batch creation parameters
   * @returns Batch object
   */
  async createBatch(params: OpenAIBatchCreateParams): Promise<OpenAI.Batches.Batch> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      let inputFileId = params.input_file_id;

      // If requests are provided directly, upload them as a JSONL file
      if (params.requests && params.requests.length > 0) {
        const jsonlContent = params.requests
          .map((req) => JSON.stringify(req))
          .join('\n');

        const file = await this.uploadBatchFile(jsonlContent);
        inputFileId = file.id;
      }

      if (!inputFileId) {
        throw new Error('Either requests array or input_file_id is required');
      }

      logger.info(`Creating batch with file: ${inputFileId}, endpoint: ${params.endpoint}`);

      const batch = await this.client!.batches.create({
        input_file_id: inputFileId,
        endpoint: params.endpoint,
        completion_window: params.completion_window || '24h',
        metadata: params.metadata,
      });

      logger.info(`Batch created: ${batch.id}, status: ${batch.status}`);
      return batch;
    } catch (error) {
      this.handleError(error, 'createBatch');
    }
  }

  /**
   * Get batch status by ID
   * @param batchId - Batch ID
   * @returns Batch object with current status
   */
  async getBatch(batchId: string): Promise<OpenAI.Batches.Batch> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      const batch = await this.client!.batches.retrieve(batchId);
      logger.debug(`Batch ${batchId} status: ${batch.status}`);
      return batch;
    } catch (error) {
      this.handleError(error, 'getBatch');
    }
  }

  /**
   * List all batches with pagination
   * @param options - Pagination options
   * @returns Page of batches
   */
  async listBatches(options?: {
    after?: string;
    limit?: number;
  }): Promise<OpenAI.Batches.BatchesPage> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      const batches = await this.client!.batches.list({
        after: options?.after,
        limit: options?.limit || 20,
      });

      logger.debug(`Listed ${batches.data.length} batches`);
      return batches;
    } catch (error) {
      this.handleError(error, 'listBatches');
    }
  }

  /**
   * Cancel a batch
   * @param batchId - Batch ID to cancel
   * @returns Updated batch object
   */
  async cancelBatch(batchId: string): Promise<OpenAI.Batches.Batch> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      logger.info(`Cancelling batch: ${batchId}`);
      const batch = await this.client!.batches.cancel(batchId);
      logger.info(`Batch ${batchId} cancelled, status: ${batch.status}`);
      return batch;
    } catch (error) {
      this.handleError(error, 'cancelBatch');
    }
  }

  /**
   * Get batch results as a string (JSONL format)
   * @param batchId - Batch ID
   * @returns JSONL string of results, or null if not ready
   */
  async getBatchResults(batchId: string): Promise<string | null> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      const batch = await this.getBatch(batchId);

      if (batch.status !== 'completed') {
        logger.debug(`Batch ${batchId} not completed, status: ${batch.status}`);
        return null;
      }

      if (!batch.output_file_id) {
        logger.warn(`Batch ${batchId} completed but no output file`);
        return null;
      }

      logger.info(`Downloading batch results from file: ${batch.output_file_id}`);
      const content = await this.client!.files.content(batch.output_file_id);
      const text = await content.text();

      logger.debug(`Downloaded ${text.length} bytes of batch results`);
      return text;
    } catch (error) {
      this.handleError(error, 'getBatchResults');
    }
  }

  /**
   * Get batch errors as a string (JSONL format)
   * @param batchId - Batch ID
   * @returns JSONL string of errors, or null if none
   */
  async getBatchErrors(batchId: string): Promise<string | null> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      const batch = await this.getBatch(batchId);

      if (!batch.error_file_id) {
        return null;
      }

      logger.info(`Downloading batch errors from file: ${batch.error_file_id}`);
      const content = await this.client!.files.content(batch.error_file_id);
      const text = await content.text();

      logger.debug(`Downloaded ${text.length} bytes of batch errors`);
      return text;
    } catch (error) {
      this.handleError(error, 'getBatchErrors');
    }
  }

  /**
   * Get file content by ID
   * @param fileId - File ID
   * @returns File content as string
   */
  async getFileContent(fileId: string): Promise<string> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      const content = await this.client!.files.content(fileId);
      return await content.text();
    } catch (error) {
      this.handleError(error, 'getFileContent');
    }
  }

  /**
   * Delete a file by ID
   * @param fileId - File ID to delete
   * @returns Deletion status
   */
  async deleteFile(fileId: string): Promise<OpenAI.Files.FileDeleted> {
    if (!this.isAvailable()) {
      throw new Error(`${this.name} provider is not available`);
    }

    try {
      logger.info(`Deleting file: ${fileId}`);
      const result = await this.client!.files.del(fileId);
      logger.debug(`File ${fileId} deleted: ${result.deleted}`);
      return result;
    } catch (error) {
      this.handleError(error, 'deleteFile');
    }
  }
}

export default OpenAICompatibleProvider;
