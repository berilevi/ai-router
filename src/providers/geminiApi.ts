import {
  GoogleGenerativeAI,
  GenerativeModel,
  Content,
  Part,
} from '@google/generative-ai';
import {
  ChatCompletionOptions,
  ChatCompletionResponse,
  StreamChunk,
  ProviderConfig,
} from '../types';
import { BaseProvider } from './base';
import { logger } from '../utils/logger';

/**
 * Gemini API Provider using Google's official SDK
 */
export class GeminiApiProvider extends BaseProvider {
  private client: GoogleGenerativeAI | null = null;
  private modelInstances: Map<string, GenerativeModel> = new Map();

  constructor(config: ProviderConfig) {
    super(config);
  }

  isAvailable(): boolean {
    return this.config.enabled && !!this.config.apiKey;
  }

  async initialize(): Promise<void> {
    if (!this.config.apiKey) {
      throw new Error('Gemini API key is not configured');
    }

    try {
      logger.info('Initializing Gemini API provider...');
      this.client = new GoogleGenerativeAI(this.config.apiKey);
      logger.info('Gemini API provider initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Gemini API provider:', error);
      throw error;
    }
  }

  private getModel(modelName: string, systemInstruction?: string): GenerativeModel {
    if (!this.client) {
      throw new Error('Gemini API client not initialized');
    }

    // Create a cache key that includes system instruction
    const cacheKey = systemInstruction
      ? `${modelName}:${Buffer.from(systemInstruction).toString('base64').slice(0, 32)}`
      : modelName;

    // Check if we already have this model instance (only cache models without system instruction)
    if (!systemInstruction && this.modelInstances.has(cacheKey)) {
      return this.modelInstances.get(cacheKey)!;
    }

    // Create new model instance
    const modelConfig: { model: string; systemInstruction?: string } = {
      model: modelName,
    };

    if (systemInstruction) {
      modelConfig.systemInstruction = systemInstruction;
    }

    const model = this.client.getGenerativeModel(modelConfig);

    // Only cache models without system instruction
    if (!systemInstruction) {
      this.modelInstances.set(cacheKey, model);
    }

    return model;
  }

  /**
   * Extract system instruction from messages
   */
  private extractSystemInstruction(messages: ChatCompletionOptions['messages'], systemPrompt?: string): string | undefined {
    // Prefer explicit system prompt from options
    if (systemPrompt) {
      return systemPrompt;
    }

    // Look for system messages in the conversation
    const systemMessages = messages.filter(m => m.role === 'system');
    if (systemMessages.length > 0) {
      return systemMessages.map(m => m.content).join('\n\n');
    }

    return undefined;
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    this.validateOptions(options);

    if (!this.isAvailable()) {
      throw new Error('Gemini API provider is not available');
    }

    try {
      // Extract system instruction from messages or options
      const systemInstruction = this.extractSystemInstruction(options.messages, options.system);
      const model = this.getModel(options.model, systemInstruction);

      // Format messages, filtering out system messages (already handled as systemInstruction)
      const contents = this.formatMessages(options.messages.filter(m => m.role !== 'system'));

      // Build generation config
      const generationConfig: {
        temperature?: number;
        topP?: number;
        maxOutputTokens?: number;
        stopSequences?: string[];
      } = {};

      if (options.temperature !== undefined) {
        generationConfig.temperature = options.temperature;
      }
      if (options.topP !== undefined) {
        generationConfig.topP = options.topP;
      }
      if (options.maxTokens !== undefined) {
        generationConfig.maxOutputTokens = options.maxTokens;
      }

      const result = await model.generateContent({
        contents,
        generationConfig,
      });

      const response = await result.response;
      const text = response.text();

      // Extract usage info if available
      const usageMetadata = response.usageMetadata;

      return {
        content: text,
        model: options.model,
        usage: usageMetadata
          ? {
              promptTokens: usageMetadata.promptTokenCount || 0,
              completionTokens: usageMetadata.candidatesTokenCount || 0,
              totalTokens: usageMetadata.totalTokenCount || 0,
            }
          : undefined,
      };
    } catch (error) {
      this.handleError(error, 'chatCompletion');
    }
  }

  async *chatCompletionStream(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    this.validateOptions(options);

    if (!this.isAvailable()) {
      throw new Error('Gemini API provider is not available');
    }

    try {
      // Extract system instruction from messages or options
      const systemInstruction = this.extractSystemInstruction(options.messages, options.system);
      const model = this.getModel(options.model, systemInstruction);

      // Format messages, filtering out system messages (already handled as systemInstruction)
      const contents = this.formatMessages(options.messages.filter(m => m.role !== 'system'));

      // Build generation config
      const generationConfig: {
        temperature?: number;
        topP?: number;
        maxOutputTokens?: number;
        stopSequences?: string[];
      } = {};

      if (options.temperature !== undefined) {
        generationConfig.temperature = options.temperature;
      }
      if (options.topP !== undefined) {
        generationConfig.topP = options.topP;
      }
      if (options.maxTokens !== undefined) {
        generationConfig.maxOutputTokens = options.maxTokens;
      }

      const result = await model.generateContentStream({
        contents,
        generationConfig,
      });

      let promptTokens = 0;
      let completionTokens = 0;

      for await (const chunk of result.stream) {
        const text = chunk.text();
        
        // Track usage from metadata
        if (chunk.usageMetadata) {
          promptTokens = chunk.usageMetadata.promptTokenCount || promptTokens;
          completionTokens = chunk.usageMetadata.candidatesTokenCount || completionTokens;
        }

        if (text) {
          yield {
            content: text,
            done: false,
          };
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

  private formatMessages(messages: ChatCompletionOptions['messages']): Content[] {
    const contents: Content[] = [];

    for (const message of messages) {
      // Skip system messages - they are handled via systemInstruction
      if (message.role === 'system') {
        continue;
      }

      const parts: Part[] = [];

      // Add text content
      if (message.content) {
        parts.push({ text: message.content });
      }

      // Add images if present
      if (message.images && message.images.length > 0) {
        for (const image of message.images) {
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: image.toString('base64'),
            },
          });
        }
      }

      // Map roles - system messages already filtered out
      const role: 'user' | 'model' = message.role === 'assistant' ? 'model' : 'user';

      contents.push({
        role,
        parts,
      });
    }

    return contents;
  }

  async generateEmbeddings(input: string | string[]): Promise<number[][]> {
    if (!this.isAvailable()) {
      throw new Error('Gemini API provider is not available');
    }

    try {
      const model = this.client!.getGenerativeModel({
        model: 'embedding-001',
      });

      const inputs = Array.isArray(input) ? input : [input];
      const embeddings: number[][] = [];

      for (const text of inputs) {
        const result = await model.embedContent(text);
        embeddings.push(result.embedding.values);
      }

      return embeddings;
    } catch (error) {
      this.handleError(error, 'generateEmbeddings');
    }
  }

  async listModels(): Promise<string[]> {
    // Return configured models
    return this.config.models;
  }
}

export default GeminiApiProvider;
