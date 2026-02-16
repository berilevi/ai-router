# Anthropic Prompt Caching

Anthropic's prompt caching feature allows you to reduce costs by up to 90% and improve latency for requests with repeated content.

## How It Works

Anthropic caches the prefixes of your prompts, so repeated context (like system instructions, document contents, or conversation history) doesn't need to be reprocessed on every request.

## Benefits

- **90% Cost Reduction**: Cached tokens cost 90% less than regular input tokens
- **Faster Response Times**: Cached content is processed much faster
- **Automatic Management**: Cache TTL is 5 minutes, managed automatically by Anthropic

## Configuration

### Global Settings (Recommended)

Enable automatic caching for all Anthropic requests via environment variables:

```bash
# Enable automatic prompt caching (default: true)
ANTHROPIC_ENABLE_CACHE=true

# Minimum tokens to enable caching (default: 1024)
ANTHROPIC_CACHE_MIN_TOKENS=1024

# Auto-cache system prompts (default: true, recommended)
ANTHROPIC_CACHE_SYSTEM_PROMPT=true

# Auto-cache last user message (default: false, keep disabled)
# User messages are typically unique - caching them costs 25% MORE
# Only enable for special cases with repeated content
ANTHROPIC_CACHE_LAST_MESSAGE=false
```

**Why these defaults?**
- ✅ **System prompts** rarely change (high reuse rate = cost savings)
- ❌ **Last message** usually unique (low reuse rate = cost increase)
- ⚠️ Cache writes cost 25% MORE than regular tokens - only cache repeated content

**Benefits:**
- ✅ Automatic cost savings without client changes
- ✅ Smart defaults (only caches when ≥1024 tokens)
- ✅ Backward compatible (clients don't need to know about caching)
- ✅ Client can override per-request

**How it works:**
1. Router checks if prompt is large enough (≥1024 tokens)
2. If yes, automatically adds `cache_control` to system prompt
3. Client receives same response format with cache metrics
4. Subsequent requests with same system prompt read from cache (90% cheaper!)

## Usage

### Option 1: Use Global Settings (Automatic)

Just make normal requests - caching happens automatically:

```bash
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "system": "You are a helpful assistant with extensive knowledge...",  # Auto-cached if ≥1024 tokens
    "messages": [
      {"role": "user", "content": "Tell me about quantum computing"}
    ]
  }'
```

No `enableCache` flag needed!

### Option 2: Client-Controlled Caching

Override global settings per-request:

```bash
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "enableCache": true,     # Explicitly enable
    "system": "You are a helpful assistant with extensive knowledge...",
    "messages": [
      {"role": "user", "content": "Tell me about quantum computing"}
    ]
  }'
```

### Option 3: Custom Cache Breakpoints

Specify exactly which messages to cache by index:

```bash
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
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

### Option 4: Disable Caching Per-Request

Disable even if global settings enable it:

```bash
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "enableCache": false,    # Override global setting
    "system": "Short prompt that changes every time",
    "messages": [...]
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

## Comparison: CACHE_ENABLED vs ANTHROPIC_ENABLE_CACHE

AI Router has **two complementary caching layers**. Both are recommended for maximum cost savings:

### Layer 1: CACHE_ENABLED (Response Cache - Router Level)

| Aspect | Details |
|--------|---------|
| **What it caches** | Complete API responses (entire answer) |
| **Scope** | Works with ALL providers (Anthropic, OpenAI, Gemini, Copilot) |
| **Cost** | FREE - no API charges |
| **TTL** | Configurable (default: 1 hour) |
| **How it works** | If two clients send identical requests, the second uses the cached response from the first |
| **Env var** | `CACHE_ENABLED=true` |
| **Config** | `CACHE_TTL_MS`, `CACHE_MAX_SIZE_BYTES`, `CACHE_MAX_ENTRIES`, `CACHE_STRATEGY` |

**Example:** Your app processes the same document Q&A request twice in 10 minutes. The router caches the first response and serves it instantly on the second request, bypassing the API entirely.

### Layer 2: ANTHROPIC_ENABLE_CACHE (Prompt Cache - Anthropic Server Level)

| Aspect | Details |
|--------|---------|
| **What it caches** | Prompt prefixes on Anthropic's servers |
| **Scope** | Anthropic only (claude models) |
| **Cost** | 90% cheaper for cached tokens (paid but discounted) |
| **TTL** | 5 minutes (Anthropic-managed, not configurable) |
| **How it works** | Client sends repeated system prompt/context → Anthropic caches prefix → subsequent requests reuse cache at 90% discount |
| **Env var** | `ANTHROPIC_ENABLE_CACHE=true` |
| **Config** | `ANTHROPIC_CACHE_MIN_TOKENS`, `ANTHROPIC_CACHE_SYSTEM_PROMPT`, `ANTHROPIC_CACHE_LAST_MESSAGE` |

**Example:** Your app processes 100 document Q&A requests with the same system prompt and document (but different questions). First request writes to cache (full cost). Requests 2-100 read from cache (90% cheaper each).

### Why Both Are Needed

| Scenario | CACHE_ENABLED Helps | ANTHROPIC_ENABLE_CACHE Helps | Savings |
|----------|-------------------|------------------------------|---------|
| **Identical request (system + context + question)** | ✅ Yes (cached response) | ✅ Yes (100% hit rate) | 100% (no API call) |
| **Same context, different question** | ❌ No (different request) | ✅ Yes (cache prefix) | 75-90% on tokens |
| **Different context, no cache hit** | ❌ No | ❌ No | 0% (full cost) |
| **Request after 1+ hours** | ❌ No (TTL expired) | ✅ Yes (always within 5 min of reuse) | Depends on Anthropic cache |

### Recommendation

- **Always enable both**: `CACHE_ENABLED=true` + `ANTHROPIC_ENABLE_CACHE=true`
- **Default behavior is optimal**:
  - Router cache eliminates duplicate API calls (fastest, freest)
  - Anthropic cache reduces token costs when context repeats (default: system prompt only)
- **Combined savings**:
  - Identical requests: 100% savings (cached response)
  - Repeated context: 75-90% savings on tokens (prompt prefix cached)
  - Unique requests: 0% savings (but no harm from having caching enabled)

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
