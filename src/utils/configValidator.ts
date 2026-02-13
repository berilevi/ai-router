import { z } from 'zod';
import { logger } from './logger';

// Server configuration schema
const serverConfigSchema = z.object({
  PORT: z.string()
    .transform((val: string) => parseInt(val, 10))
    .pipe(z.number().min(1).max(65535))
    .default('11434'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  RATE_LIMIT_WINDOW_MS: z.string()
    .transform((val: string) => parseInt(val, 10))
    .pipe(z.number().min(1000))
    .default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string()
    .transform((val: string) => parseInt(val, 10))
    .pipe(z.number().min(1))
    .default('100'),
  REQUEST_TIMEOUT: z.string()
    .transform((val: string) => parseInt(val, 10))
    .pipe(z.number().min(1000))
    .default('300000'),
  STREAM_CHUNK_SIZE: z.string()
    .transform((val: string) => parseInt(val, 10))
    .pipe(z.number().min(1))
    .default('1024'),
  STREAM_DELAY_MS: z.string()
    .transform((val: string) => parseInt(val, 10))
    .pipe(z.number().min(0))
    .default('10'),
});

// Gemini Web configuration schema
const geminiWebConfigSchema = z.object({
  GEMINI_WEB_ENABLED: z.enum(['true', 'false']).default('false'),
  GOOGLE_EMAIL: z.string().email().optional().or(z.literal('')),
  GOOGLE_PASSWORD: z.string().min(1).optional().or(z.literal('')),
  CHROME_EXECUTABLE_PATH: z.string().min(1).optional().or(z.literal('')),
  PUPPETEER_HEADLESS: z.enum(['true', 'false']).default('true'),
});

// Gemini API configuration schema
const geminiApiConfigSchema = z.object({
  GEMINI_API_KEY: z.string().min(10).optional().or(z.literal('')),
  GEMINI_DEFAULT_MODEL: z.string().min(1).default('gemini-1.5-flash-latest'),
});

// OpenAI configuration schema
const openaiConfigSchema = z.object({
  OPENAI_API_KEY: z.string().startsWith('sk-').optional().or(z.literal('')),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_DEFAULT_MODEL: z.string().min(1).default('gpt-4o-mini'),
});

// Anthropic configuration schema
const anthropicConfigSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(10).optional().or(z.literal('')),
  ANTHROPIC_BASE_URL: z.string().url().default('https://api.anthropic.com/v1'),
  ANTHROPIC_DEFAULT_MODEL: z.string().min(1).default('claude-sonnet-4-5-20250929'),
});

// Combined environment schema
const envSchema = z.object({
  ...serverConfigSchema.shape,
  ...geminiWebConfigSchema.shape,
  ...geminiApiConfigSchema.shape,
  ...openaiConfigSchema.shape,
  ...anthropicConfigSchema.shape,
});

// Validation result type
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  config?: z.infer<typeof envSchema>;
}

// Provider validation result
interface ProviderValidation {
  name: string;
  enabled: boolean;
  configured: boolean;
  canInitialize: boolean;
  missingFields: string[];
}

/**
 * Configuration Validator
 * Validates environment variables and provides helpful error messages
 */
export class ConfigValidator {
  private env: Record<string, string | undefined>;

  constructor(env: Record<string, string | undefined> = process.env) {
    this.env = env;
  }

  /**
   * Validate all configuration
   */
  validate(): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const config = envSchema.parse(this.env);

      // Validate provider configurations
      const providers = this.validateProviders(config);
      
      // Check if at least one provider is enabled
      const enabledProviders = providers.filter((p) => p.enabled && p.canInitialize);
      if (enabledProviders.length === 0) {
        errors.push(
          'No providers are properly configured. Please configure at least one provider:\n' +
          '  - Set GEMINI_API_KEY for Gemini API\n' +
          '  - Set OPENAI_API_KEY for OpenAI\n' +
          '  - Set GEMINI_WEB_ENABLED=true and GOOGLE_EMAIL/GOOGLE_PASSWORD for Gemini Web'
        );
      }

      // Log provider status
      for (const provider of providers) {
        if (provider.enabled && provider.canInitialize) {
          logger.info(`✓ ${provider.name} is configured and ready`);
        } else if (provider.enabled && !provider.canInitialize) {
          warnings.push(
            `${provider.name} is enabled but missing configuration: ${provider.missingFields.join(', ')}`
          );
        }
      }

      // Validate specific configurations
      this.validateSpecificConfig(config, errors, warnings);

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        config,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const issue of error.issues) {
          errors.push(`${issue.path.join('.')}: ${issue.message}`);
        }
      } else {
        errors.push(`Unexpected error: ${(error as Error).message}`);
      }

      return {
        valid: false,
        errors,
        warnings,
      };
    }
  }

  /**
   * Validate individual provider configurations
   */
  private validateProviders(config: z.infer<typeof envSchema>): ProviderValidation[] {
    const providers: ProviderValidation[] = [];

    // Gemini Web
    const geminiWebEnabled = config.GEMINI_WEB_ENABLED === 'true';
    const geminiWebMissing: string[] = [];
    
    if (geminiWebEnabled && !config.GOOGLE_EMAIL) {
      geminiWebMissing.push('GOOGLE_EMAIL (or login manually)');
    }
    if (geminiWebEnabled && !config.GOOGLE_PASSWORD) {
      geminiWebMissing.push('GOOGLE_PASSWORD (or login manually)');
    }

    providers.push({
      name: 'Gemini Web (Puppeteer)',
      enabled: geminiWebEnabled,
      configured: geminiWebEnabled,
      canInitialize: geminiWebEnabled, // Can still work with manual login
      missingFields: geminiWebMissing,
    });

    // Gemini API
    const geminiApiEnabled = !!config.GEMINI_API_KEY;
    providers.push({
      name: 'Gemini API',
      enabled: geminiApiEnabled,
      configured: geminiApiEnabled,
      canInitialize: geminiApiEnabled,
      missingFields: geminiApiEnabled ? [] : ['GEMINI_API_KEY'],
    });

    // OpenAI
    const openaiEnabled = !!config.OPENAI_API_KEY;
    providers.push({
      name: 'OpenAI',
      enabled: openaiEnabled,
      configured: openaiEnabled,
      canInitialize: openaiEnabled,
      missingFields: openaiEnabled ? [] : ['OPENAI_API_KEY'],
    });

    // Anthropic
    const anthropicEnabled = !!config.ANTHROPIC_API_KEY;

    providers.push({
      name: 'Anthropic',
      enabled: anthropicEnabled,
      configured: anthropicEnabled,
      canInitialize: anthropicEnabled,
      missingFields: anthropicEnabled ? [] : ['ANTHROPIC_API_KEY'],
    });

    return providers;
  }

  /**
   * Validate specific configuration combinations
   */
  private validateSpecificConfig(
    config: z.infer<typeof envSchema>,
    errors: string[],
    warnings: string[]
  ): void {
    // Check for insecure configurations
    if (config.NODE_ENV === 'production') {
      if (config.GOOGLE_PASSWORD && config.GOOGLE_PASSWORD.length < 8) {
        warnings.push('Production: GOOGLE_PASSWORD seems too short');
      }
      
      if (config.LOG_LEVEL === 'debug') {
        warnings.push('Production: LOG_LEVEL is set to debug (may expose sensitive data)');
      }
    }

    // Check rate limiting configuration
    const requestsPerSecond = config.RATE_LIMIT_MAX_REQUESTS / (config.RATE_LIMIT_WINDOW_MS / 1000);
    if (requestsPerSecond > 10) {
      warnings.push(
        `Rate limit allows ${requestsPerSecond.toFixed(1)} requests/second. ` +
        'Consider lowering this to avoid provider rate limits.'
      );
    }

    // Check timeout configuration
    if (config.REQUEST_TIMEOUT < 30000) {
      warnings.push('REQUEST_TIMEOUT is less than 30 seconds. Some requests may timeout prematurely.');
    }

    // Validate model names
    const validGeminiModels = [
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash-8b-latest',
      'gemini-1.5-pro-latest',
      'gemini-1.0-pro',
      'gemini-pro',
      'gemini-pro-vision',
    ];

    if (config.GEMINI_DEFAULT_MODEL && !validGeminiModels.includes(config.GEMINI_DEFAULT_MODEL)) {
      warnings.push(
        `GEMINI_DEFAULT_MODEL "${config.GEMINI_DEFAULT_MODEL}" may not be valid. ` +
        `Valid models: ${validGeminiModels.join(', ')}`
      );
    }
  }

  /**
   * Get a summary of configuration
   */
  getConfigSummary(): Record<string, unknown> {
    const result = this.validate();
    
    if (!result.config) {
      return {
        valid: false,
        errors: result.errors,
      };
    }

    const config = result.config;

    return {
      valid: result.valid,
      server: {
        port: config.PORT,
        environment: config.NODE_ENV,
        logLevel: config.LOG_LEVEL,
      },
      providers: {
        geminiWeb: config.GEMINI_WEB_ENABLED === 'true',
        geminiApi: !!config.GEMINI_API_KEY,
        openai: !!config.OPENAI_API_KEY,
        anthropic: !!config.ANTHROPIC_API_KEY,
      },
      rateLimiting: {
        windowMs: config.RATE_LIMIT_WINDOW_MS,
        maxRequests: config.RATE_LIMIT_MAX_REQUESTS,
      },
      warnings: result.warnings,
      errors: result.errors,
    };
  }

  /**
   * Validate a specific environment variable
   */
  validateVariable(name: string, value: string | undefined): { valid: boolean; error?: string } {
    const schema = envSchema.shape[name as keyof typeof envSchema.shape];
    
    if (!schema) {
      return { valid: true }; // Unknown variable, allow it
    }

    try {
      schema.parse(value);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return { valid: false, error: error.issues[0]?.message };
      }
      return { valid: false, error: 'Invalid value' };
    }
  }
}

// Singleton instance
export const configValidator = new ConfigValidator();

export default configValidator;
