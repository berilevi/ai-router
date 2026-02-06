import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  OllamaGenerateRequest,
  OllamaChatRequest,
  OllamaEmbedRequest,
  OllamaModel,
  ChatCompletionOptions,
  StreamChunk,
  ChatCompletionMessage,
} from '../types';
import { ProviderFactory } from '../providers';
import { routeModel, getAvailableModelsWithInfo, isModelAvailable } from '../utils/modelRouter';
import { requestQueue } from '../utils/requestQueue';
import { retryHandler } from '../utils/retryHandler';
import { metricsCollector } from '../utils/metrics';
import { logger } from '../utils/logger';
import { validateImages } from '../utils/imageValidator';

const router = Router();

// Initialize rate limits for providers
requestQueue.setRateLimit('gemini-api', {
  maxConcurrent: 5,
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  cooldownMs: 500,
});

requestQueue.setRateLimit('openai', {
  maxConcurrent: 5,
  requestsPerMinute: 60,
  requestsPerHour: 2000,
  cooldownMs: 500,
});

requestQueue.setRateLimit('anthropic', {
  maxConcurrent: 3,
  requestsPerMinute: 30,
  requestsPerHour: 500,
  cooldownMs: 1000,
});

// Validation schemas
const generateSchema = z.object({
  model: z.string(),
  prompt: z.string(),
  system: z.string().optional(),
  template: z.string().optional(),
  context: z.array(z.number()).optional(),
  stream: z.boolean().optional().default(true),
  raw: z.boolean().optional(),
  format: z.enum(['json']).optional(),
  options: z.record(z.any()).optional(),
  images: z.array(z.string()).optional(),
});

const chatSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant', 'tool']),
      content: z.string(),
      images: z.array(z.string()).optional(),
      tool_calls: z.array(z.any()).optional(),
    })
  ),
  stream: z.boolean().optional().default(true),
  format: z.enum(['json']).optional(),
  options: z.record(z.any()).optional(),
  tools: z.array(z.any()).optional(),
});

const embedSchema = z.object({
  model: z.string(),
  input: z.union([z.string(), z.array(z.string())]),
  truncate: z.boolean().optional(),
  options: z.record(z.any()).optional(),
  keep_alive: z.string().optional(),
});

const pullSchema = z.object({
  name: z.string(),
  insecure: z.boolean().optional(),
  stream: z.boolean().optional().default(true),
});

/**
 * GET /api/tags - List available models
 */
router.get('/tags', async (_req: Request, res: Response) => {
  try {
    const modelsWithInfo = getAvailableModelsWithInfo();
    const enabledModels = modelsWithInfo.filter((m) => m.enabled);

    const models: OllamaModel[] = enabledModels.map((model) => ({
      name: model.ollamaModel,
      model: model.ollamaModel,
      modified_at: new Date().toISOString(),
      size: 0,
      digest: `sha256:${Buffer.from(model.ollamaModel).toString('hex')}`,
      details: {
        parent_model: '',
        format: 'gguf',
        family: model.provider,
        families: [model.provider],
        parameter_size: 'unknown',
        quantization_level: 'none',
      },
    }));

    res.json({ models });
  } catch (error) {
    logger.error('Error listing models:', error);
    res.status(500).json({ error: 'Failed to list models' });
  }
});

/**
 * POST /api/generate - Generate a completion
 */
router.post('/generate', async (req: Request, res: Response) => {
  const requestId = metricsCollector.recordRequestStart('unknown', 'unknown');
  const startTime = Date.now();

  try {
    const body = generateSchema.parse(req.body) as OllamaGenerateRequest;

    // Check if model is available
    if (!isModelAvailable(body.model)) {
      metricsCollector.recordRequestFailure(requestId, 'unknown', body.model, new Error('Model not found'), Date.now() - startTime);
      return res.status(404).json({ error: `Model "${body.model}" not found` });
    }

    // Route to appropriate provider
    const route = routeModel(body.model);
    if (!route) {
      metricsCollector.recordRequestFailure(requestId, 'unknown', body.model, new Error('No provider available'), Date.now() - startTime);
      return res.status(404).json({ error: `No provider available for model "${body.model}"` });
    }

    // Update request tracking
    metricsCollector.recordRequestStart(route.provider, route.providerModel);

    const provider = ProviderFactory.getProvider(route.provider);
    if (!provider || !provider.isAvailable()) {
      metricsCollector.recordRequestFailure(requestId, route.provider, body.model, new Error('Provider not available'), Date.now() - startTime);
      return res.status(503).json({ error: `Provider "${route.provider}" is not available` });
    }

    // Validate images if present
    let validatedImages: Buffer[] | undefined;
    if (body.images && body.images.length > 0) {
      const imageValidation = validateImages(body.images);
      if (!imageValidation.valid) {
        metricsCollector.recordRequestFailure(requestId, route.provider, body.model, new Error('Invalid images'), Date.now() - startTime);
        return res.status(400).json({
          error: 'Invalid image data',
          details: imageValidation.errors,
        });
      }
      validatedImages = imageValidation.validImages.map(img => Buffer.from(img.data, 'base64'));
    }

    // Convert to chat completion format
    const messages: ChatCompletionMessage[] = [{ role: 'user', content: body.prompt, images: validatedImages }];
    if (body.system) {
      messages.unshift({ role: 'system', content: body.system });
    }

    const options: ChatCompletionOptions = {
      model: route.providerModel,
      messages,
      temperature: body.options?.temperature,
      topP: body.options?.top_p,
      maxTokens: body.options?.num_predict,
      stream: body.stream,
      system: body.system,
    };

    if (body.stream) {
      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let responseText = '';
      let tokenCount = 0;

      try {
        // Use request queue for rate limiting - get the stream generator
        const streamGenerator = await requestQueue.enqueue<AsyncGenerator<StreamChunk>>(
          route.provider,
          () => provider.chatCompletionStream(options),
          { priority: 5, maxRetries: 3 }
        );

        for await (const chunk of streamGenerator) {
          responseText += chunk.content;
          tokenCount += chunk.content.length / 4; // Rough estimate

          const response = {
            model: body.model,
            created_at: new Date().toISOString(),
            response: chunk.content,
            done: chunk.done,
          };

          res.write(JSON.stringify(response) + '\n');

          if (chunk.done) {
            break;
          }
        }

        // Send final response with stats
        const duration = Date.now() - startTime;
        const finalResponse = {
          model: body.model,
          created_at: new Date().toISOString(),
          response: '',
          done: true,
          total_duration: duration * 1000000, // Convert to nanoseconds for Ollama compatibility
          load_duration: 0,
          prompt_eval_count: body.prompt.length / 4,
          prompt_eval_duration: 0,
          eval_count: tokenCount,
          eval_duration: duration * 1000000,
        };

        res.write(JSON.stringify(finalResponse) + '\n');
        res.end();

        // Record metrics
        metricsCollector.recordRequestComplete(
          requestId,
          route.provider,
          body.model,
          duration,
          { input: Math.round(body.prompt.length / 4), output: Math.round(tokenCount) }
        );
      } catch (streamError) {
        const duration = Date.now() - startTime;
        logger.error('Streaming error:', streamError);
        
        metricsCollector.recordRequestFailure(
          requestId,
          route.provider,
          body.model,
          streamError as Error,
          duration
        );
        
        res.write(JSON.stringify({ error: 'Streaming failed', done: true }) + '\n');
        res.end();
      }
    } else {
      // Non-streaming response with retry logic
      const result = await retryHandler.executeWithRetry(
        () => requestQueue.enqueue(
          route.provider,
          () => provider.chatCompletion(options),
          { priority: 5, maxRetries: 3 }
        ),
        { provider: route.provider, model: body.model }
      );

      const duration = Date.now() - startTime;

      if (!result.success) {
        metricsCollector.recordRequestFailure(
          requestId,
          route.provider,
          body.model,
          result.error || new Error('Request failed'),
          duration
        );
        
        return res.status(500).json({
          error: 'Generation failed',
          message: result.error?.message,
          providers_tried: result.providersTried,
        });
      }

      // Record metrics
      metricsCollector.recordRequestComplete(
        requestId,
        route.provider,
        body.model,
        duration,
        result.result?.usage
          ? { input: result.result.usage.promptTokens, output: result.result.usage.completionTokens }
          : undefined
      );

      res.json({
        model: body.model,
        created_at: new Date().toISOString(),
        response: result.result?.content || '',
        done: true,
        total_duration: duration * 1000000,
        load_duration: 0,
        prompt_eval_count: result.result?.usage?.promptTokens || 0,
        prompt_eval_duration: 0,
        eval_count: result.result?.usage?.completionTokens || 0,
        eval_duration: duration * 1000000,
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof z.ZodError) {
      metricsCollector.recordRequestFailure(requestId, 'unknown', 'unknown', new Error('Invalid request'), duration);
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    
    logger.error('Generate error:', error);
    metricsCollector.recordRequestFailure(requestId, 'unknown', 'unknown', error as Error, duration);
    res.status(500).json({ error: 'Generation failed', message: (error as Error).message });
  }
});

/**
 * POST /api/chat - Chat completion
 */
router.post('/chat', async (req: Request, res: Response) => {
  const requestId = metricsCollector.recordRequestStart('unknown', 'unknown');
  const startTime = Date.now();

  try {
    const body = chatSchema.parse(req.body) as OllamaChatRequest;

    // Check if model is available
    if (!isModelAvailable(body.model)) {
      metricsCollector.recordRequestFailure(requestId, 'unknown', body.model, new Error('Model not found'), Date.now() - startTime);
      return res.status(404).json({ error: `Model "${body.model}" not found` });
    }

    // Route to appropriate provider
    const route = routeModel(body.model);
    if (!route) {
      metricsCollector.recordRequestFailure(requestId, 'unknown', body.model, new Error('No provider available'), Date.now() - startTime);
      return res.status(404).json({ error: `No provider available for model "${body.model}"` });
    }

    const provider = ProviderFactory.getProvider(route.provider);
    if (!provider || !provider.isAvailable()) {
      metricsCollector.recordRequestFailure(requestId, route.provider, body.model, new Error('Provider not available'), Date.now() - startTime);
      return res.status(503).json({ error: `Provider "${route.provider}" is not available` });
    }

    // Validate and convert messages with images
    const messages: ChatCompletionMessage[] = [];
    for (const msg of body.messages) {
      let validatedImages: Buffer[] | undefined;

      if (msg.images && msg.images.length > 0) {
        const imageValidation = validateImages(msg.images);
        if (!imageValidation.valid) {
          metricsCollector.recordRequestFailure(requestId, route.provider, body.model, new Error('Invalid images'), Date.now() - startTime);
          return res.status(400).json({
            error: 'Invalid image data',
            details: imageValidation.errors,
          });
        }
        validatedImages = imageValidation.validImages.map(img => Buffer.from(img.data, 'base64'));
      }

      messages.push({
        role: msg.role,
        content: msg.content,
        images: validatedImages,
      });
    }

    const options: ChatCompletionOptions = {
      model: route.providerModel,
      messages,
      temperature: body.options?.temperature,
      topP: body.options?.top_p,
      maxTokens: body.options?.num_predict,
      stream: body.stream,
      tools: body.tools,
    };

    if (body.stream) {
      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      let responseText = '';
      let tokenCount = 0;

      try {
        const streamGenerator = await requestQueue.enqueue<AsyncGenerator<StreamChunk>>(
          route.provider,
          () => provider.chatCompletionStream(options),
          { priority: 5, maxRetries: 3 }
        );

        for await (const chunk of streamGenerator) {
          responseText += chunk.content;
          tokenCount += chunk.content.length / 4;

          const response = {
            model: body.model,
            created_at: new Date().toISOString(),
            message: {
              role: 'assistant',
              content: chunk.content,
            },
            done: chunk.done,
          };

          res.write(JSON.stringify(response) + '\n');

          if (chunk.done) {
            break;
          }
        }

        // Send final response
        const duration = Date.now() - startTime;
        const finalResponse = {
          model: body.model,
          created_at: new Date().toISOString(),
          message: {
            role: 'assistant',
            content: '',
          },
          done: true,
          total_duration: duration * 1000000,
          load_duration: 0,
          prompt_eval_count: 0,
          prompt_eval_duration: 0,
          eval_count: tokenCount,
          eval_duration: duration * 1000000,
        };

        res.write(JSON.stringify(finalResponse) + '\n');
        res.end();

        metricsCollector.recordRequestComplete(
          requestId,
          route.provider,
          body.model,
          duration,
          { input: 0, output: Math.round(tokenCount) }
        );
      } catch (streamError) {
        const duration = Date.now() - startTime;
        logger.error('Chat streaming error:', streamError);
        
        metricsCollector.recordRequestFailure(
          requestId,
          route.provider,
          body.model,
          streamError as Error,
          duration
        );
        
        res.write(JSON.stringify({ error: 'Streaming failed', done: true }) + '\n');
        res.end();
      }
    } else {
      // Non-streaming with retry logic
      const result = await retryHandler.executeWithRetry(
        () => requestQueue.enqueue(
          route.provider,
          () => provider.chatCompletion(options),
          { priority: 5, maxRetries: 3 }
        ),
        { provider: route.provider, model: body.model }
      );

      const duration = Date.now() - startTime;

      if (!result.success) {
        metricsCollector.recordRequestFailure(
          requestId,
          route.provider,
          body.model,
          result.error || new Error('Request failed'),
          duration
        );
        
        return res.status(500).json({
          error: 'Chat failed',
          message: result.error?.message,
          providers_tried: result.providersTried,
        });
      }

      metricsCollector.recordRequestComplete(
        requestId,
        route.provider,
        body.model,
        duration,
        result.result?.usage
          ? { input: result.result.usage.promptTokens, output: result.result.usage.completionTokens }
          : undefined
      );

      res.json({
        model: body.model,
        created_at: new Date().toISOString(),
        message: {
          role: 'assistant',
          content: result.result?.content || '',
        },
        done: true,
        total_duration: duration * 1000000,
        load_duration: 0,
        prompt_eval_count: result.result?.usage?.promptTokens || 0,
        prompt_eval_duration: 0,
        eval_count: result.result?.usage?.completionTokens || 0,
        eval_duration: duration * 1000000,
      });
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof z.ZodError) {
      metricsCollector.recordRequestFailure(requestId, 'unknown', 'unknown', new Error('Invalid request'), duration);
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    
    logger.error('Chat error:', error);
    metricsCollector.recordRequestFailure(requestId, 'unknown', 'unknown', error as Error, duration);
    res.status(500).json({ error: 'Chat failed', message: (error as Error).message });
  }
});

/**
 * POST /api/embed - Generate embeddings
 */
router.post('/embed', async (req: Request, res: Response) => {
  const requestId = metricsCollector.recordRequestStart('unknown', 'unknown');
  const startTime = Date.now();

  try {
    const body = embedSchema.parse(req.body) as OllamaEmbedRequest;

    // Route to appropriate provider
    const route = routeModel(body.model);
    if (!route) {
      metricsCollector.recordRequestFailure(requestId, 'unknown', body.model, new Error('No provider available'), Date.now() - startTime);
      return res.status(404).json({ error: `No provider available for model "${body.model}"` });
    }

    const provider = ProviderFactory.getProvider(route.provider);
    if (!provider || !provider.isAvailable()) {
      metricsCollector.recordRequestFailure(requestId, route.provider, body.model, new Error('Provider not available'), Date.now() - startTime);
      return res.status(503).json({ error: `Provider "${route.provider}" is not available` });
    }

    if (!provider.generateEmbeddings) {
      metricsCollector.recordRequestFailure(requestId, route.provider, body.model, new Error('Embeddings not supported'), Date.now() - startTime);
      return res.status(501).json({ error: 'Embeddings not supported by this provider' });
    }

    const embeddings = await requestQueue.enqueue(
      route.provider,
      () => provider.generateEmbeddings!(body.input),
      { priority: 5, maxRetries: 3 }
    );

    const duration = Date.now() - startTime;
    metricsCollector.recordRequestComplete(requestId, route.provider, body.model, duration);

    res.json({
      model: body.model,
      embeddings,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    
    if (error instanceof z.ZodError) {
      metricsCollector.recordRequestFailure(requestId, 'unknown', 'unknown', new Error('Invalid request'), duration);
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    
    logger.error('Embed error:', error);
    metricsCollector.recordRequestFailure(requestId, 'unknown', 'unknown', error as Error, duration);
    res.status(500).json({ error: 'Embedding failed', message: (error as Error).message });
  }
});

/**
 * POST /api/pull - Pull a model (no-op for this bridge)
 */
router.post('/pull', async (req: Request, res: Response) => {
  try {
    const body = pullSchema.parse(req.body);

    if (body.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      res.write(
        JSON.stringify({
          status: `Model "${body.name}" is available through the bridge`,
          completed: true,
        }) + '\n'
      );
      res.end();
    } else {
      res.json({
        status: `Model "${body.name}" is available through the bridge`,
        completed: true,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request', details: error.errors });
    }
    res.status(500).json({ error: 'Pull failed' });
  }
});

/**
 * DELETE /api/delete - Delete a model (no-op for this bridge)
 */
router.delete('/delete', async (_req: Request, res: Response) => {
  res.status(400).json({
    error: 'Cannot delete models from the bridge. Models are provided by external services.',
  });
});

/**
 * POST /api/show - Show model info
 */
router.post('/show', async (req: Request, res: Response) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Model name is required' });
    }

    const route = routeModel(name);
    if (!route) {
      return res.status(404).json({ error: `Model "${name}" not found` });
    }

    res.json({
      license: 'Unknown',
      modelfile: `# Model: ${name}\n# Provider: ${route.provider}\n# Mapped to: ${route.providerModel}`,
      parameters: 'Unknown',
      template: '{{ .System }}\n{{ .Prompt }}',
      details: {
        parent_model: '',
        format: 'gguf',
        family: route.provider,
        families: [route.provider],
        parameter_size: 'unknown',
        quantization_level: 'none',
      },
      model_info: {
        provider: route.provider,
        provider_model: route.providerModel,
        supports_images: route.mapping?.supportsImages || false,
        supports_tools: route.mapping?.supportsTools || false,
        context_window: route.mapping?.contextWindow || 0,
      },
    });
  } catch (error) {
    logger.error('Show error:', error);
    res.status(500).json({ error: 'Failed to get model info' });
  }
});

/**
 * POST /api/copy - Copy a model (no-op for this bridge)
 */
router.post('/copy', async (_req: Request, res: Response) => {
  res.status(400).json({ error: 'Copy not supported by the bridge' });
});

/**
 * POST /api/create - Create a model (no-op for this bridge)
 */
router.post('/create', async (_req: Request, res: Response) => {
  res.status(400).json({ error: 'Create not supported by the bridge' });
});

export default router;
