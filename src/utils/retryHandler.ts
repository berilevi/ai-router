import { ProviderType, ProviderError, ChatCompletionOptions, ChatCompletionResponse, StreamChunk } from '../types';
import { ProviderFactory } from '../providers';
import { routeModel, getFallbackProviders } from './modelRouter';
import { providerConfigs } from './config';
import { logger } from './logger';

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableStatuses: number[];
  retryableErrors: string[];
}

interface RetryContext {
  attempt: number;
  provider: ProviderType;
  model: string;
  startTime: number;
  errors: Error[];
}

interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  providersTried: ProviderType[];
  totalDuration: number;
}

/**
 * Default retry configuration
 */
const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: [
    'timeout',
    'rate limit',
    'too many requests',
    'network error',
    'connection refused',
    'econnreset',
    'etimedout',
    'econnrefused',
    'socket hang up',
    'temporary',
    'unavailable',
    'overload',
  ],
};

/**
 * Retry Handler with fallback provider support
 */
export class RetryHandler {
  private config: RetryConfig;

  constructor(config: Partial<RetryConfig> = {}) {
    this.config = { ...defaultRetryConfig, ...config };
  }

  /**
   * Execute with retry logic and fallback providers
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: {
      provider: ProviderType;
      model: string;
      onRetry?: (context: RetryContext, delay: number) => void;
      onFallback?: (fromProvider: ProviderType, toProvider: ProviderType) => void;
      createFallbackOperation?: (fallbackProvider: ProviderType, fallbackModel: string) => (() => Promise<T>) | null;
    }
  ): Promise<RetryResult<T>> {
    const startTime = Date.now();
    const context: RetryContext = {
      attempt: 0,
      provider: options.provider,
      model: options.model,
      startTime,
      errors: [],
    };

    const providersTried: ProviderType[] = [];
    let currentProvider = options.provider;

    // Try primary provider with retries
    while (context.attempt < this.config.maxRetries) {
      context.attempt++;
      providersTried.push(currentProvider);

      try {
        logger.debug(`Attempt ${context.attempt}/${this.config.maxRetries} with ${currentProvider}`);
        const result = await operation();
        
        return {
          success: true,
          result,
          attempts: context.attempt,
          providersTried,
          totalDuration: Date.now() - startTime,
        };
      } catch (error) {
        const err = error as Error;
        context.errors.push(err);

        // Check if we should retry
        if (!this.shouldRetry(err) || context.attempt >= this.config.maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = this.calculateDelay(context.attempt);
        
        logger.warn(`Attempt ${context.attempt} failed: ${err.message}. Retrying in ${delay}ms...`);
        
        if (options.onRetry) {
          options.onRetry(context, delay);
        }

        await this.sleep(delay);
      }
    }

    // Try fallback providers (only if createFallbackOperation is provided)
    if (options.createFallbackOperation) {
      const fallbackProviders = getFallbackProviders(currentProvider);

      for (const fallbackConfig of fallbackProviders) {
        const fallbackProvider = fallbackConfig.type;

        if (providersTried.includes(fallbackProvider)) {
          continue;
        }

        // Get the fallback model
        const fallbackModel = this.mapModelToProvider(options.model, fallbackProvider);

        logger.info(`Trying fallback provider: ${fallbackConfig.name} with model ${fallbackModel}`);

        if (options.onFallback) {
          options.onFallback(currentProvider, fallbackProvider);
        }

        try {
          const fallbackOperation = options.createFallbackOperation(fallbackProvider, fallbackModel);

          if (fallbackOperation) {
            const result = await fallbackOperation();
            providersTried.push(fallbackProvider);

            return {
              success: true,
              result,
              attempts: context.attempt + 1,
              providersTried,
              totalDuration: Date.now() - startTime,
            };
          }
        } catch (fallbackError) {
          logger.warn(`Fallback provider ${fallbackConfig.name} failed:`, fallbackError);
          providersTried.push(fallbackProvider);
        }
      }
    }

    // All retries and fallbacks exhausted
    const lastError = context.errors[context.errors.length - 1];
    
    return {
      success: false,
      error: lastError,
      attempts: context.attempt,
      providersTried,
      totalDuration: Date.now() - startTime,
    };
  }

  /**
   * Execute chat completion with retry and fallback
   */
  async executeChatCompletion(
    options: ChatCompletionOptions & { provider: ProviderType }
  ): Promise<RetryResult<ChatCompletionResponse>> {
    const { provider, ...completionOptions } = options;

    const providerInstance = ProviderFactory.getProvider(provider);
    if (!providerInstance) {
      return {
        success: false,
        error: new Error(`Provider ${provider} not found`),
        attempts: 0,
        providersTried: [],
        totalDuration: 0,
      };
    }

    return this.executeWithRetry(
      () => providerInstance.chatCompletion(completionOptions),
      {
        provider,
        model: options.model,
        createFallbackOperation: (fallbackProvider: ProviderType, fallbackModel: string) => {
          const fallbackInstance = ProviderFactory.getProvider(fallbackProvider);
          if (!fallbackInstance || !fallbackInstance.isAvailable()) {
            return null;
          }

          return () => fallbackInstance.chatCompletion({
            ...completionOptions,
            model: fallbackModel,
          });
        },
      }
    );
  }

  /**
   * Execute streaming chat completion with retry
   */
  async *executeStreamingChatCompletion(
    options: ChatCompletionOptions & { provider: ProviderType }
  ): AsyncGenerator<StreamChunk> {
    const { provider, ...completionOptions } = options;

    const result = await this.executeWithRetry<AsyncGenerator<StreamChunk>>(
      async () => {
        const providerInstance = ProviderFactory.getProvider(provider);
        if (!providerInstance) {
          throw new Error(`Provider ${provider} not found`);
        }
        return providerInstance.chatCompletionStream(completionOptions);
      },
      {
        provider,
        model: options.model,
        createFallbackOperation: (fallbackProvider: ProviderType, fallbackModel: string) => {
          const fallbackInstance = ProviderFactory.getProvider(fallbackProvider);
          if (!fallbackInstance || !fallbackInstance.isAvailable()) {
            return null;
          }

          return async () => fallbackInstance.chatCompletionStream({
            ...completionOptions,
            model: fallbackModel,
          });
        },
      }
    );

    if (!result.success || !result.result) {
      throw result.error || new Error('All retries and fallbacks failed');
    }

    yield* result.result;
  }

  /**
   * Map a model name to a different provider's equivalent
   */
  private mapModelToProvider(model: string, targetProvider: ProviderType): string {
    // Try to find equivalent model in target provider
    const targetRoute = routeModel(model);
    if (targetRoute && targetRoute.provider === targetProvider) {
      return targetRoute.providerModel;
    }

    // Check if the target provider has a default model configured
    const targetConfig = providerConfigs.find(p => p.type === targetProvider);
    if (targetConfig) {
      return targetConfig.defaultModel;
    }

    // Use provider's default model via instance
    const provider = ProviderFactory.getProvider(targetProvider);
    if (provider) {
      const info = provider.getInfo();
      return info.models[0] || 'default';
    }

    return model;
  }

  /**
   * Check if an error should be retried
   */
  private shouldRetry(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();

    // Check against retryable error messages
    for (const retryableError of this.config.retryableErrors) {
      if (errorMessage.includes(retryableError.toLowerCase())) {
        return true;
      }
    }

    // Check for ProviderError with status code
    if (error instanceof ProviderError && error.statusCode) {
      return this.config.retryableStatuses.includes(error.statusCode);
    }

    // Check for specific error types
    if (error.name === 'TimeoutError' || 
        error.name === 'NetworkError' ||
        error.name === 'ConnectionError') {
      return true;
    }

    return false;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff
    const exponentialDelay = this.config.baseDelay * 
      Math.pow(this.config.backoffMultiplier, attempt - 1);
    
    // Add jitter (±25%)
    const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
    
    // Cap at max delay
    return Math.min(
      Math.floor(exponentialDelay + jitter),
      this.config.maxDelay
    );
  }

  /**
   * Sleep for a duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get retry configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Update retry configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// Singleton instance
export const retryHandler = new RetryHandler();

export default retryHandler;
