import { Router, Request, Response } from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';
import { ProviderFactory } from '../providers';
import { AnthropicProvider } from '../providers/anthropic';

const router = Router();

/**
 * Create a message batch
 * POST /v1/messages/batches
 */
router.post('/v1/messages/batches', async (req: Request, res: Response) => {
  try {
    const { requests } = req.body;

    if (!requests || !Array.isArray(requests)) {
      return res.status(400).json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'requests array is required',
        },
      });
    }

    // Get Anthropic provider
    const provider = ProviderFactory.getProvider('anthropic');
    if (!provider || !provider.isAvailable()) {
      return res.status(503).json({
        type: 'error',
        error: {
          type: 'api_error',
          message: 'Anthropic provider is not available',
        },
      });
    }

    const anthropicProvider = provider as AnthropicProvider;
    const batch = await anthropicProvider.createBatch(requests);

    res.json(batch);
  } catch (error) {
    logger.error('Batch creation error:', error);
    res.status(500).json({
      type: 'error',
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * Get batch status
 * GET /v1/messages/batches/:batchId
 */
router.get('/v1/messages/batches/:batchId', async (req: Request, res: Response) => {
  try {
    const batchId = req.params.batchId as string;

    const provider = ProviderFactory.getProvider('anthropic');
    if (!provider || !provider.isAvailable()) {
      return res.status(503).json({
        type: 'error',
        error: {
          type: 'api_error',
          message: 'Anthropic provider is not available',
        },
      });
    }

    const anthropicProvider = provider as AnthropicProvider;
    const batch = await anthropicProvider.getBatch(batchId);

    res.json(batch);
  } catch (error) {
    logger.error('Batch retrieval error:', error);
    res.status(500).json({
      type: 'error',
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * Get batch results
 * GET /v1/messages/batches/:batchId/results
 */
router.get('/v1/messages/batches/:batchId/results', async (req: Request, res: Response) => {
  try {
    const batchId = req.params.batchId as string;

    const provider = ProviderFactory.getProvider('anthropic');
    if (!provider || !provider.isAvailable()) {
      return res.status(503).json({
        type: 'error',
        error: {
          type: 'api_error',
          message: 'Anthropic provider is not available',
        },
      });
    }

    const anthropicProvider = provider as AnthropicProvider;
    const results = await anthropicProvider.getBatchResults(batchId);

    // Stream results as JSONL
    res.setHeader('Content-Type', 'application/jsonl');

    for await (const result of results) {
      res.write(JSON.stringify(result) + '\n');
    }

    res.end();
  } catch (error) {
    logger.error('Batch results error:', error);
    res.status(500).json({
      type: 'error',
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * List all batches
 * GET /v1/messages/batches
 */
router.get('/v1/messages/batches', async (req: Request, res: Response) => {
  try {
    const { before, after, limit } = req.query;

    const provider = ProviderFactory.getProvider('anthropic');
    if (!provider || !provider.isAvailable()) {
      return res.status(503).json({
        type: 'error',
        error: {
          type: 'api_error',
          message: 'Anthropic provider is not available',
        },
      });
    }

    const anthropicProvider = provider as AnthropicProvider;
    const batches = await anthropicProvider.listBatches({
      before: before as string,
      after: after as string,
      limit: limit ? parseInt(limit as string) : undefined,
    });

    res.json(batches);
  } catch (error) {
    logger.error('Batch list error:', error);
    res.status(500).json({
      type: 'error',
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * Cancel a batch
 * POST /v1/messages/batches/:batchId/cancel
 */
router.post('/v1/messages/batches/:batchId/cancel', async (req: Request, res: Response) => {
  try {
    const batchId = req.params.batchId as string;

    const provider = ProviderFactory.getProvider('anthropic');
    if (!provider || !provider.isAvailable()) {
      return res.status(503).json({
        type: 'error',
        error: {
          type: 'api_error',
          message: 'Anthropic provider is not available',
        },
      });
    }

    const anthropicProvider = provider as AnthropicProvider;
    const batch = await anthropicProvider.cancelBatch(batchId);

    res.json(batch);
  } catch (error) {
    logger.error('Batch cancel error:', error);
    res.status(500).json({
      type: 'error',
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

export default router;
