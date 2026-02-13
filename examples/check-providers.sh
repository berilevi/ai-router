#!/bin/bash

# Quick Provider Check
# Verifies which providers are available before running demos

echo "=== AI Router Provider Status ==="
echo ""

# Check if server is running
if ! curl -s http://localhost:5000/health > /dev/null 2>&1; then
    echo "❌ Server is not running on port 5000"
    echo "   Run: npm start"
    exit 1
fi

echo "✅ Server is running"
echo ""

# Check provider status
echo "Provider Status:"
PROVIDERS=$(curl -s http://localhost:5000/health/providers)
echo "$PROVIDERS" | jq -r '.providers[] | "  \(.name): \(if .available then "✅ Available" else "❌ Not configured" end)"'

echo ""
echo "Active Providers:"
echo "$PROVIDERS" | jq -r '.providers[] | select(.available) | "  - \(.name) (\(.type))"'

echo ""
echo "Available Models:"
curl -s http://localhost:5000/api/tags | jq -r '.models[] | "  - \(.name) via \(.provider)"' 2>/dev/null || echo "  (error fetching models)"

echo ""
echo "=== Configuration Required ==="
echo ""

ANTHROPIC_AVAILABLE=$(echo "$PROVIDERS" | jq -r '.providers[] | select(.type=="anthropic") | .available')

if [ "$ANTHROPIC_AVAILABLE" != "true" ]; then
    echo "⚠️  Anthropic provider is NOT configured"
    echo ""
    echo "To use Anthropic features (Prompt Caching, Message Batches):"
    echo "1. Get an API key from https://console.anthropic.com"
    echo "2. Add to .env file:"
    echo "   ANTHROPIC_API_KEY=sk-ant-api03-..."
    echo "3. Restart the server"
    echo ""
    echo "The caching and batch demos require Anthropic to be configured."
else
    echo "✅ Anthropic is configured and ready!"
    echo ""
    echo "You can run:"
    echo "  ./examples/caching-demo.sh   - Test prompt caching (90% cost reduction)"
    echo "  ./examples/batch-demo.sh     - Test batch processing (50% cost reduction)"
    echo "  ./examples/metrics-demo.sh   - Monitor cache and batch metrics"
fi

echo ""
