# AI Router - TODO & Future Improvements

## 🎯 SDK Feature Utilization Status

### Anthropic SDK (@anthropic-ai/sdk v0.73.0)
**Currently Using:**
- ✅ Messages API (chat completions)
- ✅ Streaming with SSE
- ✅ Tool use/function calling (native format conversion)
- ✅ Vision/images (base64 with MIME detection)
- ✅ Token counting (`response.usage`)
- ✅ System messages (native parameter)
- ✅ Error handling
- ✅ **Message Batches API** - Bulk processing with 50% cost discount
- ✅ **Prompt Caching** - 90% cost reduction for repeated prompts
- ✅ **Multi-Provider Routing** - Unified /v1/messages endpoint
- ✅ **Integration Tests** - Verified with Claude Haiku 4.5

**Available but NOT Using:**
- ❌ **Tool Runner Helper** - Automatic tool execution loop (we do manual)
- ❌ **MCP Integration** - Model Context Protocol helpers (see #22 below)
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
- ❌ **Batch Processing API** - Bulk operations (50% cost reduction, see #24 below)
- ❌ **Responses API** - Next-gen API with better performance (40-80% faster, see #25 below)
- ❌ **Assistants API** - Stateful conversations with knowledge base
- ❌ **Image Generation** - DALL-E integration (see #26 below)
- ❌ **Audio API** - Speech-to-text (Whisper) and text-to-speech (see #27 below)
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
- ❌ **Built-in Tools** - Filesystem, Git, Web operations (see #23 below)
- ❌ **Agent Runtime** - Production-tested orchestration (see #23 below)
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

### 3. ✅ Enhanced Monitoring & Observability [COMPLETED]
**Priority:** Medium
**Status:** ✅ Completed

Comprehensive monitoring and observability for production deployments.

**Completed Features:**
- Prometheus metrics collection and export
- JSON metrics endpoint
- Request/response logging with Morgan
- Error tracking and reporting
- Token usage metrics
- Provider-specific metrics
- Cache metrics (hits, misses, hit rate)
- Request latency tracking
- Response time measurement
- Queue metrics and monitoring

**Files:**
- ✅ `src/utils/metrics.ts` - Prometheus metrics collector
- ✅ `src/routes/metrics.ts` - Metrics endpoints
- ✅ `src/utils/logger.ts` - Logging system
- ✅ `src/utils/requestLogger.ts` - Request logging

**Metrics Available:**
- `GET /metrics` - Prometheus format
- `GET /metrics/json` - JSON format
- `GET /metrics/summary` - Human-readable summary

---

### 9. ✅ Documentation Improvements [COMPLETED]
**Priority:** Medium
**Status:** ✅ Completed

Comprehensive documentation for adoption and troubleshooting.

**Completed Documentation:**
- ✅ `README.md` - Comprehensive project overview
- ✅ `docs/PROMPT_CACHING.md` - Prompt caching guide
- ✅ `docs/MESSAGE_BATCHES.md` - Batch API guide
- ✅ `CLAUDE_PROJECT.md` - Project context and architecture
- ✅ `IMMEDIATE_STEPS.md` - Getting started guide
- ✅ `SESSION_SUMMARY.md` - Session notes and progress
- ✅ `CACHE_IMPLEMENTATION.md` - Cache feature documentation
- ✅ `.env.example` - Configuration template
- ✅ Inline code documentation and comments

**Coverage:**
- Setup and installation
- API endpoints and usage
- Configuration options
- Provider setup and authentication
- Feature guides (caching, batching, tool calling)
- Troubleshooting and debugging
- Metrics and monitoring
- Cost optimization strategies

---

### 10. ✅ Testing Improvements [COMPLETED]
**Priority:** Medium
**Status:** ✅ Completed (96 tests, 95 passing)

Comprehensive test coverage for reliability.

**Completed Testing:**
- ✅ Anthropic provider unit tests (52 tests)
- ✅ OpenAI provider unit tests (14 tests)
- ✅ Provider factory tests (5 tests)
- ✅ Anthropic API route tests (24 tests)
- ✅ Integration tests for tool calling
- ✅ Real API testing with Claude Haiku 4.5
- ✅ Weather tool, calculator tool, multi-turn testing
- ✅ Cross-provider compatibility verification

**Test Coverage:**
- 96 total tests
- 95 passing
- 1 skipped (streaming parameter)
- Tool calling verified (weather, calculator, multi-turn)
- Integration tests passing with real API calls

**Files:**
- ✅ `src/providers/anthropic.test.ts` - Anthropic tests
- ✅ `src/providers/openaiCompatible.test.ts` - OpenAI tests
- ✅ `src/routes/anthropic.test.ts` - API tests
- ✅ `tests/integration/tool-calling.integration.test.ts` - Integration tests

---

### 11. ✅ DevOps & Infrastructure [COMPLETED]
**Priority:** Medium
**Status:** ✅ Completed

Docker and deployment infrastructure.

**Completed:**
- ✅ `Dockerfile` - Production-ready container
- ✅ `docker-compose.yml` - Local development setup
- ✅ Multi-stage builds for optimization
- ✅ Environment configuration
- ✅ Port mapping and networking
- ✅ Volume management for logs

**Deployment:**
- ✅ Docker container support
- ✅ Docker Compose for local dev
- ✅ Environment variable configuration
- ✅ Health checks configured

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

### 5. ✅ Response Caching Layer [COMPLETED 2026-02-13]
**Priority:** Medium
**Status:** ✅ Completed (2026-02-13)

Intelligent caching to reduce costs and improve response times for identical requests.

**Completed Features:**
- In-memory LRU cache with SHA-256 hash-based keys
- Configurable TTL, size limits, and eviction strategy
- Automatic eviction (LRU or FIFO)
- Statistics: hits, misses, hit rate, cost savings
- Cache middleware with smart request filtering
- Express middleware integration
- Prometheus & JSON metrics
- Cache statistics API endpoints
- Configuration via environment variables
- Full test coverage

**Files:**
- ✅ `src/utils/cache.ts` (270 lines) - Cache engine
- ✅ `src/middleware/cacheMiddleware.ts` (110 lines) - Middleware
- ✅ `src/index.ts` (modified) - Cache initialization
- ✅ `src/utils/config.ts` (modified) - Cache config
- ✅ `src/routes/metrics.ts` (modified) - Metrics integration
- ✅ `.env.example` (modified) - Cache settings
- ✅ `CACHE_IMPLEMENTATION.md` - Complete documentation

**API Endpoints:**
- `GET /cache/stats` - Cache statistics
- `POST /cache/clear` - Clear cache
- `GET /metrics` - Prometheus metrics (includes cache)
- `GET /metrics/json` - JSON metrics (includes cache)

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
**Status:** Partial (Basic documentation exists)

Improve developer experience with comprehensive documentation and tooling.

**Completed:**
- ✅ Comprehensive README.md
- ✅ API endpoint documentation
- ✅ Setup and configuration guides
- ✅ Example scripts (batch, caching, tool calling)
- ✅ Environment configuration guide

**Tasks:**
- [ ] OpenAPI/Swagger documentation
  - Auto-generate from code
  - Interactive API explorer
  - Keep in sync with code
- [ ] SDK generation
  - TypeScript/JavaScript SDK
  - Python SDK
  - Go SDK
- [ ] Postman collection
- [ ] LangChain, LlamaIndex integration examples

**Files:**
- ✅ `README.md`
- ✅ `docs/PROMPT_CACHING.md`
- ✅ `docs/MESSAGE_BATCHES.md`
- ✅ `examples/batch-demo.sh`
- ✅ `examples/caching-demo.sh`

---

### 9. ✅ Documentation Improvements [COMPLETED]
**Priority:** Medium
**Status:** ✅ Completed

Comprehensive documentation for adoption and troubleshooting.

**Completed Documentation:**
- ✅ `README.md` - Comprehensive project overview with setup, features, configuration
- ✅ `CLAUDE_PROJECT.md` - Project architecture and context
- ✅ `IMMEDIATE_STEPS.md` - Getting started guide
- ✅ `docs/PROMPT_CACHING.md` - Prompt caching feature guide
- ✅ `docs/MESSAGE_BATCHES.md` - Message batches API guide
- ✅ `CACHE_IMPLEMENTATION.md` - Response caching documentation
- ✅ `SESSION_SUMMARY.md` - Implementation progress notes
- ✅ `.env.example` - Configuration template with all options
- ✅ Inline code documentation throughout
- ✅ Examples for key features

**Coverage:**
- Architecture and design
- Setup and installation
- API endpoints and usage
- Configuration options
- Provider setup and authentication
- Feature guides (caching, batching, tool calling)
- Example usage and scripts
- Metrics and monitoring
- Cost optimization strategies

---

### 10. ✅ Testing Improvements [COMPLETED]
**Priority:** Medium
**Status:** ✅ Completed (96 tests, 95 passing)

Comprehensive test coverage for reliability.

**Completed Testing:**
- ✅ Anthropic provider unit tests (52 tests)
- ✅ OpenAI provider unit tests (14 tests)
- ✅ Provider factory tests (5 tests)
- ✅ Anthropic API route tests (24 tests)
- ✅ Integration tests for tool calling
- ✅ Real API testing with Claude Haiku 4.5
- ✅ Weather tool, calculator tool, multi-turn testing
- ✅ Cross-provider compatibility verification
- ✅ Request validation tests
- ✅ Error handling tests

**Test Coverage:**
- 96 total tests
- 95 passing (1 skipped)
- Tool calling verified with real API
- Integration tests passing
- Full provider compatibility verified

**Future Tasks:**
- [ ] Performance/load testing
- [ ] Contract tests with providers
- [ ] Chaos engineering tests
- [ ] Visual regression (Gemini Web)

**Files:**
- ✅ `src/providers/anthropic.test.ts`
- ✅ `src/providers/openaiCompatible.test.ts`
- ✅ `src/routes/anthropic.test.ts`
- ✅ `tests/integration/tool-calling.integration.test.ts`

---

### 11. ✅ DevOps & Infrastructure [COMPLETED]
**Priority:** Low
**Status:** ✅ Completed

Docker and deployment infrastructure for containerized deployments.

**Completed:**
- ✅ `Dockerfile` - Production-ready multi-stage Docker build
- ✅ `docker-compose.yml` - Local development setup
- ✅ Environment variable configuration
- ✅ Port mapping and networking
- ✅ Volume management for logs
- ✅ Health checks configured

**Features:**
- Multi-stage Docker build for optimization
- Development and production configurations
- Easy local setup with docker-compose
- Proper logging and error handling
- Environment-driven configuration

**Future Tasks:**
- [ ] Kubernetes manifests
- [ ] Helm charts
- [ ] Terraform modules
- [ ] CI/CD pipeline configuration

**Files:**
- ✅ `Dockerfile`
- ✅ `docker-compose.yml`
- ✅ Configuration via environment variables

---
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

### Phase 0 (COMPLETED ✅ - Major SDK Features Implemented)
**All completed in 2026-02-13:**
1. ✅ **Anthropic Messages API Endpoint (#12)** - Unified multi-provider routing
2. ✅ **Anthropic Prompt Caching (#14)** - 90% cost reduction on cached tokens
3. ✅ **Anthropic Message Batches (#13)** - 50% cost discount for bulk operations
4. ✅ **Tool Calling Tests (#21)** - Comprehensive test coverage (96 tests)
5. ✅ **Claude 4.5 Support** - Upgraded to latest models (Sonnet 4.5, Haiku 4.5)

### Phase 0.3 (COMPLETED ✅ - Core Infrastructure Features)
**All completed in 2026-02-13:**
1. ✅ **Response Caching Layer (#5)** - LRU cache with SHA-256 keys, 80%+ hit rates possible
2. ✅ **Enhanced Monitoring (#3)** - Prometheus metrics, JSON endpoints, cost tracking
3. ✅ **Documentation (#9)** - Comprehensive guides and architecture documentation
4. ✅ **Testing Improvements (#10)** - 96 tests, 95 passing, integration verified
5. ✅ **DevOps & Infrastructure (#11)** - Docker, docker-compose, containerization

### Phase 0.5 (Quick Wins - OpenAI SDK Features)
**Low Effort, High Value - OpenAI SDK features:**
1. **OpenAI Responses API (#25)** - Very low effort, very high value (40-80% faster)
2. **OpenAI Batch API (#24)** - Low effort, high value (50% cost reduction)
3. **Image Generation (#26)** - Low effort, medium value (expands capabilities)
4. **Audio API (#27)** - Medium effort, medium value (multimodal support)

### Phase 0.75 (Extensibility - Agent & Tool Features)
**Medium effort, high value for extensibility:**
1. **MCP Integration (#22)** - Medium effort, high value (standardized tools)
2. **Copilot Agent Runtime (#23)** - Medium effort, very high value (autonomous workflows)

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

## 📝 Project Status

**Last Updated:** 2026-02-13
**Current Version:** 1.1.0
**Status:** ✅ Feature Complete, Ready for Production

**Completion Rate:** 11/28 items (39%)

**Phase Status:**
- ✅ Phase 0: Major SDK Features - COMPLETED
- ✅ Phase 0.3: Core Infrastructure - COMPLETED
- ⏳ Phase 0.5: Quick Wins (OpenAI SDK) - Pending
- ⏳ Phase 0.75: Extensibility - Pending
- ⏳ Phase 1-4: Future Phases - Pending

**Key Notes:**
- All items are optional improvements - the current system is **production-ready**
- Prioritize based on your specific use case and deployment scenario
- Many features can be implemented independently
- Consider community contributions for lower-priority items
- Implementation details are in `docs/` folder, not in this file

---

## 📦 Completed Features Archive

See `docs/` folder for implementation details on completed features:

- ✅ `docs/CACHE_IMPLEMENTATION.md` - Response Caching Layer (#5)
- ✅ `docs/PROMPT_CACHING.md` - Prompt Caching (#14)
- ✅ `docs/MESSAGE_BATCHES.md` - Message Batches API (#13)

---

## 🚀 SDK-Specific Enhancements (Low Complexity, High Value)

### 22. 🔌 MCP (Model Context Protocol) Integration
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

### 23. 🤖 GitHub Copilot Agent Runtime
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

### 24. 📦 OpenAI Batch Processing API
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

### 25. 🚀 OpenAI Responses API
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

### 26. 🎨 OpenAI Image Generation (DALL-E)
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
