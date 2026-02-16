#!/bin/bash
# OpenAI Batch Processing API Demo
# This script demonstrates the OpenAI Batch API endpoints

BASE_URL="${BASE_URL:-http://localhost:11434}"

echo "========================================"
echo "OpenAI Batch Processing API Demo"
echo "========================================"
echo "Base URL: $BASE_URL"
echo ""

# Check if the server is running
echo "1. Checking server health..."
HEALTH=$(curl -s "$BASE_URL/health")
if [ $? -ne 0 ]; then
    echo "   ERROR: Server not responding. Start the server first."
    exit 1
fi
echo "   Server is healthy"
echo ""

# Check if OpenAI provider is available
echo "2. Checking OpenAI provider status..."
PROVIDERS=$(curl -s "$BASE_URL/health/providers")
OPENAI_STATUS=$(echo "$PROVIDERS" | grep -o '"openai":[^}]*' | head -1)
if echo "$OPENAI_STATUS" | grep -q '"available":true'; then
    echo "   OpenAI provider is available"
else
    echo "   WARNING: OpenAI provider may not be available"
    echo "   Make sure OPENAI_API_KEY is set in your .env file"
fi
echo ""

# Create a batch with multiple requests
echo "3. Creating a batch with 3 requests..."
echo ""

# Method 1: Using the convenience format (requests array)
BATCH_RESPONSE=$(curl -s -X POST "$BASE_URL/v1/batches" \
    -H "Content-Type: application/json" \
    -d '{
        "endpoint": "/v1/chat/completions",
        "completion_window": "24h",
        "metadata": {
            "description": "Demo batch from AI Router"
        },
        "requests": [
            {
                "custom_id": "request-1",
                "method": "POST",
                "url": "/v1/chat/completions",
                "body": {
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "user", "content": "What is 2+2?"}
                    ],
                    "max_tokens": 100
                }
            },
            {
                "custom_id": "request-2",
                "method": "POST",
                "url": "/v1/chat/completions",
                "body": {
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "user", "content": "What is the capital of France?"}
                    ],
                    "max_tokens": 100
                }
            },
            {
                "custom_id": "request-3",
                "method": "POST",
                "url": "/v1/chat/completions",
                "body": {
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "user", "content": "Write a haiku about programming"}
                    ],
                    "max_tokens": 100
                }
            }
        ]
    }')

echo "Response:"
echo "$BATCH_RESPONSE" | jq . 2>/dev/null || echo "$BATCH_RESPONSE"
echo ""

# Extract batch ID
BATCH_ID=$(echo "$BATCH_RESPONSE" | jq -r '.id // empty')
if [ -z "$BATCH_ID" ]; then
    echo "Failed to create batch. Check if OpenAI API key is configured."
    echo ""
    echo "To configure OpenAI, add to your .env file:"
    echo "   OPENAI_API_KEY=your-api-key-here"
    exit 1
fi

echo "   Batch created with ID: $BATCH_ID"
echo ""

# Check batch status
echo "4. Checking batch status..."
STATUS_RESPONSE=$(curl -s "$BASE_URL/v1/batches/$BATCH_ID")
echo "Response:"
echo "$STATUS_RESPONSE" | jq . 2>/dev/null || echo "$STATUS_RESPONSE"
echo ""

# List all batches
echo "5. Listing all batches..."
LIST_RESPONSE=$(curl -s "$BASE_URL/v1/batches?limit=5")
echo "Response:"
echo "$LIST_RESPONSE" | jq '.data | length' 2>/dev/null && \
echo "   (showing batch count)"
echo ""

# Check for results (will likely be pending)
echo "6. Checking for results..."
RESULTS_RESPONSE=$(curl -s "$BASE_URL/v1/batches/$BATCH_ID/results")
echo "Response:"
echo "$RESULTS_RESPONSE" | jq . 2>/dev/null || echo "$RESULTS_RESPONSE"
echo ""

echo "========================================"
echo "Batch API Demo Complete!"
echo "========================================"
echo ""
echo "The batch is now processing asynchronously."
echo "Batch processing typically completes within 24 hours."
echo ""
echo "To check status later:"
echo "   curl $BASE_URL/v1/batches/$BATCH_ID"
echo ""
echo "To get results when complete:"
echo "   curl $BASE_URL/v1/batches/$BATCH_ID/results"
echo ""
echo "To cancel the batch:"
echo "   curl -X POST $BASE_URL/v1/batches/$BATCH_ID/cancel"
echo ""
echo "Benefits of Batch API:"
echo "   - 50% cost reduction vs. real-time requests"
echo "   - Process up to 50,000 requests per batch"
echo "   - Ideal for data processing, evaluations, embeddings"
echo ""
