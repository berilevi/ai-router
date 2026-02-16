# CONFIG_UPDATE: YAML-backed configuration, validator, and rollout plan

Purpose
- Replace env / per-provider defaults with a single YAML config that:
  - Holds global settings (caching, logging, rate-limits, request handling, load-balancing, provider-specific runtime options).
  - Contains provider_list allowing multiple entries (including multiple entries of same provider_api).
  - Requires clients to specify a model_id (no provider default_model).
  - Enforces global uniqueness of model_name.
  - Supports model_fallback_chain (priority-ordered list of model_name strings).

Deliverables (contained here)
- Actionable implementation checklist (phased).
- Single canonical example YAML (includes ALL comments from the old sample-config.env and added load-balancing & provider-specific globals).
- JSON Schema (draft-07) for structural validation and notes for runtime cross-field checks.
- Concise cross-field validation rules, error payloads, and testing/migration guidance.

Actionable plan (phased checklist — concise)
- Phase A — Schema & example YAML (1–2 days)
  - Create JSON Schema (draft-07) with new globals and provider_settings section.
  - Produce canonical example YAML (this file).
- Phase B — Loader & cross-field validation (2–3 days)
  - Parse YAML → JSON Schema validate → run runtime checks:
    - Unique model_name (global).
    - Fallback chain references exist.
    - No provider-level default_model.
    - provider_api must map to an adapter.
  - Build model index: model_name → ModelEntry(provider_key, provider_api, baseUrl, apiKeysRefs, model_id, metadata).
- Phase C — Adapters & routing (3–5 days)
  - Adapter registry keyed by provider_api.
  - ProviderError with retriable flag; retry classification for 5xx, network errors, optionally 429.
  - Request routing: require model_id, lookup, call adapter, fallback chain iteration per policy.
- Phase D — Tests, migration, CI, rollout (3–5 days)
  - Unit + integration tests (mock adapters).
  - Migration script env -> YAML (dry-run).
  - CI job to validate config examples, schema, and cross-field rules.
  - Feature-flagged rollout (validation-only → monitor → enforce).

Priority checklist
- [ ] JSON Schema updated with global/provider_settings/load_balancing
- [ ] Example YAML (this file) present in repo
- [ ] Loader + cross-field checks + model indexer
- [ ] Adapter registry + error taxonomy
- [ ] Request routing + fallback implementation
- [ ] Tests + migration script + CI job

Index & lookup design
- Index: map[string]ModelEntry where ModelEntry = {
    provider_key, provider_api, baseUrl, apiKeysRefs, model_id, metadata (max_tokens, supports_tool_calls, ...), provider_options (from global.provider_settings[provider_key] if present)
  }
- Helpers: GetModelByName(name) → ModelEntry | nil; ResolveFallbackChain(chain[]) → []ModelEntry | error.

Fallback policy
- Iterate model_names in model_fallback_chain (highest priority first):
  - Resolve to ModelEntry (validated at startup).
  - Call adapter.CallModel(entry, request).
  - If success → return response.
  - If retriable provider error (network, 5xx, configurable 429) → try next.
  - If non-retriable (4xx client errors, authentication) → return error.

Errors / HTTP mapping (recommended)
- 400: missing_model_id, unknown_model, invalid_config
- 401/403: auth failures
- 429: rate limiting
- 502/503/504: provider errors (may trigger fallback)
- Body: { "code": "...", "message": "...", "details": { ... } }

Acceptance criteria (runtime)
- Config passes JSON Schema + cross-field checks.
- Startup fails with descriptive error for duplicates, unknown fallback entries, provider-level default_model presence, or unsupported provider_api.
- Requests without model_id → 400 { code: "missing_model_id" }.
- Unknown model_name → 400 { code: "unknown_model", details: { available_models: [...] } }.

--- EXAMPLE COMPREHENSIVE YAML (canonical) ---
# This YAML is canonical and contains ALL comments from the legacy sample-config.env.
# Copy this to config/copilot-config.yaml and adjust secret refs / values.
model_fallback_chain:
  - claude-sonnet-4-5-copilot
  - claude-sonnet-4-5-anthropic
  - gpt-5.3-openrouter
  - claude-opus-4-5-copilot
  - claude-opus-4

# =============================================================================
# GLOBAL SETTINGS
# =============================================================================
global:
  # SERVER CONFIGURATION
  # Port the server listens on (default: 11434 for Ollama compatibility)
  port: 11434

  # Environment mode: development, production, or test
  # - development: verbose logging, error details exposed
  # - production: minimal logging, errors sanitized
  # - test: optimized for automated testing
  env: production

  # Logging verbosity: error, warn, info, debug, trace
  # - error: critical errors only
  # - warn: warnings and errors
  # - info: general operational info (recommended for production)
  # - debug: detailed debugging info
  # - trace: extremely verbose, includes request/response bodies
  logging:
    level: info
    # redact full secrets from logs
    redact_secrets: true
    # directory for aggregated logs (optional)
    dir: ./logs
    # do not log API keys or unredacted request bodies
    mask_patterns:
      - "sk-"
      - "secret://"

  # REQUEST HANDLING
  # Maximum time to wait for a response in milliseconds (default: 300 = 5 min)
  request_handling:
    request_timeout_ms: 300
    # Streaming response chunk size in bytes (default: 1024)
    stream_chunk_size: 1024
    # Delay between streaming chunks in milliseconds (default: 10)
    stream_delay_ms: 10

  # RATE LIMITING
  rate_limit:
    # Time window for rate limiting in milliseconds (default: 60 = 1 minute)
    window: 60
    # Maximum requests allowed per window (default: 100)
    max_requests: 100
    # Rate limit manager: handle 429s and backoffs
    manager:
      default_retry_seconds: 60

  # RESPONSE CACHING
  cache:
    # Enable/disable response caching (default: true)
    enabled: true
    # Cache entry TTL in milliseconds (default: 3600 = 1 hour)
    ttl: 3600
    # Maximum total cache size in bytes (default: 100MB)
    max_size_bytes: 104857600
    # Maximum number of cached entries (default: 1000)
    max_entries: 1000
    # Cache eviction strategy (default: lru)
    strategy: lru

  # LOAD BALANCING & HIGH AVAILABILITY
  load_balancing:
    # Strategy: round_robin, least_connections, ip_hash
    strategy: round_robin
    # Per-provider concurrency limits (optional map provider_key -> concurrent_calls)
    concurrency_limits:
      openai: 50
      anthropic: 20
    # Request routing weights: provider_key -> weight
    weights:
      openrouter: 10
      local-copilot: 5

  # CIRCUIT BREAKER - prevents cascading failures
  circuit_breaker:
    # Failures before circuit opens (default: 5)
    failure_threshold: 5
    # Seconds before circuit transitions OPEN -> HALF_OPEN (default: 60)
    cooldown_seconds: 60
    # Rolling window in seconds for failure counting
    window_seconds: 60

  # KEY ROTATION & API KEY MANAGEMENT
  key_rotation:
    # Failures before key is disabled (default: 5)
    failure_threshold: 5
    # Seconds to disable key after failures (default: 300 = 5 min)
    disable_timeout_seconds: 300
    # API Key selection strategy: round_robin or random
    strategy: round_robin

  # OPERATIONAL / TELEMETRY
  telemetry:
    metrics_enabled: true
    logs_enabled: true
    request_audit: true
    # audit fields: model_name, provider_key, selected_model_id, fallback_used, latency_ms

  # PROVIDER-SPECIFIC RUNTIME SETTINGS (global overrides / operational options)
  # These collect provider-side operational settings that are not per-model metadata.
  provider_settings:
    copilot:
      enabled: true
      # session TTL in seconds (default: 1800 = 30 minutes)
      session_ttl: 1800
      log_requests: false
      log_responses: false
      log_dir: ./logs/copilot
      # GitHub authentication options (priority order)
      auth_priority:
        - env:COPILOT_GITHUB_TOKEN
        - env:GH_TOKEN
        - cli:gh
    anthropic:
      enable_cache: true
      cache_min_tokens: 1024
      cache_system_prompt: true
      cache_last_message: false
    gemini:
      web_enabled: false
      puppeteer_headless: true
    openai:
      azure_compat: false
      default_timeout: 300

# =============================================================================
# PROVIDER LIST (instances of providers and models)
# =============================================================================
provider_list:
  nvidia:
    provider_api: openai
    baseUrl: http://127.0.0.1:11434/v1
    apiKeys:
      - secret://env/NVIDIA_API_KEY_1
      - secret://env/NVIDIA_API_KEY_2
    # provider-level options allowed (but do NOT include default_model)
    options:
      api_retry_ms: 200
    model_list:
      - model_name: gpt-5-mini
        model_id: openai/gpt-5-mini
        max_tokens: 64000
        max_input_tokens: 128000
        max_context_window: 264000
        supports_tool_calls: true
        supports_structured_output: true
        policy_state: enabled

  openrouter:
    provider_api: openai
    baseUrl: https://openrouter.ai/api/v1
    apiKeys:
      - secret://vault/openrouter/key1
    model_list:
      - model_name: gpt-5.3-openrouter
        model_id: openrouter/gpt-5.3
        max_tokens: 64000
        max_input_tokens: 128000
        max_context_window: 264000
        supports_tool_calls: true
        supports_structured_output: true
        policy_state: enabled
        reasoning: true

  local-copilot:
    provider_api: copilot
    baseUrl: http://127.0.0.1:11434/v1
    apiKeys:
      - env:COPILOT_API_KEY
    model_list:
      - model_name: claude-opus-4-5-copilot
        model_id: claude-opus-4-5
        max_tokens: 64000
        max_input_tokens: 128000
        max_context_window: 264000
        supports_tool_calls: true
        supports_structured_output: true
        policy_state: enabled
      - model_name: claude-sonnet-4-5-copilot
        model_id: claude-sonnet-4-5
        max_tokens: 64000
        max_input_tokens: 128000
        max_context_window: 264000
        supports_tool_calls: true
        supports_structured_output: true
        policy_state: enabled

  anthropic:
    provider_api: anthropic
    baseUrl: https://api.anthropic.com
    apiKeys:
      - secret://env/ANTHROPIC_API_KEY
    model_list:
      - model_name: claude-opus-4-5
        model_id: claude-opus-4-5
        max_tokens: 64000
        max_input_tokens: 128000
        max_context_window: 264000
        supports_tool_calls: true
        supports_structured_output: true
        policy_state: enabled
        reasoning: true

  gemini:
    provider_api: gemini_api
    baseUrl: https://generative.googleapis.com/v1
    apiKeys:
      - secret://gcp/gemini/key
    model_list:
      - model_name: gemini-1.5-pro-latest
        model_id: gemini-1.5-pro
        max_tokens: 32768
        max_input_tokens: 32768
        max_context_window: 65536
        supports_tool_calls: true
        supports_structured_output: true
        policy_state: enabled

# =============================================================================
# LEGACY PROVIDER-SPECIFIC NOTES (migrated comments)
# =============================================================================
# PROVIDER: ANTHROPIC (Native SDK)
# Uses the official @anthropic-ai/sdk for best compatibility.
# Supports: Messages API, Streaming, Tool Calling, Vision, Prompt Caching,
#           Message Batches API
# Models: claude-sonnet-4-5-20250929, claude-haiku-4.5, claude-opus-4-5-20250604
# Get API key: https://console.anthropic.com/
#
# PROVIDER: OPENAI
# OpenAI-compatible provider. Also works with Azure OpenAI and compatible APIs.
# Supports: Chat Completions, Streaming, Tool Calling, Vision, Embeddings
# Models: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo
# Get API key: https://platform.openai.com/api-keys
#
# PROVIDER: GITHUB COPILOT
# Routes requests through GitHub Copilot's API using your GitHub subscription.
# Supports: Chat, Streaming, multiple model backends
# Models: gpt5, gpt-4.1, opus, sonnet, haiku, o1, o3, o3-mini
# Requires: Active GitHub Copilot subscription
#
# PROVIDER: GEMINI API
# Google's official Generative AI API.
# Supports: Chat, Streaming, Vision, Tool Calling, Embeddings
# Models: gemini-1.5-flash-latest, gemini-1.5-flash-8b-latest, gemini-1.5-pro-latest
#
# PROVIDER: GEMINI WEB (Browser Automation)
# Access Gemini through browser automation (Puppeteer).
# Useful for accessing Gemini Pro subscription features without API.
# WARNING: May break if Google updates their UI.
#
# API ENDPOINTS REFERENCE
# All endpoints are available at http://localhost:{PORT}/
# POST /api/chat - Chat completion (Ollama format)
# POST /v1/messages - Anthropic Messages API
# GET /health - Health check
# GET /metrics - Prometheus metrics
#
# MODEL ALIASES
# You can use short names in requests; map in your client or by an aliases section.
#
# SECURITY NOTES
# 1. Never commit config with real credentials
# 2. Use env vars or secrets manager in production
# 3. Restrict file permissions: chmod 600 config/copilot-config.yaml
# 4. Use a vault (HashiCorp Vault, AWS Secrets Manager)
#
# LOAD BALANCING & HIGH AVAILABILITY (notes)
# Circuit Breaker, Rate Limit Manager, Key Rotation are configurable above.

--- JSON SCHEMA (validator) ---
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Copilot unified config schema",
  "type": "object",
  "properties": {
    "model_fallback_chain": {
      "type": "array",
      "items": { "type": "string" }
    },
    "global": {
      "type": "object",
      "properties": {
        "env": { "type": "string", "enum": ["development", "staging", "production", "test"] },
        "port": { "type": "integer", "minimum": 1 },
        "logging": {
          "type": "object",
          "properties": {
            "level": { "type": "string", "enum": ["error", "warn", "info", "debug", "trace"] },
            "redact_secrets": { "type": "boolean" },
            "dir": { "type": "string" }
          },
          "additionalProperties": true
        },
        "request_handling": {
          "type": "object",
          "properties": {
            "request_timeout_ms": { "type": "integer", "minimum": 0 },
            "stream_chunk_size": { "type": "integer", "minimum": 1 },
            "stream_delay_ms": { "type": "integer", "minimum": 0 }
          },
          "additionalProperties": true
        },
        "rate_limit": {
          "type": "object",
          "properties": {
            "window_ms": { "type": "integer", "minimum": 0 },
            "max_requests": { "type": "integer", "minimum": 0 },
            "manager": {
              "type": "object",
              "properties": { "default_retry_seconds": { "type": "integer", "minimum": 0 } }
            }
          },
          "additionalProperties": true
        },
        "cache": {
          "type": "object",
          "properties": {
            "enabled": { "type": "boolean" },
            "ttl_ms": { "type": "integer", "minimum": 0 },
            "max_size_bytes": { "type": "integer", "minimum": 0 },
            "max_entries": { "type": "integer", "minimum": 0 },
            "strategy": { "type": "string", "enum": ["lru", "fifo"] }
          },
          "additionalProperties": true
        },
        "load_balancing": {
          "type": "object",
          "properties": {
            "strategy": { "type": "string", "enum": ["round_robin", "least_connections", "ip_hash"] },
            "concurrency_limits": { "type": "object", "additionalProperties": { "type": "integer", "minimum": 0 } },
            "weights": { "type": "object", "additionalProperties": { "type": "integer", "minimum": 0 } }
          },
          "additionalProperties": true
        },
        "circuit_breaker": {
          "type": "object",
          "properties": {
            "failure_threshold": { "type": "integer", "minimum": 1 },
            "cooldown_seconds": { "type": "integer", "minimum": 0 },
            "window_seconds": { "type": "integer", "minimum": 0 }
          }
        },
        "key_rotation": {
          "type": "object",
          "properties": {
            "failure_threshold": { "type": "integer", "minimum": 0 },
            "disable_timeout_seconds": { "type": "integer", "minimum": 0 },
            "strategy": { "type": "string", "enum": ["round_robin", "random"] }
          }
        },
        "telemetry": {
          "type": "object",
          "properties": {
            "metrics_enabled": { "type": "boolean" },
            "logs_enabled": { "type": "boolean" },
            "request_audit": { "type": "boolean" }
          }
        },
        "provider_settings": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "additionalProperties": true
          }
        }
      },
      "additionalProperties": false
    },
    "provider_list": {
      "type": "object",
      "minProperties": 1,
      "additionalProperties": {
        "type": "object",
        "required": ["provider_api", "apiKeys", "baseUrl", "model_list"],
        "properties": {
          "provider_api": {
            "type": "string",
            "enum": ["openai", "anthropic", "copilot", "gemini_api", "openrouter", "ollama", "local"]
          },
          "apiKeys": {
            "type": "array",
            "minItems": 1,
            "items": { "type": "string" }
          },
          "baseUrl": { "type": "string", "format": "uri" },
          "options": { "type": "object", "additionalProperties": true },
          "model_list": {
            "type": "array",
            "minItems": 1,
            "items": {
              "type": "object",
              "required": [
                "model_name",
                "model_id",
                "max_tokens",
                "max_input_tokens",
                "max_context_window",
                "supports_tool_calls",
                "supports_structured_output",
                "policy_state"
              ],
              "properties": {
                "model_name": { "type": "string" },
                "model_id": { "type": "string" },
                "max_tokens": { "type": "integer", "minimum": 1 },
                "max_input_tokens": { "type": "integer", "minimum": 0 },
                "max_context_window": { "type": "integer", "minimum": 0 },
                "supports_tool_calls": { "type": "boolean" },
                "supports_structured_output": { "type": "boolean" },
                "policy_state": { "type": "string", "enum": ["enabled", "disabled"] },
                "reasoning": { "type": "boolean" },
                "aliases": { "type": "array", "items": { "type": "string" } }
              },
              "additionalProperties": true
            }
          }
        },
        "additionalProperties": false,
        "not": { "required": ["default_model"] }
      }
    }
  },
  "required": ["provider_list"],
  "additionalProperties": false
}
```

Cross-field checks (runtime, concise)
- Global uniqueness of model_name across provider_list entries. If duplicates, fail startup with a list of provider_key/model_list indices.
- model_fallback_chain entries must resolve to model_name present in provider_list.
- provider_api values must correspond to an adapter available at runtime.
- No provider object may include `default_model` (schema rejects it; loader should produce friendly instructions).
- apiKeys may be secret refs (secret://..., env:VAR); do not reveal secrets in errors/logs. Resolve via secret manager at runtime.

Uniqueness pseudocode (concise)
```text
map = {}
for provider_key, provider in provider_list:
  for i, model in enumerate(provider.model_list):
    map[model.model_name].append(provider_key + ".model_list[" + i + "]")
duplicates = [ (name, locs) for name,locs in map if len(locs)>1 ]
if duplicates: raise ConfigError(duplicates)
```

Example validation error payloads (concise)
- Missing model in request:
  {
    "code": "missing_model_id",
    "message": "A valid model_id (model_name) must be provided in the request body or query parameter 'model'."
  }
- Unknown model:
  {
    "code": "unknown_model",
    "message": "Requested model 'foo' not found.",
    "details": { "available_models": ["a","b","c"] }
  }
- Duplicate model_name on startup:
  {
    "code": "invalid_config",
    "message": "Duplicate model_name 'gpt-5' found in multiple provider entries.",
    "details": { "locations": ["openrouter.model_list[0]", "copilot.model_list[2]"] }
  }

Testing matrix (concise)
- Unit tests:
  - Schema rejects bad types/missing fields.
  - Loader detects duplicates and unknown fallback entries.
  - Indexer maps model_name -> ModelEntry with provider_settings merged.
- Integration tests (mocked adapters):
  - Success path with single model.
  - Fallback chain exercised for retriable errors (5xx, network), stops on success.
  - Non-retriable 4xx errors stop fallback and return error.
  - Verify apiKeys are masked in logs and not included in errors.

Migration & rollout (concise)
- Migration script (dry-run):
  - Read legacy envs (OPENAI_API_KEYS, ANTHROPIC_API_KEY, COPILOT_*, GEMINI_*).
  - Create provider_list entries and apiKeys secret refs.
  - If default_model env vars present: fail and instruct explicit model_list entries.
- Rollout:
  - Deploy loader in validation-only mode.
  - Feature flag require_model_id=false; collect missing_model metrics.
  - Flip to require_model_id=true after impact assessment.
  - Remove legacy behavior after deprecation window.

Operational notes (concise)
- Do not commit raw apiKeys.
- Use secret:// or env:VAR references.
- Mask secrets in logs. Audit model selection per request for billing and debugging.
- Provide metrics: missing_model_count, unknown_model_count, fallback_attempts, per-model latency.
- Q: Can model_name map to multiple providers? A: No — uniqueness enforced.

If you want, I can:
- Produce the migration script example (env -> YAML) and a one-page operator quickstart.
- Or generate language-specific loader scaffolds and CI job definitions.

