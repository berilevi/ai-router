# Anthropic Message Batches API

Batch processing allows you to send multiple AI requests in a single API call and retrieve results asynchronously. This is ideal for bulk processing, data analysis, and cost-effective operations.

## Benefits

- **Cost Efficiency**: 50% discount on batch processing
- **Higher Rate Limits**: Process thousands of requests without rate limit concerns
- **Async Processing**: No need to wait for results - retrieve them when ready
- **Bulk Operations**: Process large datasets efficiently

## How It Works

1. **Create a batch** with multiple requests
2. **Poll for status** to check progress
3. **Retrieve results** when processing is complete

Batches are processed asynchronously and results are available for 24 hours after completion.

## API Endpoints

### Create Batch
```bash
POST /v1/messages/batches
```

### Get Batch Status
```bash
GET /v1/messages/batches/:batchId
```

### List Batches
```bash
GET /v1/messages/batches
```

### Get Batch Results
```bash
GET /v1/messages/batches/:batchId/results
```

### Cancel Batch
```bash
POST /v1/messages/batches/:batchId/cancel
```

## Usage Examples

### 1. Create a Batch

```bash
curl -X POST http://localhost:11434/v1/messages/batches \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      {
        "custom_id": "request-1",
        "params": {
          "model": "claude-sonnet-4-5-20250929",
          "max_tokens": 1024,
          "messages": [
            {"role": "user", "content": "Analyze this data: ..."}
          ]
        }
      },
      {
        "custom_id": "request-2",
        "params": {
          "model": "claude-sonnet-4-5-20250929",
          "max_tokens": 1024,
          "messages": [
            {"role": "user", "content": "Summarize this document: ..."}
          ]
        }
      }
    ]
  }'
```

Response:
```json
{
  "id": "msgbatch_01ABC123",
  "type": "message_batch",
  "processing_status": "in_progress",
  "request_counts": {
    "processing": 2,
    "succeeded": 0,
    "errored": 0,
    "canceled": 0,
    "expired": 0
  },
  "created_at": "2024-02-01T12:00:00Z",
  "expires_at": "2024-02-02T12:00:00Z"
}
```

### 2. Check Batch Status

```bash
curl http://localhost:11434/v1/messages/batches/msgbatch_01ABC123
```

Response:
```json
{
  "id": "msgbatch_01ABC123",
  "type": "message_batch",
  "processing_status": "ended",
  "request_counts": {
    "processing": 0,
    "succeeded": 2,
    "errored": 0,
    "canceled": 0,
    "expired": 0
  },
  "ended_at": "2024-02-01T12:05:00Z"
}
```

### 3. Retrieve Results

```bash
curl http://localhost:11434/v1/messages/batches/msgbatch_01ABC123/results
```

Results are returned as JSON Lines (JSONL):
```jsonl
{"custom_id":"request-1","result":{"type":"succeeded","message":{"id":"msg_123","type":"message","role":"assistant","content":[{"type":"text","text":"Analysis results..."}],"model":"claude-sonnet-4-5-20250929","usage":{"input_tokens":100,"output_tokens":200}}}}
{"custom_id":"request-2","result":{"type":"succeeded","message":{"id":"msg_456","type":"message","role":"assistant","content":[{"type":"text","text":"Summary..."}],"model":"claude-sonnet-4-5-20250929","usage":{"input_tokens":150,"output_tokens":100}}}}
```

### 4. List All Batches

```bash
# Get recent batches
curl http://localhost:11434/v1/messages/batches

# With pagination
curl "http://localhost:11434/v1/messages/batches?limit=10&before=msgbatch_01XYZ"
```

### 5. Cancel a Batch

```bash
curl -X POST http://localhost:11434/v1/messages/batches/msgbatch_01ABC123/cancel
```

## Processing Status

| Status | Description |
|--------|-------------|
| `in_progress` | Batch is currently being processed |
| `canceling` | Batch cancellation has been requested |
| `ended` | Batch processing has completed (check request_counts for details) |

## Request Counts

Each batch tracks the status of individual requests:

- `processing`: Currently being processed
- `succeeded`: Completed successfully
- `errored`: Failed with an error
- `canceled`: Manually canceled
- `expired`: Batch expired before processing

## Use Cases

### 1. Bulk Data Analysis

```javascript
// Analyze 100 customer reviews
const requests = reviews.map((review, i) => ({
  custom_id: `review-${i}`,
  params: {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `Analyze sentiment and key themes in this review: ${review}`
    }]
  }
}));

const batch = await fetch('http://localhost:11434/v1/messages/batches', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ requests })
}).then(r => r.json());

console.log(`Batch created: ${batch.id}`);
```

### 2. Document Processing

```javascript
// Summarize multiple documents
const batch = {
  requests: documents.map((doc, i) => ({
    custom_id: `doc-${doc.id}`,
    params: {
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `Summarize this document:\n\n${doc.content}`
      }]
    }
  }))
};
```

### 3. Data Enrichment

```javascript
// Enhance product descriptions
const enrichRequests = products.map(product => ({
  custom_id: `product-${product.sku}`,
  params: {
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Improve this product description for SEO: ${product.description}`
    }]
  }
}));
```

## Best Practices

### 1. Use Meaningful Custom IDs

```javascript
// Good: Descriptive custom IDs
{ custom_id: "customer-12345-review" }

// Bad: Generic IDs
{ custom_id: "req1" }
```

### 2. Poll Efficiently

```javascript
// Poll every 30 seconds until complete
async function waitForBatch(batchId) {
  while (true) {
    const batch = await fetch(`/v1/messages/batches/${batchId}`).then(r => r.json());

    if (batch.processing_status === 'ended') {
      return batch;
    }

    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}
```

### 3. Handle Errors Gracefully

```javascript
const results = await fetch(`/v1/messages/batches/${batchId}/results`)
  .then(r => r.text())
  .then(text => text.split('\n').filter(Boolean).map(JSON.parse));

for (const result of results) {
  if (result.result.type === 'succeeded') {
    // Process successful result
    console.log(result.custom_id, result.result.message.content);
  } else if (result.result.type === 'errored') {
    // Handle error
    console.error(result.custom_id, result.result.error);
  }
}
```

### 4. Batch Size Recommendations

- **Optimal**: 100-1,000 requests per batch
- **Maximum**: 10,000 requests per batch
- **Processing Time**: Typically 5-30 minutes depending on size

## Cost Savings

**Standard Request:**
- Input: 10,000 tokens × $3/MTok = $0.03
- Output: 1,000 tokens × $15/MTok = $0.015
- **Total: $0.045**

**Batch Request:**
- Input: 10,000 tokens × $1.50/MTok = $0.015 (50% discount!)
- Output: 1,000 tokens × $7.50/MTok = $0.0075 (50% discount!)
- **Total: $0.0225**

**Savings: 50% reduction**

## Limitations

- Batches expire 24 hours after creation
- Results available for 24 hours after completion
- Maximum 10,000 requests per batch
- No streaming support (results available when complete)

## Monitoring

Check batch status in metrics:

```bash
curl http://localhost:11434/metrics | grep batch
```

Logs include batch operations:

```
[info]: Creating batch with 100 requests
[info]: Batch created: msgbatch_01ABC123, status: in_progress
[info]: Batch cancelled: msgbatch_01ABC123, status: canceling
```

## Error Handling

### Common Errors

**Invalid Request Format:**
```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "requests array is required"
  }
}
```

**Provider Not Available:**
```json
{
  "type": "error",
  "error": {
    "type": "api_error",
    "message": "Anthropic provider is not available"
  }
}
```

**Batch Not Found:**
```json
{
  "type": "error",
  "error": {
    "type": "not_found_error",
    "message": "Batch not found"
  }
}
```

## Comparison with Standard API

| Feature | Standard API | Batch API |
|---------|--------------|-----------|
| Cost | Full price | 50% discount |
| Processing | Synchronous | Asynchronous |
| Rate Limits | Standard | Higher limits |
| Results | Immediate | Delayed (5-30 min) |
| Streaming | ✅ Yes | ❌ No |
| Use Case | Interactive | Bulk processing |

## Technical Details

- **Results Format**: JSONL (JSON Lines)
- **Batch Lifecycle**: Created → In Progress → Ended
- **Result TTL**: 24 hours after completion
- **Batch Expiry**: 24 hours after creation

## References

- [Anthropic Batch API Documentation](https://docs.anthropic.com/claude/reference/messages-batch)
- [Anthropic SDK Batch Support](https://github.com/anthropics/anthropic-sdk-typescript)
