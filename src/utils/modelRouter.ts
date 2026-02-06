import { ProviderType, ModelMapping, ProviderConfig, ChatCompletionOptions } from '../types';
import { providerConfigs, modelMappings, getProviderConfig } from './config';
import { isCopilotModel, resolveModelAlias, getCopilotModelMapping } from './copilotModelMapping';
import { logger } from './logger';

interface RouteResult {
  provider: ProviderType;
  providerModel: string;
  config: ProviderConfig;
  mapping?: ModelMapping;
}

/**
 * Route a model request to the appropriate provider
 */
export function routeModel(model: string): RouteResult | null {
  // First, try to find an exact match in model mappings
  const mapping = modelMappings.find((m) => m.ollamaModel === model);
  
  if (mapping) {
    const config = getProviderConfig(mapping.provider);
    if (config && config.enabled) {
      logger.debug(`Routed model "${model}" to ${config.name} (${mapping.providerModel})`);
      return {
        provider: mapping.provider,
        providerModel: mapping.providerModel,
        config,
        mapping,
      };
    }
  }
  
  // If no mapping found, check if the model matches any provider's model directly
  for (const provider of providerConfigs) {
    if (!provider.enabled) continue;
    
    if (provider.models.includes(model)) {
      logger.debug(`Routed model "${model}" to ${provider.name} (direct match)`);
      return {
        provider: provider.type,
        providerModel: model,
        config: provider,
      };
    }
  }
  
  // If still no match, try to use the model name as a provider hint
  // e.g., "gemini-xxx" -> gemini-api provider
  if (model.startsWith('gemini-')) {
    const geminiConfig = getProviderConfig('gemini-api');
    if (geminiConfig?.enabled) {
      logger.debug(`Routed model "${model}" to ${geminiConfig.name} (prefix match)`);
      return {
        provider: 'gemini-api',
        providerModel: model,
        config: geminiConfig,
      };
    }
    
    // Fallback to gemini-web
    const geminiWebConfig = getProviderConfig('gemini-web');
    if (geminiWebConfig?.enabled) {
      logger.debug(`Routed model "${model}" to ${geminiWebConfig.name} (prefix fallback)`);
      return {
        provider: 'gemini-web',
        providerModel: 'gemini-pro',
        config: geminiWebConfig,
      };
    }
  }

  // Check for Copilot-specific models (gpt5, opus, sonnet, etc.)
  // This should come before general gpt-* routing to ensure these route to Copilot
  const resolvedModel = resolveModelAlias(model);
  if (isCopilotModel(resolvedModel)) {
    const copilotConfig = getProviderConfig('copilot');
    if (copilotConfig?.enabled) {
      const copilotMapping = getCopilotModelMapping(resolvedModel);
      logger.debug(`Routed model "${model}" to ${copilotConfig.name} (Copilot model)`);
      return {
        provider: 'copilot',
        providerModel: copilotMapping?.providerModel || resolvedModel,
        config: copilotConfig,
        mapping: copilotMapping,
      };
    }
  }

  if (model.startsWith('gpt-') || model.startsWith('chatgpt')) {
    const openaiConfig = getProviderConfig('openai');
    if (openaiConfig?.enabled) {
      logger.debug(`Routed model "${model}" to ${openaiConfig.name} (prefix match)`);
      return {
        provider: 'openai',
        providerModel: model,
        config: openaiConfig,
      };
    }
  }
  
  if (model.startsWith('claude')) {
    const anthropicConfig = getProviderConfig('anthropic');
    if (anthropicConfig?.enabled) {
      logger.debug(`Routed model "${model}" to ${anthropicConfig.name} (prefix match)`);
      return {
        provider: 'anthropic',
        providerModel: model,
        config: anthropicConfig,
      };
    }
  }
  
  // Final fallback: use the highest priority enabled provider
  const enabledProviders = providerConfigs
    .filter((p) => p.enabled)
    .sort((a, b) => a.priority - b.priority);
  
  if (enabledProviders.length > 0) {
    const fallbackProvider = enabledProviders[0];
    logger.warn(`No specific route for model "${model}", using fallback: ${fallbackProvider.name}`);
    return {
      provider: fallbackProvider.type,
      providerModel: fallbackProvider.defaultModel,
      config: fallbackProvider,
    };
  }
  
  logger.error(`No provider available for model: ${model}`);
  return null;
}

/**
 * Get all available models with their provider info
 */
export function getAvailableModelsWithInfo(): Array<{
  ollamaModel: string;
  provider: string;
  providerModel: string;
  enabled: boolean;
}> {
  const enabledProviders = new Set(
    providerConfigs.filter((p) => p.enabled).map((p) => p.type)
  );
  
  return modelMappings.map((mapping) => ({
    ollamaModel: mapping.ollamaModel,
    provider: mapping.provider,
    providerModel: mapping.providerModel,
    enabled: enabledProviders.has(mapping.provider),
  }));
}

/**
 * Get provider by priority order
 */
export function getProvidersByPriority(): ProviderConfig[] {
  return providerConfigs
    .filter((p) => p.enabled)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Check if a model is available
 */
export function isModelAvailable(model: string): boolean {
  return routeModel(model) !== null;
}

/**
 * Get fallback providers for a model (for retry logic)
 */
export function getFallbackProviders(primaryProvider: ProviderType): ProviderConfig[] {
  return providerConfigs
    .filter((p) => p.enabled && p.type !== primaryProvider)
    .sort((a, b) => a.priority - b.priority);
}

/**
 * Get model capabilities
 */
export function getModelCapabilities(model: string): {
  supportsImages: boolean;
  supportsTools: boolean;
  contextWindow: number;
} | null {
  const mapping = modelMappings.find((m) => m.ollamaModel === model);
  
  if (mapping) {
    return {
      supportsImages: mapping.supportsImages,
      supportsTools: mapping.supportsTools,
      contextWindow: mapping.contextWindow,
    };
  }
  
  // Default capabilities for unknown models
  const route = routeModel(model);
  if (route?.config) {
    return {
      supportsImages: true,
      supportsTools: true,
      contextWindow: 128000,
    };
  }
  
  return null;
}

/**
 * Validate model options against capabilities
 */
export function validateOptions(
  model: string,
  options: ChatCompletionOptions
): { valid: boolean; error?: string } {
  const capabilities = getModelCapabilities(model);
  
  if (!capabilities) {
    return { valid: false, error: `Unknown model: ${model}` };
  }
  
  // Check image support
  const hasImages = options.messages.some(
    (m) => m.images && m.images.length > 0
  );
  
  if (hasImages && !capabilities.supportsImages) {
    return {
      valid: false,
      error: `Model "${model}" does not support images`,
    };
  }
  
  // Check tool support
  if (options.tools && options.tools.length > 0 && !capabilities.supportsTools) {
    return {
      valid: false,
      error: `Model "${model}" does not support tools`,
    };
  }
  
  return { valid: true };
}
