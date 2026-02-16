# AI Router - Pending TODO Items

**Last Updated:** 2026-02-16
**Completion Rate:** 13/28 (46%)
**Status:** Production Ready

See `docs/` folder for completed feature implementations.

---

## Pending Items

### 1. Gemini Web DOM Selectors Stability
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

### 2. Additional Provider Support
**Priority:** Low
**Status:** Not Started

Expand support to additional AI providers.

**Potential Providers:**
- [ ] Azure OpenAI (explicit support)
- [ ] Google Vertex AI
- [ ] AWS Bedrock
- [ ] Cohere
- [ ] Mistral AI
- [ ] Together AI
- [ ] Replicate
- [ ] Hugging Face Inference API

---

### 4. Authentication & Security
**Priority:** High (for public deployments)
**Status:** Not Started

Add authentication and authorization for the router itself.

**Tasks:**
- [ ] API key authentication
- [ ] Rate limiting per API key
- [ ] Usage quotas
- [ ] Request filtering/sanitization

---

### 7. Advanced Conversation Features
**Priority:** Low
**Status:** Not Started

Add features for better conversation management.

**Tasks:**
- [ ] Conversation persistence/history
- [ ] Request replay
- [ ] A/B testing between providers
- [ ] Model performance comparison

---

### 8. Developer Experience
**Priority:** Medium
**Status:** Partial (docs exist, OpenAPI pending)

Improve developer experience with comprehensive tooling.

**Pending Tasks:**
- [ ] OpenAPI/Swagger documentation
- [ ] SDK generation (TypeScript, Python, Go)
- [ ] Postman collection
- [ ] Integration examples (LangChain, LlamaIndex)

---

### 12. Analytics & Insights
**Priority:** Low
**Status:** Not Started

Add analytics to understand usage patterns.

**Tasks:**
- [ ] Usage analytics
- [ ] Quality metrics
- [ ] Cost optimization insights
- [ ] Export capabilities (CSV, JSON, API)

---

## Quick Wins (Phase 0.5) - OpenAI SDK Features

### 25. OpenAI Responses API
**Priority:** High
**Status:** Not Started

Implement OpenAI's next-gen Responses API (40-80% faster).

**Benefits:**
- 40-80% faster responses
- Better performance than Chat Completions
- Lower latency

---

### 26. OpenAI Image Generation (DALL-E)
**Priority:** Low
**Status:** Not Started

Add DALL-E image generation support.

**Tasks:**
- [ ] `/api/images/generate` endpoint
- [ ] Image variations
- [ ] Image editing
- [ ] URL and base64 responses

---

### 27. OpenAI Audio API
**Priority:** Low
**Status:** Not Started

Add Whisper (speech-to-text) and TTS support.

**Tasks:**
- [ ] Transcription endpoint
- [ ] Translation endpoint
- [ ] Text-to-speech endpoint
- [ ] Multiple audio formats

---

### 28. OpenAI Assistants API
**Priority:** Low
**Status:** Not Started

Implement stateful conversations with knowledge base.

---

## Extensibility (Phase 0.75)

### 22. MCP (Model Context Protocol) Integration
**Priority:** Low
**Status:** Not Started

Integrate with Model Context Protocol for extensible tool support.

**Benefits:**
- Standardized tool integration
- Rich MCP server ecosystem
- Better tool interoperability

---

### 23. GitHub Copilot Agent Runtime
**Priority:** Medium
**Status:** Not Started

Integrate Copilot's production-tested agent runtime.

**Benefits:**
- Autonomous workflows
- Built-in tool orchestration
- Production-ready patterns

---

## Notes

- All items are **optional** - current system is production-ready
- Prioritize based on use case
- Implementation details for **completed items** are in `docs/` folder
- See `docs/CACHE_IMPLEMENTATION.md`, `docs/PROMPT_CACHING.md`, `docs/OPENAI_BATCH.md`, `docs/LOAD_BALANCING.md`, etc. for feature documentation
