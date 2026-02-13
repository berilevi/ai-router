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

**Available but NOT Using:**
- ❌ **Message Batches API** - Bulk processing (see #13 below)
- ❌ **Prompt Caching** - Cost reduction for repeated prompts (see #14 below)
- ❌ **Tool Runner Helper** - Automatic tool execution loop (we do manual)
- ❌ **MCP Integration** - Model Context Protocol helpers (see #15 below)
- ❌ **Beta Features** - Access to experimental features

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

### Phase 0 (Quick Wins - Leverage Existing SDK Features)
**Low Effort, High Value - SDK features already available:**
1. **Anthropic Prompt Caching (#14)** - Very low effort, very high value (90% cost reduction)
2. **Anthropic Message Batches (#13)** - Low effort, high value for bulk processing
3. **MCP Integration (#15)** - Medium effort, high value for extensibility
4. **Copilot Agent Runtime (#16)** - Medium effort, very high value (autonomous workflows)

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

---

## 🚀 SDK-Specific Enhancements (Low Complexity, High Value)

### 13. 📦 Anthropic Message Batches API
**Priority:** Medium
**Status:** Not Started
**SDK Support:** ✅ Native Support in @anthropic-ai/sdk

Leverage Anthropic's built-in batch processing for bulk operations.

**Benefits:**
- Process multiple requests efficiently
- Cost optimization for bulk operations
- Better throughput for batch jobs

**Tasks:**
- [ ] Add batch endpoint `/api/batch`
- [ ] Implement batch creation with custom IDs
- [ ] Add batch result retrieval
- [ ] Add batch status monitoring
- [ ] Document batch API usage

**Implementation:**
```typescript
await client.messages.batches.create({
  requests: [
    { custom_id: 'req-1', params: {...} },
    { custom_id: 'req-2', params: {...} },
  ]
});
```

**Files:**
- New: `src/routes/batch.ts`
- Update: `src/providers/anthropic.ts`

**Effort:** Low (SDK already has it)
**Value:** High for bulk processing use cases

---

### 14. 💰 Anthropic Prompt Caching
**Priority:** High
**Status:** Not Started
**SDK Support:** ✅ Native Support in @anthropic-ai/sdk

Use Anthropic's built-in prompt caching to reduce costs and latency.

**Benefits:**
- Up to 90% cost reduction for repeated prompts
- Faster response times
- Automatic cache management by Anthropic

**Tasks:**
- [ ] Add cache control blocks to system messages
- [ ] Implement cache breakpoint detection
- [ ] Add cache metrics tracking
- [ ] Document caching best practices
- [ ] Add cache configuration options

**Implementation:**
```typescript
// Anthropic automatically caches with special markers
messages: [
  {
    role: "user",
    content: [
      { type: "text", text: longContext, cache_control: { type: "ephemeral" } }
    ]
  }
]
```

**Files:**
- Update: `src/providers/anthropic.ts`
- Update: `src/utils/metrics.ts`

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

