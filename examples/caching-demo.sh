#!/bin/bash

# Anthropic Prompt Caching Demo
# Demonstrates 90% cost reduction on repeated context

echo "=== Anthropic Prompt Caching Demo ==="
echo ""
echo "This demo shows how prompt caching reduces costs for repeated content."
echo ""

# Example 1: Simple caching with system prompt
echo "1. First request (creates cache):"
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "enableCache": true,
    "system": "You are a helpful AI assistant with extensive knowledge of quantum computing, particle physics, and advanced mathematics. Your responses should be detailed, accurate, and pedagogical.",
    "messages": [
      {"role": "user", "content": "What is quantum entanglement?"}
    ]
  }' | jq '.usage'

echo ""
echo "Note the 'cacheCreationInputTokens' - these tokens are now cached!"
echo ""
sleep 2

# Example 2: Second request (uses cache)
echo "2. Second request with same system prompt (reads from cache):"
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "enableCache": true,
    "system": "You are a helpful AI assistant with extensive knowledge of quantum computing, particle physics, and advanced mathematics. Your responses should be detailed, accurate, and pedagogical.",
    "messages": [
      {"role": "user", "content": "What is superposition?"}
    ]
  }' | jq '.usage'

echo ""
echo "Note the 'cacheReadInputTokens' - 90% cheaper than regular tokens!"
echo ""

# Example 3: Document Q&A with cache breakpoints
echo "3. Document Q&A with strategic caching:"
curl -X POST http://localhost:5000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "enableCache": true,
    "cacheBreakpoints": [0],
    "messages": [
      {
        "role": "user",
        "content": "Document: Quantum computing is a type of computation that harnesses the collective properties of quantum states, such as superposition, interference, and entanglement, to perform calculations. The devices that perform quantum computations are known as quantum computers. Though current quantum computers are too small to outperform usual (classical) computers for practical applications, they are believed to be capable of solving certain computational problems, such as integer factorization (which underlies RSA encryption), substantially faster than classical computers."
      },
      {
        "role": "user",
        "content": "Question: What makes quantum computers potentially faster than classical computers?"
      }
    ]
  }' | jq '.usage'

echo ""
echo "The document content is cached (index 0), while questions can vary!"
echo ""
