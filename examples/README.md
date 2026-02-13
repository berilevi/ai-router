# Usage Examples

This directory contains practical examples demonstrating the AI Router's features.

## Prompt Caching Demo

Demonstrates 90% cost reduction using Anthropic's prompt caching:

```bash
./examples/caching-demo.sh
```

**What it shows:**
- First request creates cache (`cacheCreationInputTokens`)
- Subsequent requests read from cache (`cacheReadInputTokens` - 90% cheaper!)
- Strategic caching with `cacheBreakpoints` for document Q&A

## Batch Processing Demo

Demonstrates 50% cost reduction using Anthropic's Message Batches API:

```bash
./examples/batch-demo.sh
```

**What it shows:**
- Creating a batch with multiple requests
- Polling for batch status
- Retrieving results as JSONL
- Cost comparison: Standard vs Batch API

## Metrics Monitoring Demo

Shows how to monitor cache hit rates and batch processing:

```bash
./examples/metrics-demo.sh
```

**What it shows:**
- Prometheus-format metrics
- JSON metrics for integration
- Provider health status
- Cost tracking tips

## Prerequisites

Make sure the AI Router is running:

```bash
npm start
```

And you have `jq` installed for JSON formatting:

```bash
# Ubuntu/Debian
sudo apt-get install jq

# macOS
brew install jq
```

## Environment Setup

Ensure your `.env` file has the Anthropic API key:

```bash
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_ENABLED=true
```

## Cost Savings Summary

| Feature | Cost Reduction | Use Case |
|---------|---------------|----------|
| **Prompt Caching** | 90% on cached tokens | Repeated context (docs, system prompts) |
| **Batch Processing** | 50% overall | Bulk operations (sentiment analysis, data enrichment) |
| **Combined** | Up to 95% | Cached batch requests |

### Example: 100 requests with 10K token context

**Standard API:**
- 100 × (10,000 tokens × $3/MTok) = $3.00

**With Caching:**
- First: 10,000 tokens × $3/MTok = $0.03
- Next 99: 10,000 tokens × $0.30/MTok = $0.297
- **Total: $0.327 (89% savings!)**

**With Batching:**
- 100 × (10,000 tokens × $1.50/MTok) = $1.50
- **Savings: 50%**

**With Both:**
- First batch: 10,000 tokens × $1.50/MTok = $0.015
- Next batches: 10,000 tokens × $0.15/MTok = $0.1485
- **Total: $0.1635 (95% savings!)**

## Next Steps

1. **Run the demos** to see the features in action
2. **Monitor metrics** at `http://localhost:11434/metrics`
3. **Integrate caching** into your applications with `enableCache: true`
4. **Use batches** for bulk processing operations

## Documentation

- [Prompt Caching Guide](../docs/PROMPT_CACHING.md)
- [Message Batches Guide](../docs/MESSAGE_BATCHES.md)
- [Main README](../README.md)
