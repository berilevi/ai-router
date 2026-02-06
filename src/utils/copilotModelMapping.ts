/**
 * Copilot-specific model mappings and dynamic model discovery
 * Extends the main config.ts with Copilot provider configuration
 */

import { ModelMapping } from '../types';

// Copilot environment configuration
export const copilotConfig = {
  enabled: process.env.COPILOT_ENABLED === 'true',
  defaultModel: process.env.COPILOT_DEFAULT_MODEL || 'gpt-4.1',
  sessionTTL: parseInt(process.env.COPILOT_SESSION_TTL || '1800000', 10), // 30 minutes
  logRequests: process.env.COPILOT_LOG_REQUESTS === 'true',
  logResponses: process.env.COPILOT_LOG_RESPONSES === 'true',
  logDir: process.env.COPILOT_LOG_DIR || './logs/copilot',
  // GitHub authentication (priority order: explicit token > GH_TOKEN > gh CLI)
  githubToken: process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN,
};

// Copilot model mappings
// These models route to GitHub Copilot as the backend provider
export const copilotModelMappings: ModelMapping[] = [
  // GPT-5 (Copilot's latest)
  {
    ollamaModel: 'gpt5',
    provider: 'copilot',
    providerModel: 'gpt5',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  // GPT-4.1 (Copilot's current default)
  {
    ollamaModel: 'gpt-4.1',
    provider: 'copilot',
    providerModel: 'gpt-4.1',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 128000,
  },
  // Opus alias (routes to Copilot's Opus-equivalent model)
  {
    ollamaModel: 'opus',
    provider: 'copilot',
    providerModel: 'opus',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  // Sonnet alias
  {
    ollamaModel: 'sonnet',
    provider: 'copilot',
    providerModel: 'sonnet',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  // Haiku alias
  {
    ollamaModel: 'haiku',
    provider: 'copilot',
    providerModel: 'haiku',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 200000,
  },
  // o1 and o3 models (reasoning models)
  {
    ollamaModel: 'o1',
    provider: 'copilot',
    providerModel: 'o1',
    supportsImages: false,
    supportsTools: false,
    contextWindow: 128000,
  },
  {
    ollamaModel: 'o3',
    provider: 'copilot',
    providerModel: 'o3',
    supportsImages: false,
    supportsTools: false,
    contextWindow: 128000,
  },
  {
    ollamaModel: 'o3-mini',
    provider: 'copilot',
    providerModel: 'o3-mini',
    supportsImages: false,
    supportsTools: false,
    contextWindow: 128000,
  },
];

// Model alias mappings for convenience
// These allow users to use short names that map to specific Copilot models
export const modelAliases: Record<string, string> = {
  'claude-opus': 'opus',
  'claude-sonnet': 'sonnet',
  'claude-haiku': 'haiku',
  'gpt-5': 'gpt5',
  'gpt5-latest': 'gpt5',
  'gpt4.1': 'gpt-4.1',
  'gpt-4.1-turbo': 'gpt-4.1',
};

/**
 * Resolve a model alias to its canonical Copilot model name
 */
export function resolveModelAlias(model: string): string {
  return modelAliases[model] || model;
}

/**
 * Check if a model should be routed to Copilot
 */
export function isCopilotModel(model: string): boolean {
  const resolved = resolveModelAlias(model);
  return copilotModelMappings.some(m => m.ollamaModel === resolved || m.providerModel === resolved);
}

/**
 * Get Copilot model mapping by model name
 */
export function getCopilotModelMapping(model: string): ModelMapping | undefined {
  const resolved = resolveModelAlias(model);
  return copilotModelMappings.find(
    m => m.ollamaModel === resolved || m.providerModel === resolved
  );
}

/**
 * Get all Copilot model names (for listing)
 */
export function getCopilotModelNames(): string[] {
  return copilotModelMappings.map(m => m.ollamaModel);
}

export default copilotConfig;
