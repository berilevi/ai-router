import { Router, Request, Response } from 'express';
import { ProviderFactory } from '../providers';
import { OpenAICompatibleProvider, OpenAIBatchRequest } from '../providers/openaiCompatible';
import { logger } from '../utils/logger';

const router = Router();

// Type for route params
interface BatchParams {
  batchId: string;
}

interface FileParams {
  fileId: string;
}

/**
 * Helper to get OpenAI provider
 */
function getOpenAIProvider(): OpenAICompatibleProvider | null {
  const provider = ProviderFactory.getProvider('openai');
  if (!provider || !provider.isAvailable()) {
    return null;
  }
  return provider as OpenAICompatibleProvider;
}

/**
 * POST /v1/batches - Create a new batch
 *
 * Accepts either:
 * 1. Standard OpenAI format: { input_file_id, endpoint, completion_window, metadata }
 * 2. Convenience format: { requests: [...], endpoint, completion_window, metadata }
 *
 * The convenience format will automatically upload the JSONL file.
 */
router.post('/batches', async (req: Request, res: Response) => {
  try {
    const provider = getOpenAIProvider();
    if (!provider) {
      return res.status(503).json({
        error: {
          type: 'api_error',
          message: 'OpenAI provider is not available',
        },
      });
    }

    const { input_file_id, requests, endpoint, completion_window, metadata } = req.body;

    // Validate required fields
    if (!input_file_id && (!requests || !Array.isArray(requests) || requests.length === 0)) {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'Either input_file_id or requests array is required',
        },
      });
    }

    if (!endpoint) {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'endpoint is required (e.g., "/v1/chat/completions")',
        },
      });
    }

    // Validate endpoint
    const validEndpoints = ['/v1/chat/completions', '/v1/embeddings'];
    if (!validEndpoints.includes(endpoint)) {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: `Invalid endpoint. Must be one of: ${validEndpoints.join(', ')}`,
        },
      });
    }

    // Validate requests format if provided
    if (requests) {
      for (let i = 0; i < requests.length; i++) {
        const req = requests[i] as OpenAIBatchRequest;
        if (!req.custom_id) {
          return res.status(400).json({
            error: {
              type: 'invalid_request_error',
              message: `Request at index ${i} is missing required field: custom_id`,
            },
          });
        }
        if (!req.body) {
          return res.status(400).json({
            error: {
              type: 'invalid_request_error',
              message: `Request at index ${i} is missing required field: body`,
            },
          });
        }
      }
    }

    const batch = await provider.createBatch({
      input_file_id,
      requests,
      endpoint,
      completion_window: completion_window || '24h',
      metadata,
    });

    logger.info(`OpenAI batch created: ${batch.id}`);
    res.json(batch);
  } catch (error) {
    logger.error('OpenAI batch creation error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * GET /v1/batches - List all batches
 */
router.get('/batches', async (req: Request, res: Response) => {
  try {
    const provider = getOpenAIProvider();
    if (!provider) {
      return res.status(503).json({
        error: {
          type: 'api_error',
          message: 'OpenAI provider is not available',
        },
      });
    }

    const { after, limit } = req.query;

    const batches = await provider.listBatches({
      after: after as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.json(batches);
  } catch (error) {
    logger.error('OpenAI batch list error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * GET /v1/batches/:batchId - Get batch status
 */
router.get('/batches/:batchId', async (req: Request<BatchParams>, res: Response) => {
  try {
    const provider = getOpenAIProvider();
    if (!provider) {
      return res.status(503).json({
        error: {
          type: 'api_error',
          message: 'OpenAI provider is not available',
        },
      });
    }

    const { batchId } = req.params;
    const batch = await provider.getBatch(batchId);

    res.json(batch);
  } catch (error) {
    logger.error('OpenAI batch retrieval error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * POST /v1/batches/:batchId/cancel - Cancel a batch
 */
router.post('/batches/:batchId/cancel', async (req: Request<BatchParams>, res: Response) => {
  try {
    const provider = getOpenAIProvider();
    if (!provider) {
      return res.status(503).json({
        error: {
          type: 'api_error',
          message: 'OpenAI provider is not available',
        },
      });
    }

    const { batchId } = req.params;
    const batch = await provider.cancelBatch(batchId);

    logger.info(`OpenAI batch cancelled: ${batchId}`);
    res.json(batch);
  } catch (error) {
    logger.error('OpenAI batch cancel error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * GET /v1/batches/:batchId/results - Get batch results
 *
 * Returns JSONL content when batch is complete.
 * Returns 202 Accepted with status if batch is still processing.
 */
router.get('/batches/:batchId/results', async (req: Request<BatchParams>, res: Response) => {
  try {
    const provider = getOpenAIProvider();
    if (!provider) {
      return res.status(503).json({
        error: {
          type: 'api_error',
          message: 'OpenAI provider is not available',
        },
      });
    }

    const { batchId } = req.params;
    const batch = await provider.getBatch(batchId);

    // Return status if not complete
    if (batch.status !== 'completed' && batch.status !== 'failed' && batch.status !== 'expired') {
      return res.status(202).json({
        id: batch.id,
        status: batch.status,
        request_counts: batch.request_counts,
        message: 'Batch is still processing. Poll this endpoint for results.',
      });
    }

    // Get results
    const results = await provider.getBatchResults(batchId);

    if (!results) {
      return res.status(404).json({
        error: {
          type: 'not_found',
          message: 'No results available for this batch',
        },
      });
    }

    // Return as JSONL
    res.setHeader('Content-Type', 'application/jsonl');
    res.send(results);
  } catch (error) {
    logger.error('OpenAI batch results error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * GET /v1/batches/:batchId/errors - Get batch errors
 *
 * Returns JSONL content with any errors from the batch.
 */
router.get('/batches/:batchId/errors', async (req: Request<BatchParams>, res: Response) => {
  try {
    const provider = getOpenAIProvider();
    if (!provider) {
      return res.status(503).json({
        error: {
          type: 'api_error',
          message: 'OpenAI provider is not available',
        },
      });
    }

    const { batchId } = req.params;
    const errors = await provider.getBatchErrors(batchId);

    if (!errors) {
      return res.status(404).json({
        message: 'No errors for this batch',
      });
    }

    // Return as JSONL
    res.setHeader('Content-Type', 'application/jsonl');
    res.send(errors);
  } catch (error) {
    logger.error('OpenAI batch errors retrieval error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * POST /v1/files - Upload a file for batch processing
 *
 * Accepts JSON body with:
 * - content: JSONL string content
 * - filename: Optional filename (default: batch_input.jsonl)
 * - purpose: Must be "batch"
 */
router.post('/files', async (req: Request, res: Response) => {
  try {
    const provider = getOpenAIProvider();
    if (!provider) {
      return res.status(503).json({
        error: {
          type: 'api_error',
          message: 'OpenAI provider is not available',
        },
      });
    }

    const { content, filename, purpose } = req.body;

    if (!content) {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'content is required (JSONL string)',
        },
      });
    }

    if (purpose && purpose !== 'batch') {
      return res.status(400).json({
        error: {
          type: 'invalid_request_error',
          message: 'Only purpose="batch" is supported for this endpoint',
        },
      });
    }

    const file = await provider.uploadBatchFile(content, filename || 'batch_input.jsonl');

    res.json(file);
  } catch (error) {
    logger.error('OpenAI file upload error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * GET /v1/files/:fileId/content - Get file content
 */
router.get('/files/:fileId/content', async (req: Request<FileParams>, res: Response) => {
  try {
    const provider = getOpenAIProvider();
    if (!provider) {
      return res.status(503).json({
        error: {
          type: 'api_error',
          message: 'OpenAI provider is not available',
        },
      });
    }

    const { fileId } = req.params;
    const content = await provider.getFileContent(fileId);

    res.setHeader('Content-Type', 'application/jsonl');
    res.send(content);
  } catch (error) {
    logger.error('OpenAI file content error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

/**
 * DELETE /v1/files/:fileId - Delete a file
 */
router.delete('/files/:fileId', async (req: Request<FileParams>, res: Response) => {
  try {
    const provider = getOpenAIProvider();
    if (!provider) {
      return res.status(503).json({
        error: {
          type: 'api_error',
          message: 'OpenAI provider is not available',
        },
      });
    }

    const { fileId } = req.params;
    const result = await provider.deleteFile(fileId);

    res.json(result);
  } catch (error) {
    logger.error('OpenAI file delete error:', error);
    res.status(500).json({
      error: {
        type: 'api_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
});

export default router;
