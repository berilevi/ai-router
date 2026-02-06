/**
 * Anthropic Messages API Route
 * POST /v1/messages - Anthropic-compatible messages endpoint
 * Routes requests to multiple backend providers based on model name
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import {
  AnthropicMessagesRequest,
  AnthropicErrorResponse,
  generateMessageId,
} from '../types/anthropic';
import {
  translateRequest,
  translateResponse,
  translateError,
  formatSSE,
  StreamEventGenerator,
} from '../utils/anthropicTranslator';
import { routeModel, getFallbackProviders } from '../utils/modelRouter';
import { ProviderFactory } from '../providers';
import { logger } from '../utils/logger';
import { requestLogger } from '../utils/requestLogger';

const router = Router();

// Request validation schema using Zod
const contentBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('image'),
    source: z.object({
      type: z.enum(['base64', 'url']),
      media_type: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
      data: z.string(),
    }),
  }),
  z.object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.record(z.unknown()),
  }),
  z.object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
    content: z.union([z.string(), z.array(z.object({ type: z.literal('text'), text: z.string() }))]),
    is_error: z.boolean().optional(),
  }),
]);

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.union([z.string(), z.array(contentBlockSchema)]),
});

const toolSchema = z.object({
  name: z.string(),
  description: z.string(),
  input_schema: z.object({
    type: z.literal('object'),
    properties: z.record(z.unknown()),
    required: z.array(z.string()).optional(),
  }),
});

const messagesRequestSchema = z.object({
  model: z.string(),
  messages: z.array(messageSchema).min(1),
  max_tokens: z.number().int().positive(),
  system: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  top_p: z.number().min(0).max(1).optional(),
  top_k: z.number().int().positive().optional(),
  stop_sequences: z.array(z.string()).optional(),
  stream: z.boolean().optional(),
  tools: z.array(toolSchema).optional(),
  tool_choice: z.object({
    type: z.enum(['auto', 'any', 'tool']),
    name: z.string().optional(),
  }).optional(),
  metadata: z.object({
    user_id: z.string().optional(),
  }).optional(),
});

// Apply request logging middleware
router.use(requestLogger());

/**
 * POST /v1/messages - Create a message
 * Anthropic Messages API compatible endpoint
 */
router.post('/messages', async (req: Request, res: Response) => {
  const requestId = (req as Request & { id?: string }).id || generateMessageId();

  try {
    // Validate request body
    const validationResult = messagesRequestSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorMessage = validationResult.error.errors
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');

      logger.warn(`[${requestId}] Invalid request: ${errorMessage}`);

      const errorResponse: AnthropicErrorResponse = {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: `Invalid request: ${errorMessage}`,
        },
      };
      return res.status(400).json(errorResponse);
    }

    const anthropicRequest = validationResult.data as AnthropicMessagesRequest;
    logger.info(`[${requestId}] Processing request for model: ${anthropicRequest.model}, stream: ${anthropicRequest.stream || false}`);

    // Route to appropriate provider
    const route = routeModel(anthropicRequest.model);
    if (!route) {
      logger.error(`[${requestId}] No provider available for model: ${anthropicRequest.model}`);

      const errorResponse: AnthropicErrorResponse = {
        type: 'error',
        error: {
          type: 'not_found_error',
          message: `Model "${anthropicRequest.model}" not found or no provider available`,
        },
      };
      return res.status(404).json(errorResponse);
    }

    logger.debug(`[${requestId}] Routed to provider: ${route.config.name} (${route.provider})`);

    // Get the provider
    const provider = ProviderFactory.getProvider(route.provider);
    if (!provider || !provider.isAvailable()) {
      // Try fallback providers
      const fallbacks = getFallbackProviders(route.provider);
      for (const fallback of fallbacks) {
        const fallbackProvider = ProviderFactory.getProvider(fallback.type);
        if (fallbackProvider?.isAvailable()) {
          logger.warn(`[${requestId}] Primary provider unavailable, using fallback: ${fallback.name}`);
          return await handleRequest(req, res, anthropicRequest, fallbackProvider, fallback.defaultModel, requestId);
        }
      }

      const errorResponse: AnthropicErrorResponse = {
        type: 'error',
        error: {
          type: 'api_error',
          message: `Provider "${route.config.name}" is not available`,
        },
      };
      return res.status(503).json(errorResponse);
    }

    // Handle the request
    await handleRequest(req, res, anthropicRequest, provider, route.providerModel, requestId);

  } catch (error) {
    logger.error(`[${requestId}] Unexpected error:`, error);

    const { response, status } = translateError(
      error instanceof Error ? error : new Error(String(error))
    );
    return res.status(status).json(response);
  }
});

/**
 * Handle the actual request processing
 */
async function handleRequest(
  req: Request,
  res: Response,
  anthropicRequest: AnthropicMessagesRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  providerModel: string,
  requestId: string
): Promise<void> {
  // Translate request to internal format
  const options = translateRequest(anthropicRequest);
  options.model = providerModel;  // Use the provider-specific model name

  if (anthropicRequest.stream) {
    await handleStreamingRequest(req, res, provider, options, anthropicRequest.model, requestId);
  } else {
    await handleNonStreamingRequest(res, provider, options, anthropicRequest.model, requestId);
  }
}

/**
 * Handle non-streaming request
 */
async function handleNonStreamingRequest(
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
  requestModel: string,
  requestId: string
): Promise<void> {
  try {
    const response = await provider.chatCompletion(options);
    const anthropicResponse = translateResponse(response, requestModel, options.messages?.length || 0);

    logger.info(`[${requestId}] Completed non-streaming response`);
    res.json(anthropicResponse);
  } catch (error) {
    logger.error(`[${requestId}] Provider error:`, error);

    const { response, status } = translateError(
      error instanceof Error ? error : new Error(String(error))
    );
    res.status(status).json(response);
  }
}

/**
 * Handle streaming request with SSE
 */
async function handleStreamingRequest(
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  provider: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any,
  requestModel: string,
  requestId: string
): Promise<void> {
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx buffering

  // Track if client disconnected
  let clientDisconnected = false;
  req.on('close', () => {
    clientDisconnected = true;
    logger.debug(`[${requestId}] Client disconnected during streaming`);
  });

  // Create stream event generator
  const eventGenerator = new StreamEventGenerator(requestModel, 0);

  try {
    // Send message_start event
    res.write(formatSSE(eventGenerator.getMessageStartEvent()));

    // Get streaming response from provider
    const stream = provider.chatCompletionStream(options);

    let hasContent = false;

    for await (const chunk of stream) {
      // Check if client disconnected
      if (clientDisconnected) {
        logger.info(`[${requestId}] Aborting stream due to client disconnect`);
        break;
      }

      // Generate and send events for this chunk
      for (const event of eventGenerator.processChunk(chunk)) {
        if (!res.writableEnded) {
          res.write(formatSSE(event));
        }
        if (event.type === 'content_block_delta') {
          hasContent = true;
        }
      }
    }

    // Only send closing events if client is still connected
    if (!clientDisconnected && !res.writableEnded) {
      // If no content was sent, still need to close properly
      if (!hasContent) {
        res.write(formatSSE(eventGenerator.getContentBlockStartEvent()));
        res.write(formatSSE(eventGenerator.getContentBlockStopEvent()));
        res.write(formatSSE(eventGenerator.getMessageDeltaEvent(0)));
        res.write(formatSSE(eventGenerator.getMessageStopEvent()));
      }

      logger.info(`[${requestId}] Completed streaming response`);
      res.end();
    }

  } catch (error) {
    logger.error(`[${requestId}] Streaming error:`, error);

    // Send error as SSE event if we haven't ended yet
    if (!res.writableEnded && !clientDisconnected) {
      const { response } = translateError(
        error instanceof Error ? error : new Error(String(error))
      );
      res.write(`event: error\ndata: ${JSON.stringify(response)}\n\n`);
      res.end();
    }
  }
}

/**
 * GET /v1/models - List available models (optional compatibility endpoint)
 */
router.get('/models', async (_req: Request, res: Response) => {
  try {
    const providers = ProviderFactory.getAvailableProviders();
    const models: Array<{ id: string; provider: string }> = [];

    for (const provider of providers) {
      const info = provider.getInfo();
      for (const model of info.models) {
        models.push({
          id: model,
          provider: info.name,
        });
      }
    }

    res.json({
      object: 'list',
      data: models.map(m => ({
        id: m.id,
        object: 'model',
        created: Math.floor(Date.now() / 1000),
        owned_by: m.provider,
      })),
    });
  } catch (error) {
    logger.error('Error listing models:', error);
    res.status(500).json({
      type: 'error',
      error: {
        type: 'api_error',
        message: 'Failed to list models',
      },
    });
  }
});

export default router;
