# OpenAI Batch Processing API

The OpenAI Batch API processes large volumes of requests asynchronously at 50% reduced cost. This is ideal for bulk operations like data processing, evaluations, embeddings generation, and any workload that doesn't require real-time responses.

## Benefits

- **50% Cost Reduction**: Batch requests cost half the price of real-time requests
- **High Throughput**: Process up to 50,000 requests per batch
- **Async Processing**: Results available within 24 hours
- **No Rate Limits**: Batches don't count against real-time rate limits

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/batches` | Create a new batch |
| GET | `/v1/batches` | List all batches |
| GET | `/v1/batches/:id` | Get batch status |
| GET | `/v1/batches/:id/results` | Get batch results (JSONL) |
| GET | `/v1/batches/:id/errors` | Get batch errors (JSONL) |
| POST | `/v1/batches/:id/cancel` | Cancel a batch |
| POST | `/v1/files` | Upload batch input file |
| GET | `/v1/files/:id/content` | Get file content |
| DELETE | `/v1/files/:id` | Delete a file |

## Quick Start

### Create a Batch (Convenience Format)

The simplest way to create a batch - pass an array of requests directly:

```bash
curl -X POST http://localhost:11434/v1/batches \
  -H "Content-Type: application/json" \
  -d '{
    "endpoint": "/v1/chat/completions",
    "completion_window": "24h",
    "requests": [
      {
        "custom_id": "request-1",
        "method": "POST",
        "url": "/v1/chat/completions",
        "body": {
          "model": "gpt-4o-mini",
          "messages": [{"role": "user", "content": "What is 2+2?"}],
          "max_tokens": 100
        }
      },
      {
        "custom_id": "request-2",
        "method": "POST",
        "url": "/v1/chat/completions",
        "body": {
          "model": "gpt-4o-mini",
          "messages": [{"role": "user", "content": "What is the capital of France?"}],
          "max_tokens": 100
        }
      }
    ]
  }'
```

### Create a Batch (Standard OpenAI Format)

If you prefer, upload a JSONL file first:

```bash
# 1. Upload batch input file
curl -X POST http://localhost:11434/v1/files \
  -H "Content-Type: application/json" \
  -d '{
    "purpose": "batch",
    "content": "{\"custom_id\": \"req-1\", \"method\": \"POST\", \"url\": \"/v1/chat/completions\", \"body\": {\"model\": \"gpt-4o-mini\", \"messages\": [{\"role\": \"user\", \"content\": \"Hello\"}]}}\n{\"custom_id\": \"req-2\", \"method\": \"POST\", \"url\": \"/v1/chat/completions\", \"body\": {\"model\": \"gpt-4o-mini\", \"messages\": [{\"role\": \"user\", \"content\": \"World\"}]}}"
  }'

# Response: {"id": "file-abc123", ...}

# 2. Create batch with file ID
curl -X POST http://localhost:11434/v1/batches \
  -H "Content-Type: application/json" \
  -d '{
    "input_file_id": "file-abc123",
    "endpoint": "/v1/chat/completions",
    "completion_window": "24h"
  }'
```

### Check Batch Status

```bash
curl http://localhost:11434/v1/batches/batch_abc123
```

Response:
```json
{
  "id": "batch_abc123",
  "object": "batch",
  "endpoint": "/v1/chat/completions",
  "status": "in_progress",
  "request_counts": {
    "total": 2,
    "completed": 1,
    "failed": 0
  },
  "created_at": 1699061776,
  "expires_at": 1699148176
}
```

### Get Results

```bash
curl http://localhost:11434/v1/batches/batch_abc123/results
```

Response (JSONL):
```jsonl
{"id":"response-1","custom_id":"request-1","response":{"status_code":200,"body":{"choices":[{"message":{"content":"4"}}]}}}
{"id":"response-2","custom_id":"request-2","response":{"status_code":200,"body":{"choices":[{"message":{"content":"Paris"}}]}}}
```

### List All Batches

```bash
curl "http://localhost:11434/v1/batches?limit=10"
```

### Cancel a Batch

```bash
curl -X POST http://localhost:11434/v1/batches/batch_abc123/cancel
```

## Batch Request Format

Each request in a batch must have:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `custom_id` | string | Yes | Unique identifier for matching results |
| `method` | string | Yes | Must be "POST" |
| `url` | string | Yes | API endpoint (`/v1/chat/completions` or `/v1/embeddings`) |
| `body` | object | Yes | Request payload |

Example request object:
```json
{
  "custom_id": "my-unique-id",
  "method": "POST",
  "url": "/v1/chat/completions",
  "body": {
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Translate 'hello' to French."}
    ],
    "temperature": 0.7,
    "max_tokens": 100
  }
}
```

## Supported Endpoints

- `/v1/chat/completions` - Chat completions
- `/v1/embeddings` - Text embeddings

## Batch Status Values

| Status | Description |
|--------|-------------|
| `validating` | Input file is being validated |
| `in_progress` | Batch is being processed |
| `finalizing` | Results are being prepared |
| `completed` | All requests processed successfully |
| `failed` | Batch failed (check error_file_id) |
| `expired` | Batch exceeded 24-hour window |
| `cancelling` | Cancellation in progress |
| `cancelled` | Batch was cancelled |

## Use Cases

### 1. Bulk Evaluations

Evaluate model responses across many test cases:

```json
{
  "requests": [
    {"custom_id": "eval-1", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "gpt-4o", "messages": [{"role": "user", "content": "Rate this response: ..."}]}},
    {"custom_id": "eval-2", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "gpt-4o", "messages": [{"role": "user", "content": "Rate this response: ..."}]}}
  ]
}
```

### 2. Data Classification

Classify large datasets:

```json
{
  "requests": [
    {"custom_id": "classify-1", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Classify this text: ..."}]}},
    {"custom_id": "classify-2", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Classify this text: ..."}]}}
  ]
}
```

### 3. Bulk Embeddings

Generate embeddings for a large corpus:

```json
{
  "endpoint": "/v1/embeddings",
  "requests": [
    {"custom_id": "embed-1", "method": "POST", "url": "/v1/embeddings", "body": {"model": "text-embedding-3-small", "input": "Document 1 text..."}},
    {"custom_id": "embed-2", "method": "POST", "url": "/v1/embeddings", "body": {"model": "text-embedding-3-small", "input": "Document 2 text..."}}
  ]
}
```

### 4. Translation

Translate content in bulk:

```json
{
  "requests": [
    {"custom_id": "translate-1", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "gpt-4o-mini", "messages": [{"role": "system", "content": "Translate to French"}, {"role": "user", "content": "Hello world"}]}},
    {"custom_id": "translate-2", "method": "POST", "url": "/v1/chat/completions", "body": {"model": "gpt-4o-mini", "messages": [{"role": "system", "content": "Translate to French"}, {"role": "user", "content": "Goodbye"}]}}
  ]
}
```

## Cost Comparison

| Request Type | Cost (GPT-4o-mini) |
|--------------|-------------------|
| Real-time | $0.15 / 1M input tokens |
| Batch | $0.075 / 1M input tokens (**50% off**) |

For 1 million tokens:
- Real-time: $0.15
- Batch: $0.075
- **Savings: $0.075 per million tokens**

## Error Handling

If some requests fail, you can retrieve errors:

```bash
curl http://localhost:11434/v1/batches/batch_abc123/errors
```

Response (JSONL):
```jsonl
{"custom_id":"request-5","error":{"code":"invalid_request","message":"Invalid model specified"}}
```

## Demo Script

Run the demo script to see the Batch API in action:

```bash
./examples/openai-batch-demo.sh
```

## Limitations

- Maximum 50,000 requests per batch
- 24-hour completion window
- No streaming responses
- Results must be downloaded before batch expires

## References

- [OpenAI Batch API Documentation](https://platform.openai.com/docs/guides/batch)
- [OpenAI API Reference - Batches](https://platform.openai.com/docs/api-reference/batch)
