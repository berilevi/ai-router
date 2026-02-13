#!/bin/bash

# Gemini-Ollama Bridge - cURL Examples
# This file contains example cURL commands for interacting with the bridge

OLLAMA_URL="http://localhost:11434"

echo "======================================"
echo "Gemini-Ollama Bridge cURL Examples"
echo "======================================"
echo ""

# 1. Health Check
echo "1. Health Check"
echo "---------------"
curl -s "$OLLAMA_URL/health" | jq .
echo ""

# 2. List Available Models
echo "2. List Available Models"
echo "------------------------"
curl -s "$OLLAMA_URL/api/tags" | jq .
echo ""

# 3. Generate Completion (Non-streaming)
echo "3. Generate Completion (Non-streaming)"
echo "--------------------------------------"
curl -s -X POST "$OLLAMA_URL/api/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-flash",
    "prompt": "Explain quantum computing in simple terms:",
    "stream": false,
    "options": {
      "temperature": 0.7
    }
  }' | jq .
echo ""

# 4. Generate Completion (Streaming)
echo "4. Generate Completion (Streaming)"
echo "----------------------------------"
echo "Streaming response:"
curl -s -X POST "$OLLAMA_URL/api/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-pro",
    "prompt": "Write a haiku about AI:",
    "stream": true
  }'
echo ""
echo ""

# 5. Chat Completion (Non-streaming)
echo "5. Chat Completion (Non-streaming)"
echo "----------------------------------"
curl -s -X POST "$OLLAMA_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful coding assistant."
      },
      {
        "role": "user",
        "content": "How do I reverse a string in JavaScript?"
      }
    ],
    "stream": false
  }' | jq .
echo ""

# 6. Chat Completion (Streaming)
echo "6. Chat Completion (Streaming)"
echo "------------------------------"
echo "Streaming response:"
curl -s -X POST "$OLLAMA_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet",
    "messages": [
      {
        "role": "user",
        "content": "Tell me a short joke about programming."
      }
    ],
    "stream": true
  }'
echo ""
echo ""

# 7. Generate Embeddings
echo "7. Generate Embeddings"
echo "----------------------"
curl -s -X POST "$OLLAMA_URL/api/embed" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-flash",
    "input": "The quick brown fox jumps over the lazy dog"
  }' | jq .
echo ""

# 8. Show Model Info
echo "8. Show Model Info"
echo "------------------"
curl -s -X POST "$OLLAMA_URL/api/show" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "gemini-1.5-pro"
  }' | jq .
echo ""

# 9. Pull Model (no-op for bridge)
echo "9. Pull Model (no-op)"
echo "---------------------"
curl -s -X POST "$OLLAMA_URL/api/pull" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "gemini-flash",
    "stream": false
  }' | jq .
echo ""

# 10. Multi-turn Conversation
echo "10. Multi-turn Conversation"
echo "---------------------------"
curl -s -X POST "$OLLAMA_URL/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "system",
        "content": "You are a helpful assistant."
      },
      {
        "role": "user",
        "content": "What is the capital of France?"
      },
      {
        "role": "assistant",
        "content": "The capital of France is Paris."
      },
      {
        "role": "user",
        "content": "What is its population?"
      }
    ],
    "stream": false
  }' | jq .
echo ""

# 11. Using with System Prompt
echo "11. Using with System Prompt"
echo "----------------------------"
curl -s -X POST "$OLLAMA_URL/api/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-flash",
    "system": "You are an expert in Python programming. Provide concise, code-focused answers.",
    "prompt": "How do I use list comprehensions?",
    "stream": false
  }' | jq .
echo ""

echo "======================================"
echo "All examples completed!"
echo "======================================"
