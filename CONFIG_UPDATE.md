Summary
- Convert the existing config to a single YAML-backed configuration that:
- Has a global settings for provider specific global options and for storing all the non provider specific global configs like caching and logging and etc. Must cover everything else outside of provider_list but currently in the old config structure.
  - Allows multiple provider entries (including multiple entries of the same provider type).
  - Requires clients to specify a model_id on each API request (no provider-level default model).
  - Enforces global uniqueness of model_name across all providers (duplicate model_name → configuration validation error).
  - Supports a model_fallback_chain of model_name strings; fallback resolution tries the first model_name first (highest priority), resolves that model_name to a provider + model id, and sends the request there. 
If that call fails with defined retriable errors, try the next model_name in the chain.
- Return a clear 4xx error for requests without a valid model_id or that reference unknown model_id.

Deliverables for AI to implement
1. YAML schema and JSON Schema validator for config.
2. Config loader that:
   - Parses YAML
   - Validates against schema (including global uniqueness of model_name and existence checks for fallback chain entries)
   - Indexes models by model_name → (provider_key, model_id, model_metadata)
3. Provider adapter registry (one adapter per provider_api type) and factory to call providers using model_id.
4. Request handling changes:
   - Require model_id in incoming API requests.
   - Look up model_id in the index; if absent → return 400 error with guidance.
   - Send request to the mapped provider adapter using model_id.
   - If a model_fallback_chain is supplied, iterate per policy and return the first successful response.
5. Tests, migration script, docs, and CI pipeline checks.

Concise YAML config schema (example)
```yaml name=copilot-config.yaml
model_fallback_chain:
  - claude-sonnet-4-5-copilot
  - claude-sonnet-4-5-anthropic
  - gpt-5.3-openrouter
  - claude-opus-4-5-copilot
  - claude-opus-4

provider_list:
  nvidia:
    provider_api: openai
    apiKeys:
      - key1
      - key2
    baseUrl: http://127.0.0.1:11434/v1
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
    apiKeys:
      - key1
    baseUrl: https://openrouter.ai/api/v1
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
    apiKeys:
      - key1
    baseUrl: http://127.0.0.1:11434/v1
    model_list:
      - model_name: claude-opus-4-5-copilot
        model_id: claude-opus-4-5
        max_tokens: 64000
        ...
      - model_name: claude-sonnet-4-5-copilot
        model_id: claude-sonnet-4-5
        max_tokens: 64000
        ...
# ...other providers
```

Validation rules (to implement in the JSON Schema + extra checks)
- Top-level: object with keys model_fallback_chain? (array of strings), provider_list (object). fallback_chain is optional.
- provider_list: map of provider_key → object with required fields:
  - provider_api: enum of supported provider types (e.g., openai, anthropic, copilot, gemini_api, ollama, etc.)
  - apiKeys: array of secret references or strings (recommend secret reference format)
  - baseUrl: string (url)
  - model_list: array of model objects
- model object required fields:
  - model_name: string (global unique across all providers)
  - model_id: string (provider-specific model id)
  - max_tokens, max_input_tokens, max_context_window: integers
  - supports_tool_calls: boolean
  - supports_structured_output: boolean
  - policy_state: enum(enabled, disabled)
  - optional flags like reasoning: boolean
- Cross-field rules (not expressible in simple JSON schema — enforce in code):
  - model_name must be unique globally; if duplicate found → validation error describing both locations.
  - model_fallback_chain entries must each refer to an existing model_name in config.
  - No provider-level "default_model" allowed; presence of default_model should be removed from config 
  - provider_api must be one of supported adapters; unknown → validation error.

Suggested JSON Schema (skeleton)
```json name=config-schema.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "model_fallback_chain": {
      "type": "array",
      "items": { "type": "string" }
    },
    "provider_list": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "required": ["provider_api", "apiKey", "baseUrl", "model_list"],
        "properties": {
          "provider_api": { "type": "string" },
          "apiKey": { "type": "array", "items": { "type": "string" } },
          "baseUrl": { "type": "string", "format": "uri" },
          "model_list": {
            "type": "array",
            "items": {
              "type": "object",
              "required": ["model_name", "id", "max_tokens", "policy_state"],
              "properties": {
                "model_name": { "type": "string" },
                "id": { "type": "string" },
                "max_tokens": { "type": "integer" },
                "max_input_tokens": { "type": "integer" },
                "max_context_window": { "type": "integer" },
                "supports_tool_calls": { "type": "boolean" },
                "supports_structured_output": { "type": "boolean" },
                "policy_state": { "type": "string" }
              }
            }
          }
        }
      }
    }
  },
  "additionalProperties": false
}
```
(Enforce cross-field uniqueness of model_name and fallback-chain resolution in code after schema validation.)

Runtime indexing and lookup (implementation steps)
1. After YAML parse + JSON Schema validation:
   - Build an index: map[string]ModelEntry where ModelEntry = {provider_key, provider_api, baseUrl, apiKey(s), id, metadata}
   - During indexing detect duplicate model_name → raise fatal config error with locations.
2. Provide helper functions:
   - GetModelByName(model_name) → returns ModelEntry or nil
   - ResolveFallbackChain(chain []string) → returns ordered list of ModelEntry objects or error if chain contains unknown model_name
3. Provider adapter design:
   - Interface Adapter { CallModel(entry ModelEntry, request Request) → (Response, Error) }
   - Implement adapters for each provider_api (openai, anthropic, copilot, gemini_api, openrouter, etc.). Adapter handles model_id and provider-specific call shapes and auth.
   - Adapter registry keyed by provider_api string.

Request handling semantics
- API must require model_id in requests. If absent → 400 Bad Request with JSON: { code: "missing_model_id", message: "A valid model_id must be provided." }
- If model_name present:
  - Lookup model_id → if not found → 400 with code "unknown_model" 
  - If found, route to adapter using the model id from the ModelEntry.
- If model_fallback_chain is provided in the global config:
  - For each model_name in chain:
    - Lookup ModelEntry (must exist; otherwise prior validation should have failed).
    - Call adapter.CallModel
    - If response is success → return it.
    - If response fails with a retriable error, log and try next chain member.
    - If response fails with non-retriable error (invalid input, authorization error for the client request), return error immediately.
- Define retriable provider errors that trigger fallback: connection failure, 5xx server errors, provider rate limit 429 (configurable). Do NOT fallback on 4xx client errors from provider that indicate invalid model usage or authentication.

Error codes and HTTP statuses (recommendation)
- 400 Bad Request: missing or unknown model_name, invalid request body, invalid fallback chain reference
- 401/403: authorization failures
- 429: client quota exceeded (if client-level); or mapped provider 429 if no fallback attempted
- 502/503/504: provider-side errors (possibly trigger fallback)
- Include structured error body:
  { "code": "unknown_model_name", "message": "...", "details": { "available_models": ["a","b"] } }

Duplicate model_name policy (strict)
- Enforce global uniqueness of model_name across all provider_list entries.
- If duplicate found during config validation, fail fast with detailed error listing both provider keys and model_list indices where the duplicates appear.
- Rationale: must map deterministically to one provider+model id.


Testing matrix (unit + integration)
- Unit tests:
  - Schema validation tests: missing fields, wrong types.
  - Duplicate model_name detection test (two providers use same model_name) → assert validation error.
  - Fallback chain validation: chain references unknown model_name → validation error.
  - Index lookup tests.
- Integration tests:
  - Mock adapters return success/failure; test fallback chain behavior (retriable vs non-retriable).
  - End-to-end request with model_id -> correct provider adapter called and correct model id used.
  - End-to-end request with model_id -> correct provider adapter called and correct model id used however we got an error, fallback chain first available model used.
  - Security test: ensure apiKey values can be secret refs and not printed in logs.


Operational & security considerations
- Do not store raw apiKey values in repo; allow config to reference secret IDs and read secrets at runtime from a secret manager (AWS/Google/Azure Vault).
- Logging: never log full API keys or raw secrets. Mask them in error messages and logs.
- Auditing: record which provider/model was used per request for cost attribution and debugging.
- Rate-limiting: implement per-provider per-model rate limiting based on model metadata or provider capabilities.

Checklist for implementation tasks (short actionable items)
- [ ] Create JSON Schema and YAML examples.
- [ ] Implement YAML parser + schema validator + cross-field checks (duplicate model_name, fallback chain presence).
- [ ] Implement model index builder.
- [ ] Implement adapter interface and initial adapters (openai, copilot, anthropic, openrouter, gemini_api).
- [ ] Update API request handler: require model_name, lookup, call adapter, fallback handling.
- [ ] Implement tests for validation, lookup, fallback behaviour, and adapter calls.
- [ ] Add CI job to run config validation and tests.
- [ ] Create migration script and documentation for operators.
- [ ] Rollout with feature flag, then require model_name and remove old config support.

What I'll do next if you want me to proceed
- Generate the JSON Schema file, the YAML example, and the validation + indexer code scaffold in your repo (I can open a PR if you say "create a pull request" and provide the repository owner/name).
- Or produce the adapter scaffolds and unit test templates for the language of your choice (specify Go, Python, or TypeScript).

Would you like me to:
- Generate the JSON Schema + loader + unit test scaffolds for a specific language and open a PR? If so, give the repository (owner/repo) and preferred implementation language.
