import dotenv from 'dotenv';
import { ServerConfig, ProviderConfig, ModelMapping, ProviderType } from '../types';
import { logger } from './logger';
import { copilotConfig, copilotModelMappings } from './copilotModelMapping';
import type { CacheConfig } from './cache';

// Load environment variables
dotenv.config();

// Server configuration
export const serverConfig: ServerConfig = {
  port: parseInt(process.env.PORT || '11434', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '300000', 10),
  streamChunkSize: parseInt(process.env.STREAM_CHUNK_SIZE || '1024', 10),
  streamDelayMs: parseInt(process.env.STREAM_DELAY_MS || '10', 10),
};

// Cache configuration
export const cacheConfig: CacheConfig = {
  enabled: process.env.CACHE_ENABLED !== 'false',
  ttlMs: parseInt(process.env.CACHE_TTL_MS || '3600000', 10), // 1 hour
  maxSizeBytes: parseInt(process.env.CACHE_MAX_SIZE_BYTES || String(100 * 1024 * 1024), 10), // 100MB
  maxEntries: parseInt(process.env.CACHE_MAX_ENTRIES || '1000', 10),
  strategy: (process.env.CACHE_STRATEGY as 'lru' | 'fifo') || 'lru',
};

// Provider configurations
export const providerConfigs: ProviderConfig[] = [
  // Copilot provider (highest priority when enabled)
  {
    type: 'copilot',
    name: 'GitHub Copilot',
    enabled: copilotConfig.enabled,
    defaultModel: copilotConfig.defaultModel,
    priority: 0,  // Highest priority
    models: ['gpt5', 'gpt-4.1', 'opus', 'sonnet', 'haiku', 'o1', 'o3', 'o3-mini'],
  },
  {
    type: 'gemini-web',
    name: 'Gemini Web (Puppeteer)',
    enabled: process.env.GEMINI_WEB_ENABLED === 'true',
    defaultModel: 'gemini-pro',
    priority: 1,
    models: ['gemini-pro', 'gemini-ultra', 'gemini-1.5-pro'],
  },
  {
    type: 'gemini-api',
    name: 'Gemini API',
    apiKey: process.env.GEMINI_API_KEY,
    baseUrl: 'https://generativelanguage.googleapis.com',
    enabled: !!process.env.GEMINI_API_KEY,
    defaultModel: process.env.GEMINI_DEFAULT_MODEL || 'gemini-1.5-flash-latest',
    priority: 2,
    models: [
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash-8b-latest',
      'gemini-1.5-pro-latest',
      'gemini-1.0-pro',
      'gemini-pro',
      'gemini-pro-vision',
    ],
  },
  {
    type: 'openai',
    name: 'OpenAI',
    apiKey: process.env.OPENAI_API_KEY,
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    enabled: !!process.env.OPENAI_API_KEY,
    defaultModel: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini',
    priority: 3,
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo',
    ],
  },
  {
    type: 'anthropic',
    name: 'Anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    // baseUrl is optional for native Anthropic SDK (defaults to https://api.anthropic.com)
    baseUrl: process.env.ANTHROPIC_BASE_URL,
    enabled: !!process.env.ANTHROPIC_API_KEY,
    defaultModel: process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-sonnet-4-5-20250929',
    priority: 4,
    models: [
      'claude-sonnet-4-5-20250929',
      'claude-haiku-4.5',
      'claude-sonnet-4-5-20250929',
      'claude-opus-4-5-20250604',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
    ],
  },
];

// Model mappings from Ollama model names to provider models
export const modelMappings: ModelMapping[] = [
  // Copilot models (added from copilotModelMappings)
  ...copilotModelMappings,
  // Gemini Web models
  {
    ollamaModel: 'gemini',
    provider: 'gemini-web',
    providerModel: 'gemini-pro',
    supportsImages: true,
    supportsTools: false,
    contextWindow: 1000000,
  },
  {
    ollamaModel: 'gemini-pro',
    provider: 'gemini-web',
    providerModel: 'gemini-pro',
    supportsImages: true,
    supportsTools: false,
    contextWindow: 1000000,
  },
  {
    ollamaModel: 'gemini-ultra',
    provider: 'gemini-web',
    providerModel: 'gemini-ultra',
    supportsImages: true,
    supportsTools: false,
    contextWindow: 1000000,
  },
  // Gemini API models
  {
    ollamaModel: 'gemini-flash',
    provider: 'gemini-api',
    providerModel: 'gemini-1.5-flash-latest',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 1000000,
  },
  {
    ollamaModel: 'gemini-1.5-flash',
    provider: 'gemini-api',
    providerModel: 'gemini-1.5-flash-latest',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 1000000,
  },
  {
    ollamaModel: 'gemini-1.5-pro',
    provider: 'gemini-api',
    providerModel: 'gemini-1.5-pro-latest',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 2000000,
  },
  // OpenAI models
  {
    ollamaModel: 'gpt-4o',
    provider: 'openai',
    providerModel: 'gpt-4o',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  {
    ollamaModel: 'gpt-4o-mini',
    provider: 'openai',
    providerModel: 'gpt-4o-mini',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  {
    ollamaModel: 'gpt-4',
    provider: 'openai',
    providerModel: 'gpt-4-turbo',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  {
    ollamaModel: 'gpt-3.5-turbo',
    provider: 'openai',
    providerModel: 'gpt-3.5-turbo',
    supportsImages: false,
    supportsTools: true,
    contextWindow: 16385,
  },
  // Anthropic models - Claude 4.5 (latest)
  {
    ollamaModel: 'claude',
    provider: 'anthropic',
    providerModel: 'claude-sonnet-4-5-20250929',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  {
    ollamaModel: 'claude-sonnet',
    provider: 'anthropic',
    providerModel: 'claude-sonnet-4-5-20250929',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  {
    ollamaModel: 'claude-haiku',
    provider: 'anthropic',
    providerModel: 'claude-haiku-4.5',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  {
    ollamaModel: 'claude-opus',
    provider: 'anthropic',
    providerModel: 'claude-opus-4-5-20250604',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  {
    ollamaModel: 'claude-haiku',
    provider: 'anthropic',
    providerModel: 'claude-haiku-4.5',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 200000,
  },
];

// Gemini Web configuration
export const geminiWebConfig = {
  email: process.env.GOOGLE_EMAIL,
  password: process.env.GOOGLE_PASSWORD,
  chromeExecutablePath: process.env.CHROME_EXECUTABLE_PATH,
  headless: process.env.PUPPETEER_HEADLESS !== 'false',
  timeout: parseInt(process.env.REQUEST_TIMEOUT || '300000', 10),
};

// Anthropic provider configuration
// Note: Now uses native Anthropic SDK exclusively for better compatibility
export const anthropicConfig = {
  // Always use native Anthropic SDK (OpenAI-compatible mode removed)
  providerMode: 'native' as const,
};

// Get provider config by type
export function getProviderConfig(type: ProviderType): ProviderConfig | undefined {
  return providerConfigs.find((p) => p.type === type);
}

// Get model mapping by Ollama model name
export function getModelMapping(ollamaModel: string): ModelMapping | undefined {
  return modelMappings.find((m) => m.ollamaModel === ollamaModel);
}

// Get all available models
export function getAvailableModels(): string[] {
  const enabledProviders = providerConfigs.filter((p) => p.enabled).map((p) => p.type);
  return modelMappings
    .filter((m) => enabledProviders.includes(m.provider))
    .map((m) => m.ollamaModel);
}

// Validate configuration
export function validateConfig(): boolean {
  const enabledProviders = providerConfigs.filter((p) => p.enabled);
  
  if (enabledProviders.length === 0) {
    logger.error('No providers are enabled. Please configure at least one provider in .env');
    return false;
  }
  
  logger.info(`Enabled providers: ${enabledProviders.map((p) => p.name).join(', ')}`);
  logger.info(`Available models: ${getAvailableModels().join(', ')}`);
  
  return true;
}

export default {
  server: serverConfig,
  providers: providerConfigs,
  modelMappings,
  geminiWeb: geminiWebConfig,
  anthropic: anthropicConfig,
};
