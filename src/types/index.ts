/**
 * Type definitions for Ollama-compatible API
 */

// Ollama API Types
export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  system?: string;
  template?: string;
  context?: number[];
  stream?: boolean;
  raw?: boolean;
  format?: 'json';
  options?: OllamaOptions;
  images?: string[];
}

export interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  format?: 'json';
  options?: OllamaOptions;
  tools?: OllamaTool[];
}

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
  tool_calls?: OllamaToolCall[];
}

export interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface OllamaOptions {
  temperature?: number;
  top_p?: number;
  top_k?: number;
  seed?: number;
  num_predict?: number;
  stop?: string[];
  [key: string]: unknown;
}

export interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  context?: number[];
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaModelResponse {
  models: OllamaModel[];
}

export interface OllamaPullRequest {
  name: string;
  insecure?: boolean;
  stream?: boolean;
}

export interface OllamaDeleteRequest {
  name: string;
}

export interface OllamaEmbedRequest {
  model: string;
  input: string | string[];
  truncate?: boolean;
  options?: OllamaOptions;
  keep_alive?: string;
}

export interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
}

// Provider Types
export type ProviderType = 'gemini-web' | 'gemini-api' | 'openai' | 'anthropic' | 'copilot' | 'custom';

export interface ProviderConfig {
  type: ProviderType;
  name: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel: string;
  enabled: boolean;
  priority: number;
  models: string[];
}

export interface ModelMapping {
  ollamaModel: string;
  provider: ProviderType;
  providerModel: string;
  supportsImages: boolean;
  supportsTools: boolean;
  contextWindow: number;
}

// Internal Types
export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: Buffer[];
}

export interface ChatCompletionOptions {
  model: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stream?: boolean;
  system?: string;
  tools?: unknown[];
  stopSequences?: string[];
  // Anthropic-specific: Enable prompt caching
  enableCache?: boolean;
  // Anthropic-specific: Cache breakpoints (message indices to cache)
  cacheBreakpoints?: number[];
}

export interface ChatCompletionResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    // Anthropic caching metrics
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
  toolCalls?: unknown[];
}

export interface StreamChunk {
  content: string;
  done: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    // Anthropic caching metrics
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  };
}

export interface GeminiWebConfig {
  email?: string;
  password?: string;
  chromeExecutablePath?: string;
  headless: boolean;
  timeout: number;
}

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  requestTimeout: number;
  streamChunkSize: number;
  streamDelayMs: number;
}

// Error Types
export class ProviderError extends Error {
  constructor(
    message: string,
    public provider: ProviderType,
    public statusCode?: number,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}

export class ModelNotFoundError extends Error {
  constructor(model: string) {
    super(`Model "${model}" not found`);
    this.name = 'ModelNotFoundError';
  }
}

export class ProviderNotAvailableError extends Error {
  constructor(provider: string) {
    super(`Provider "${provider}" is not available`);
    this.name = 'ProviderNotAvailableError';
  }
}

// Re-export Anthropic types
export * from './anthropic';
