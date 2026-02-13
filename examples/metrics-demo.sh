#!/bin/bash

# Metrics Monitoring Demo
# Shows how to monitor cache hit rates and batch processing

echo "=== AI Router Metrics Monitoring Demo ==="
echo ""
echo "This shows how to monitor caching and batch performance."
echo ""

# Example 1: Check Prometheus metrics
echo "1. Prometheus format metrics (grep for cache-related):"
echo ""
curl -s http://localhost:5000/metrics | grep -E "(cache|batch)" || echo "No cache/batch metrics yet - run some requests first!"

echo ""
echo ""

# Example 2: JSON metrics
echo "2. JSON format metrics:"
echo ""
curl -s http://localhost:5000/metrics/json | jq '.providers.anthropic // "Anthropic provider metrics not available"'

echo ""
echo ""

# Example 3: Metrics summary
echo "3. Metrics summary:"
echo ""
curl -s http://localhost:5000/metrics/summary | jq '.'

echo ""
echo ""

# Example 4: Provider health status
echo "4. Provider health and status:"
echo ""
curl -s http://localhost:5000/health/providers | jq '.'

echo ""
echo ""

echo "=== Monitoring Tips ==="
echo ""
echo "1. Cache Hit Rate:"
echo "   - Look for cacheReadInputTokens in response.usage"
echo "   - Higher cache reads = better cost savings"
echo ""
echo "2. Batch Processing:"
echo "   - Monitor request_counts.succeeded vs errored"
echo "   - Track processing time from created_at to ended_at"
echo ""
echo "3. Cost Tracking:"
echo "   - Regular input: \$3/MTok"
echo "   - Cached input: \$0.30/MTok (90% off!)"
echo "   - Batch input: \$1.50/MTok (50% off!)"
echo "   - Batch + Cache: Maximum savings!"
echo ""
