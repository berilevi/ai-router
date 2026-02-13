# AI Router - TODO & Future Improvements

## 🎯 SDK Feature Utilization Status

### Anthropic SDK (@anthropic-ai/sdk v0.73.0)
**Currently Using:**
- ✅ Messages API (chat completions)
- ✅ Streaming with SSE
- ✅ Tool use/function calling (manual format conversion)
- ✅ Vision/images (base64 with MIME detection)
- ✅ Token counting (`response.usage`)
- ✅ System messages (native parameter)
- ✅ Error handling
- ✅ **Message Batches API** - Bulk processing (see #13 - COMPLETED ✅)
- ✅ **Prompt Caching** - Cost reduction for repeated prompts (see #14 - COMPLETED ✅)

**Available but NOT Using:**
- ❌ **Tool Runner Helper** - Automatic tool execution loop (we do manual)
- ❌ **MCP Integration** - Model Context Protocol helpers (see #15 below)
- ❌ **Beta Features** - Access to experimental features

### OpenAI SDK (openai v4.73.0)
**Currently Using:**
- ✅ Chat Completions API (streaming & non-streaming)
- ✅ Streaming with SSE
- ✅ Tool use/function calling
- ✅ Vision/images (base64 with MIME detection)
- ✅ Token counting (`response.usage`)
- ✅ Embeddings API (`text-embedding-3-small`)
- ✅ Models API (listing available models)
- ✅ Azure OpenAI compatibility (custom baseURL)
- ✅ Temperature, Top-P, Max tokens controls
- ✅ Error handling

**Available but NOT Using:**
- ❌ **Batch Processing API** - Bulk operations (50% cost reduction, see #17 below)
- ❌ **Responses API** - Next-gen API with better performance (40-80% faster, see #18 below)
- ❌ **Assistants API** - Stateful conversations with knowledge base
- ❌ **Image Generation** - DALL-E integration (see #19 below)
- ❌ **Audio API** - Speech-to-text (Whisper) and text-to-speech
- ❌ **Fine-tuning API** - Custom model training
- ❌ **File Management API** - Upload/manage files for assistants
- ❌ **Moderations API** - Content policy compliance checking
- ❌ **Structured Outputs** - JSON Schema validation
- ❌ **Realtime API** - Low-latency WebSocket connections
- ❌ **Vector Stores API** - Advanced RAG support

### GitHub Copilot SDK (@github/copilot-sdk v0.1.22)
**Currently Using:**
- ✅ CopilotClient (basic initialization)
- ✅ Session management (create/destroy)
- ✅ Streaming (event-based)
- ✅ Authentication (GitHub token + gh CLI)
- ✅ Model discovery (`listModels()`)

**Available but NOT Using:**
- ❌ **Built-in Tools** - Filesystem, Git, Web operations (see #16 below)
- ❌ **Agent Runtime** - Production-tested orchestration (see #16 below)
- ❌ **Custom Tools** - Extensible tool framework
- ❌ **Tool Configuration** - Enable/disable specific capabilities

---

## 📋 TODO Items

### Code Quality

#### 1. ⚠️ Gemini Web DOM Selectors Stability
**Priority:** Medium
**Status:** Not Started

The Gemini Web provider uses DOM selectors that may break if Google updates the UI.

**Tasks:**
- [ ] Add selector versioning or fallback strategies
- [ ] Implement health checks for selector validity
- [ ] Add automated tests that detect selector changes
- [ ] Create fallback selectors for common elements
- [ ] Add monitoring/alerts when selectors fail

**Files:**
- `src/providers/geminiWeb.ts`

---

## 🚀 Nice to Have Features

### 2. 🔄 Additional Provider Support
**Priority:** Low
**Status:** Not Started

Expand support to additional AI providers.

**Potential Providers:**
- [ ] Azure OpenAI (works via OpenAI-compatible, but could be explicit)
- [ ] Google Vertex AI
- [ ] AWS Bedrock (Claude, Titan, etc.)
- [ ] Cohere
- [ ] Mistral AI
- [ ] Together AI
- [ ] Replicate
- [ ] Hugging Face Inference API

**Implementation Notes:**
- Follow the same `BaseProvider` pattern
- Add to `ProviderFactory`
- Update model mappings
- Add configuration in `.env.example`

---

### 3. 📊 Enhanced Monitoring & Observability
**Priority:** Medium
**Status:** Not Started

Improve monitoring capabilities for production deployments.

**Tasks:**
- [ ] Create Grafana dashboards
  - Request rate by provider
  - Error rates and types
  - Response latency histograms
  - Token usage over time
- [ ] Add alert rules
  - Rate limit exceeded
  - Provider unavailability
  - High error rates
  - Slow response times
- [ ] Implement cost tracking
  - Per-provider cost estimation
  - Token-based cost calculation
  - Daily/monthly spending reports
- [ ] Add request latency percentiles
  - p50, p95, p99 metrics
  - Per-provider breakdown
  - Per-model breakdown

**Files:**
- `src/utils/metrics.ts`
- New: `dashboards/grafana/`
- New: `alerts/prometheus/`

---

### 4. 🔐 Authentication & Security
**Priority:** High (for public deployments)
**Status:** Not Started

Add authentication and authorization for the router itself.

**Tasks:**
- [ ] API key authentication for router
  - Generate API keys
  - Key rotation support
  - Key management endpoints
- [ ] Rate limiting per API key
  - Configurable limits per key
  - Different tiers (free, pro, enterprise)
- [ ] Usage quotas
  - Daily/monthly limits
  - Token-based quotas
  - Overage handling
- [ ] Request filtering/sanitization
  - Input validation
  - Content moderation hooks
  - PII detection/redaction

**Files:**
- New: `src/middleware/auth.ts`
- New: `src/utils/apiKeyManager.ts`
- New: `src/middleware/quotas.ts`

---

### 5. 💾 Response Caching Layer
**Priority:** Medium
**Status:** Not Started

Implement intelligent caching to reduce costs and improve response times.

**Note:** Anthropic SDK has built-in prompt caching support that we could leverage (see #14).

**Tasks:**
- [ ] Response caching for identical requests
  - Hash-based cache key generation
  - Configurable TTL
  - Cache hit/miss metrics
- [ ] Embedding cache
  - Persistent storage (Redis?)
  - Semantic similarity search
  - Automatic cache warming
- [ ] TTL-based invalidation
  - Configurable per model/provider
  - Manual cache clearing
- [ ] Cache statistics
  - Hit rate tracking
  - Cost savings calculation

**Files:**
- New: `src/utils/cache.ts`
- New: `src/middleware/cacheMiddleware.ts`

---

### 6. 🌐 Load Balancing & High Availability
**Priority:** Medium
**Status:** Not Started

Improve reliability and distribution of requests.

**Tasks:**
- [ ] Round-robin between multiple API keys
  - Key pool management
  - Automatic failover
  - Health-based key selection
- [ ] Provider fallback chains
  - Define fallback order
  - Automatic retry with next provider
  - Cost-aware fallbacks
- [ ] Geo-based routing
  - Region-aware provider selection
  - Latency optimization
- [ ] Circuit breaker pattern
  - Automatic provider disabling
  - Gradual recovery

**Files:**
- New: `src/utils/loadBalancer.ts`
- Update: `src/utils/retryHandler.ts`

---

### 7. 📝 Advanced Conversation Features
**Priority:** Low
**Status:** Not Started

Add features for better conversation management.

**Tasks:**
- [ ] Conversation persistence/history
  - Database integration (PostgreSQL/MongoDB)
  - Conversation threading
  - Search and retrieval
- [ ] Request replay
  - Save failed requests
  - Manual/automatic replay
  - Debugging tools
- [ ] A/B testing between providers
  - Route same request to multiple providers
  - Compare responses
  - Quality metrics
- [ ] Model performance comparison
  - Side-by-side evaluation
  - Automated benchmarking
  - Response quality scoring

**Files:**
- New: `src/utils/conversationStore.ts`
- New: `src/utils/abTesting.ts`

---

### 8. 🔧 Developer Experience
**Priority:** Medium
**Status:** Not Started

Improve developer experience and documentation.

**Tasks:**
- [ ] OpenAPI/Swagger documentation
  - Auto-generate from code
  - Interactive API explorer
  - Keep in sync with code
- [ ] SDK generation
  - TypeScript/JavaScript SDK
  - Python SDK
  - Go SDK
  - Auto-generated from OpenAPI spec
- [ ] Postman collection
  - All endpoints documented
  - Example requests
  - Environment variables setup
- [ ] More example integrations
  - LangChain integration
  - LlamaIndex integration
  - Vercel AI SDK integration
  - Chrome extension example
  - CLI tool example

**Files:**
- New: `docs/openapi.yaml`
- New: `examples/langchain/`
- New: `examples/llamaindex/`
- New: `sdk/typescript/`
- New: `sdk/python/`

---

### 9. 📚 Documentation Improvements
**Priority:** Medium
**Status:** Not Started

Expand documentation for better adoption and troubleshooting.

**Tasks:**
- [ ] Architecture diagrams
  - System overview
  - Request flow diagrams
  - Provider integration patterns
  - Deployment architectures
- [ ] Deployment guides
  - AWS deployment (ECS, Lambda, EC2)
  - GCP deployment (Cloud Run, GKE)
  - Azure deployment (Container Instances, AKS)
  - DigitalOcean, Railway, Fly.io
- [ ] Troubleshooting guide
  - Common errors and solutions
  - Debug mode usage
  - Log analysis
  - Performance debugging
- [ ] Performance tuning guide
  - Rate limit optimization
  - Memory usage optimization
  - Concurrency settings
  - Provider selection strategies
- [ ] Migration guides
  - From direct provider APIs
  - From OpenAI SDK
  - From Ollama
- [ ] Security best practices
  - API key management
  - Network security
  - Rate limiting strategies

**Files:**
- New: `docs/architecture/`
- New: `docs/deployment/`
- New: `docs/troubleshooting.md`
- New: `docs/performance-tuning.md`

---

### 10. 🧪 Testing Improvements
**Priority:** Medium
**Status:** Partial (82 tests exist)

Expand test coverage and add additional test types.

**Tasks:**
- [ ] Integration tests
  - Real API calls (opt-in)
  - End-to-end flows
  - Provider compatibility tests
- [ ] Performance tests
  - Load testing
  - Stress testing
  - Concurrency testing
- [ ] Contract tests
  - Provider API contract validation
  - Ollama API compatibility validation
  - Anthropic API compatibility validation
- [ ] Visual regression tests (for Gemini Web)
  - Screenshot comparison
  - DOM structure validation
- [ ] Chaos engineering
  - Provider failure simulation
  - Network latency injection
  - Rate limit simulation

**Files:**
- New: `tests/integration/`
- New: `tests/performance/`
- New: `tests/contract/`

---

### 11. 🚢 DevOps & Infrastructure
**Priority:** Low
**Status:** Docker support exists

Improve deployment and infrastructure tooling.

**Tasks:**
- [ ] Kubernetes manifests
  - Deployment YAML
  - Service definitions
  - Ingress configuration
  - ConfigMap/Secret templates
- [ ] Helm chart
  - Parameterized deployments
  - Multiple environments
  - Easy upgrades
- [ ] Terraform modules
  - AWS infrastructure
  - GCP infrastructure
  - Azure infrastructure
- [ ] GitHub Actions workflows
  - CI/CD pipeline
  - Automated testing
  - Docker image builds
  - Release automation
- [ ] Docker Compose for local dev
  - Multi-container setup
  - Redis/PostgreSQL if needed
  - Volume mounts for development

**Files:**
- New: `k8s/`
- New: `helm/`
- New: `terraform/`
- New: `.github/workflows/`

---

### 12. 📊 Analytics & Insights
**Priority:** Low
**Status:** Not Started

Add analytics to understand usage patterns.

**Tasks:**
- [ ] Usage analytics
  - Most popular models
  - Provider usage distribution
  - Peak usage times
- [ ] Quality metrics
  - Response quality tracking
  - User satisfaction scores
  - Error pattern analysis
- [ ] Cost optimization insights
  - Cost per request analysis
  - Cheaper provider recommendations
  - Token usage optimization tips
- [ ] Export capabilities
  - CSV export
  - JSON export
  - API for analytics data

**Files:**
- New: `src/utils/analytics.ts`
- New: `src/routes/analytics.ts`

---

## 🎯 Implementation Priority

### Phase 0 (COMPLETED ✅ - SDK Features Implemented)
**Low Effort, High Value - SDK features already available:**
1. ✅ **Anthropic Prompt Caching (#14)** - COMPLETED (90% cost reduction)
2. ✅ **Anthropic Message Batches (#13)** - COMPLETED (50% cost discount)
3. **MCP Integration (#15)** - Pending (Medium effort, high value for extensibility)
4. **Copilot Agent Runtime (#16)** - Pending (Medium effort, very high value)

### Phase 0.5 (Quick Wins - OpenAI SDK Features)
**Low Effort, High Value - OpenAI SDK features:**
1. **OpenAI Responses API (#18)** - Very low effort, very high value (40-80% faster)
2. **OpenAI Batch API (#17)** - Low effort, high value (50% cost reduction)
3. **Image Generation (#19)** - Low effort, medium value (expands capabilities)
4. **Audio API (#20)** - Medium effort, medium value (multimodal support)

### Phase 1 (Critical for Production)
1. Authentication & Security (#4) - if deploying publicly
2. Enhanced Monitoring (#3) - for production visibility

### Phase 2 (Quality & Reliability)
1. Gemini Web Selector Stability (#1)
2. Response Caching Layer (#5) - complement SDK caching
3. Testing Improvements (#10)

### Phase 3 (Developer Experience)
1. OpenAPI Documentation (#8)
2. Documentation Improvements (#9)
3. DevOps & Infrastructure (#11)

### Phase 4 (Nice to Have)
1. Additional Providers (#2)
2. Load Balancing (#6)
3. Advanced Features (#7)
4. Analytics & Insights (#12)

---

## 📝 Notes

- All items are optional improvements - the current system is **production-ready**
- Prioritize based on your specific use case and deployment scenario
- Many features can be implemented independently
- Consider community contributions for lower-priority items

---

**Last Updated:** 2026-02-13
**Current Version:** 1.0.0
**Status:** ✅ Feature Complete, Ready for Production

**Completed SDK Enhancements:**
- ✅ Anthropic Prompt Caching (#14) - 2026-02-13
- ✅ Anthropic Message Batches API (#13) - 2026-02-13

---

## 🚀 SDK-Specific Enhancements (Low Complexity, High Value)

### 13. ✅ Anthropic Message Batches API [COMPLETED]
**Priority:** Medium
**Status:** ✅ Completed (2026-02-13)
**SDK Support:** ✅ Native Support in @anthropic-ai/sdk

Leverage Anthropic's built-in batch processing for bulk operations.

**Benefits:**
- 50% cost reduction for batch processing
- Process multiple requests efficiently
- Better throughput for batch jobs

**Completed Tasks:**
- [x] Add batch endpoint `/v1/messages/batches`
- [x] Implement batch creation with custom IDs
- [x] Add batch result retrieval (JSONL streaming)
- [x] Add batch status monitoring
- [x] Add batch cancellation
- [x] Add batch listing with pagination
- [x] Document batch API usage (`docs/MESSAGE_BATCHES.md`)
- [x] Create demo script (`examples/batch-demo.sh`)

**Files:**
- ✅ `src/routes/batch.ts`
- ✅ `src/providers/anthropic.ts` (methods: createBatch, getBatch, getBatchResults, listBatches, cancelBatch)
- ✅ `docs/MESSAGE_BATCHES.md`
- ✅ `examples/batch-demo.sh`

**Effort:** Low (SDK already has it)
**Value:** High for bulk processing use cases

---

### 14. ✅ Anthropic Prompt Caching [COMPLETED]
**Priority:** High
**Status:** ✅ Completed (2026-02-13)
**SDK Support:** ✅ Native Support in @anthropic-ai/sdk

Use Anthropic's built-in prompt caching to reduce costs and latency.

**Benefits:**
- Up to 90% cost reduction for repeated prompts
- Faster response times
- Automatic cache management by Anthropic

**Completed Tasks:**
- [x] Add cache control blocks to system messages
- [x] Implement cache breakpoint detection (via `cacheBreakpoints` array)
- [x] Add cache metrics tracking (`cacheCreationInputTokens`, `cacheReadInputTokens`)
- [x] Add `enableCache` and `cacheBreakpoints` options to ChatCompletionOptions
- [x] Document caching best practices (`docs/PROMPT_CACHING.md`)
- [x] Add cache configuration examples
- [x] Create demo script (`examples/caching-demo.sh`)

**Files:**
- ✅ `src/providers/anthropic.ts` (formatMessagesAndSystem, formatUserContent)
- ✅ `src/types/index.ts` (enableCache, cacheBreakpoints options)
- ✅ `docs/PROMPT_CACHING.md`
- ✅ `examples/caching-demo.sh`

**Effort:** Very Low (just enable it)
**Value:** Very High (cost savings)

---

### 15. 🔌 MCP (Model Context Protocol) Integration
**Priority:** Low
**Status:** Not Started
**SDK Support:** ✅ Helper Functions in @anthropic-ai/sdk

Integrate with Model Context Protocol for extensible tool support.

**Benefits:**
- Standardized tool integration
- Rich ecosystem of MCP servers
- Better tool interoperability

**Tasks:**
- [ ] Add MCP server connection support
- [ ] Implement `mcpTools()` helper integration
- [ ] Add `mcpMessages()` conversion
- [ ] Support MCP resources
- [ ] Document MCP configuration

**Implementation:**
```typescript
import { mcpTools } from '@anthropic-ai/sdk/helpers/beta/mcp';

const { tools } = await mcpClient.listTools();
await client.beta.messages.toolRunner({
  tools: mcpTools(tools, mcpClient),
  ...
});
```

**Files:**
- New: `src/utils/mcpIntegration.ts`
- Update: `src/providers/anthropic.ts`

**Effort:** Medium
**Value:** High for extensibility

---

### 16. 🤖 GitHub Copilot Agent Runtime
**Priority:** Medium
**Status:** Not Started
**SDK Support:** ✅ Built-in Agent Runtime

Leverage Copilot SDK's built-in agent capabilities for autonomous workflows.

**Benefits:**
- Production-tested agent orchestration
- Built-in tools (filesystem, git, web)
- Automatic planning and execution
- No manual tool loop management

**Current Limitation:** We only use basic chat, not leveraging agent capabilities.

**Tasks:**
- [ ] Expose agent creation endpoint
- [ ] Enable built-in tools (filesystem, git, web)
- [ ] Add custom tool registration
- [ ] Implement agent session management
- [ ] Add agent configuration options

**Implementation:**
```typescript
// Currently: Basic chat only
const session = await client.createSession({model, streaming});

// Could be: Full agent with tools
const agent = new Agent({
  tools: [fileSystemTool, gitTool, webTool, customTool],
  model: 'gpt-4.1',
});
```

**Files:**
- New: `src/routes/agents.ts`
- Update: `src/providers/copilot.ts`
- New: `src/utils/copilotTools.ts`

**Effort:** Medium
**Value:** Very High (autonomous capabilities)

---

### 17. 📦 OpenAI Batch Processing API
**Priority:** Medium
**Status:** Not Started
**SDK Support:** ✅ Native Support in openai v4

Leverage OpenAI's batch processing for bulk operations with cost savings.

**Benefits:**
- 50% cost reduction for batch processing
- Process up to 50,000 requests per batch
- 24-hour processing window
- Ideal for evaluations, classifications, embeddings

**Tasks:**
- [ ] Add batch endpoint `/api/v1/batches` (OpenAI format)
- [ ] Implement batch creation with JSONL file input
- [ ] Add batch status monitoring
- [ ] Add batch result retrieval
- [ ] Add batch cancellation
- [ ] Document batch API usage for OpenAI

**Implementation:**
```typescript
await client.batches.create({
  input_file_id: fileId,
  endpoint: "/v1/chat/completions",
  completion_window: "24h"
});
```

**Files:**
- New: `src/routes/openai-batch.ts` (or extend existing batch.ts)
- Update: `src/providers/openaiCompatible.ts`

**Effort:** Low (SDK already has it)
**Value:** High for bulk processing, evaluations

---

### 18. 🚀 OpenAI Responses API
**Priority:** High
**Status:** Not Started
**SDK Support:** ✅ Native Support in openai v4 (newer than Chat Completions)

Use the next-generation Responses API for better performance and cost.

**Benefits:**
- 40-80% performance improvement vs Chat Completions
- Lower costs
- State preservation across requests
- Structured reasoning support
- Better for complex workflows

**Tasks:**
- [ ] Add Responses API endpoint
- [ ] Implement state preservation
- [ ] Add reasoning effort controls
- [ ] Migrate high-traffic endpoints to Responses API
- [ ] Document performance comparisons

**Implementation:**
```typescript
await client.responses.create({
  model: "gpt-4.1",
  messages: [...],
  reasoning_effort: "medium"  // min, medium, high
});
```

**Files:**
- New: `src/routes/responses.ts`
- Update: `src/providers/openaiCompatible.ts`

**Effort:** Low
**Value:** Very High (performance + cost savings)

---

### 19. 🎨 OpenAI Image Generation (DALL-E)
**Priority:** Low
**Status:** Not Started
**SDK Support:** ✅ Native Support in openai v4

Add image generation capabilities using DALL-E.

**Benefits:**
- Create images from text prompts
- Generate variations of existing images
- Edit images with text instructions
- Multiple sizes and quality levels

**Tasks:**
- [ ] Add `/api/images/generate` endpoint
- [ ] Add `/api/images/variations` endpoint
- [ ] Add `/api/images/edit` endpoint
- [ ] Support both URL and base64 responses
- [ ] Document image generation API

**Implementation:**
```typescript
await client.images.generate({
  model: "dall-e-3",
  prompt: "A futuristic city at sunset",
  size: "1024x1024",
  quality: "hd"
});
```

**Files:**
- New: `src/routes/images.ts`
- Update: `src/providers/openaiCompatible.ts`

**Effort:** Low
**Value:** Medium (expands capabilities)

---

### 20. 🎙️ OpenAI Audio API
**Priority:** Low
**Status:** Not Started
**SDK Support:** ✅ Native Support in openai v4

Add speech-to-text and text-to-speech capabilities.

**Benefits:**
- Whisper-based transcription/translation
- High-quality text-to-speech
- Multiple voice options
- Various audio formats

**Tasks:**
- [ ] Add `/api/audio/transcriptions` endpoint (Whisper)
- [ ] Add `/api/audio/translations` endpoint
- [ ] Add `/api/audio/speech` endpoint (TTS)
- [ ] Support multiple audio formats
- [ ] Document audio API usage

**Implementation:**
```typescript
// Speech-to-text
await client.audio.transcriptions.create({
  file: audioFile,
  model: "whisper-1"
});

// Text-to-speech
await client.audio.speech.create({
  model: "tts-1",
  voice: "alloy",
  input: "Hello world"
});
```

**Files:**
- New: `src/routes/audio.ts`
- Update: `src/providers/openaiCompatible.ts`

**Effort:** Medium (file handling)
**Value:** Medium (multimodal support)

---

### 21. 🤖 OpenAI Assistants API
**Priority:** Low
**Status:** Not Started
**SDK Support:** ✅ Native Support in openai v4

Add stateful assistant conversations with built-in tools.

**Benefits:**
- Persistent conversation threads
- Built-in code interpreter
- File retrieval and knowledge base
- Function calling
- Vector stores for RAG

**Tasks:**
- [ ] Add `/api/assistants` endpoints
- [ ] Add `/api/threads` endpoints
- [ ] Add `/api/runs` endpoints
- [ ] Support code interpreter
- [ ] Support file retrieval
- [ ] Document assistants API

**Implementation:**
```typescript
const assistant = await client.beta.assistants.create({
  name: "Math Tutor",
  tools: [{type: "code_interpreter"}],
  model: "gpt-4"
});
```

**Files:**
- New: `src/routes/assistants.ts`
- New: `src/utils/assistantManager.ts`

**Effort:** High (complex state management)
**Value:** High (for specific use cases)

---

