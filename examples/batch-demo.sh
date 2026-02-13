#!/bin/bash

# Anthropic Message Batches Demo
# Demonstrates 50% cost reduction for bulk processing

echo "=== Anthropic Message Batches Demo ==="
echo ""
echo "This demo shows how batch processing reduces costs by 50% for bulk operations."
echo ""

# Example 1: Create a batch
echo "1. Creating a batch with 3 requests:"
BATCH_RESPONSE=$(curl -s -X POST http://localhost:5000/v1/messages/batches \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      {
        "custom_id": "sentiment-1",
        "params": {
          "model": "claude-3-5-sonnet-20241022",
          "max_tokens": 1024,
          "messages": [
            {"role": "user", "content": "Analyze the sentiment of this review: This product exceeded my expectations! Great quality and fast shipping."}
          ]
        }
      },
      {
        "custom_id": "sentiment-2",
        "params": {
          "model": "claude-3-5-sonnet-20241022",
          "max_tokens": 1024,
          "messages": [
            {"role": "user", "content": "Analyze the sentiment of this review: Disappointed with the purchase. Poor quality and arrived late."}
          ]
        }
      },
      {
        "custom_id": "sentiment-3",
        "params": {
          "model": "claude-3-5-sonnet-20241022",
          "max_tokens": 1024,
          "messages": [
            {"role": "user", "content": "Analyze the sentiment of this review: Average product, nothing special. Got what I paid for."}
          ]
        }
      }
    ]
  }')

echo "$BATCH_RESPONSE" | jq '.'
BATCH_ID=$(echo "$BATCH_RESPONSE" | jq -r '.id')

echo ""
echo "Batch created with ID: $BATCH_ID"
echo ""

# Example 2: Check batch status
echo "2. Checking batch status:"
sleep 2
curl -s http://localhost:5000/v1/messages/batches/$BATCH_ID | jq '.'

echo ""
echo ""

# Example 3: List all batches
echo "3. Listing all batches:"
curl -s http://localhost:5000/v1/messages/batches | jq '.'

echo ""
echo ""

# Example 4: Wait for completion and get results
echo "4. Waiting for batch completion (polling every 5 seconds)..."
while true; do
  STATUS=$(curl -s http://localhost:11434/v1/messages/batches/$BATCH_ID | jq -r '.processing_status')
  echo "Status: $STATUS"

  if [ "$STATUS" = "ended" ]; then
    echo ""
    echo "Batch completed! Retrieving results:"
    echo ""
    curl -s http://localhost:11434/v1/messages/batches/$BATCH_ID/results
    break
  fi

  sleep 5
done

echo ""
echo ""
echo "=== Cost Comparison ==="
echo "Standard API: 3 requests × $0.045 = $0.135"
echo "Batch API:    3 requests × $0.0225 = $0.0675 (50% discount!)"
echo "Savings:      $0.0675 (50% reduction)"
echo ""
