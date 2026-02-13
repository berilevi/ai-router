# Anthropic Prompt Caching

Anthropic's prompt caching feature allows you to reduce costs by up to 90% and improve latency for requests with repeated content.

## How It Works

Anthropic caches the prefixes of your prompts, so repeated context (like system instructions, document contents, or conversation history) doesn't need to be reprocessed on every request.

## Benefits

- **90% Cost Reduction**: Cached tokens cost 90% less than regular input tokens
- **Faster Response Times**: Cached content is processed much faster
- **Automatic Management**: Cache TTL is 5 minutes, managed automatically by Anthropic

## Usage

### Option 1: Auto-caching (Simplest)

Enable caching on all system messages and the last user message:

```bash
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "enableCache": true,
    "system": "You are a helpful assistant with extensive knowledge...",
    "messages": [
      {"role": "user", "content": "Tell me about quantum computing"}
    ]
  }'
```

### Option 2: Custom Cache Breakpoints

Specify exactly which messages to cache by index:

```bash
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "enableCache": true,
    "cacheBreakpoints": [0, 2, 4],
    "system": "You are a helpful assistant...",
    "messages": [
      {"role": "user", "content": "Here is a long document: ..."},  // Index 0 - cached
      {"role": "assistant", "content": "I understand."},            // Index 1
      {"role": "user", "content": "More context: ..."},             // Index 2 - cached
      {"role": "assistant", "content": "Got it."},                  // Index 3
      {"role": "user", "content": "Now answer this: ..."}           // Index 4 - cached
    ]
  }'
```

## Cache Metrics

The response includes cache statistics:

```json
{
  "content": "...",
  "usage": {
    "promptTokens": 1000,
    "completionTokens": 500,
    "totalTokens": 1500,
    "cacheCreationInputTokens": 800,    // Tokens written to cache (first request)
    "cacheReadInputTokens": 0            // Tokens read from cache (subsequent requests)
  }
}
```

On subsequent requests with the same cached content:

```json
{
  "usage": {
    "promptTokens": 200,                 // Only new tokens
    "cacheCreationInputTokens": 0,
    "cacheReadInputTokens": 800          // Tokens read from cache (90% cheaper!)
  }
}
```

## Best Practices

### 1. Cache Long, Stable Content

Cache content that:
- Is longer than 1024 tokens (minimum for caching)
- Doesn't change between requests
- Is repeated across multiple requests

**Examples:**
- System instructions
- Document contents for Q&A
- Conversation history up to recent messages
- Tool/function definitions

### 2. Strategic Breakpoint Placement

```javascript
// Example: Document Q&A system
{
  enableCache: true,
  cacheBreakpoints: [0],  // Cache the document
  messages: [
    {
      role: "user",
      content: `Document: ${largeDocument}`,  // This gets cached
    },
    {
      role: "user",
      content: `Question: ${userQuestion}`,   // This changes each time
    }
  ]
}
```

### 3. Multi-turn Conversations

```javascript
{
  enableCache: true,
  cacheBreakpoints: [conversationHistory.length - 2],  // Cache all but last 2 messages
  messages: [
    ...conversationHistory,  // Cached
    { role: "user", content: newQuestion }  // Fresh
  ]
}
```

## Cache Behavior

- **TTL**: 5 minutes (managed by Anthropic)
- **Minimum Size**: 1024 tokens (smaller content won't be cached)
- **Cache Key**: Based on exact text and position in prompt
- **Invalidation**: Automatic after TTL or if prompt structure changes

## Cost Savings Example

**Without Caching:**
- Input: 10,000 tokens × $3/MTok = $0.03
- Output: 500 tokens × $15/MTok = $0.0075
- **Total: $0.0375 per request**

**With Caching (after first request):**
- Cached Input: 9,000 tokens × $0.30/MTok = $0.0027 (90% discount!)
- Fresh Input: 1,000 tokens × $3/MTok = $0.003
- Output: 500 tokens × $15/MTok = $0.0075
- **Total: $0.0132 per request**

**Savings: 65% reduction on overall request cost**

## Limitations

- Only available for Claude 3.5 Sonnet and Claude 3 Opus
- Minimum 1024 tokens to trigger caching
- Cache only applies to prompt prefix, not middle sections
- 5-minute TTL cannot be customized

## Monitoring Cache Usage

Check cache metrics in:

1. **Response usage object** (see above)
2. **Logs**: Look for cache_creation and cache_read metrics
3. **Metrics endpoint**: `GET /metrics` includes cache hit rates

```bash
# Check overall cache performance
curl http://localhost:11434/metrics | grep cache
```

## Ollama API Extension

The cache parameters are extensions to the standard Ollama API:

```typescript
interface ChatRequest {
  model: string;
  messages: Message[];
  // Standard Ollama fields...

  // Anthropic extensions:
  enableCache?: boolean;         // Enable caching
  cacheBreakpoints?: number[];   // Message indices to cache
}
```

## Technical Details

When `enableCache: true`:
- System prompts get `cache_control: { type: "ephemeral" }`
- Messages at breakpoints get cache markers
- Anthropic SDK handles cache management automatically

Cache markers are added to content blocks:

```typescript
{
  type: "text",
  text: "Your content here...",
  cache_control: { type: "ephemeral" }
}
```

## Troubleshooting

**Q: Cache not working?**
- Ensure content is >1024 tokens
- Check model supports caching (3.5 Sonnet, 3 Opus)
- Verify exact same content on subsequent requests

**Q: How to verify caching is active?**
- Check `cacheCreationInputTokens` > 0 on first request
- Check `cacheReadInputTokens` > 0 on subsequent requests

**Q: Cache hit rate low?**
- Ensure prompt structure is identical between requests
- Only vary the non-cached portions
- Check cache TTL hasn't expired (5 min)

## References

- [Anthropic Prompt Caching Documentation](https://docs.anthropic.com/claude/docs/prompt-caching)
- [Anthropic SDK Caching Support](https://github.com/anthropics/anthropic-sdk-typescript)
