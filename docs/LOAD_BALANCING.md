# Load Balancing & High Availability

AI Router includes a comprehensive load balancing system that provides circuit breaker protection, rate limit handling, API key rotation, and provider fallback chains.

## Features

- **Circuit Breaker Pattern**: Prevents cascading failures by temporarily disabling failing providers
- **Rate Limit Handling**: Parses 429 responses and disables models until reset time passes
- **API Key Rotation**: Round-robin distribution across multiple API keys per provider
- **Provider Fallback Chains**: Automatic failover to backup providers when primary is unavailable

## How It Works

### Request Flow

```
Request
   │
   ▼
Load Balancer
   │
   ├─► Check Circuit Breaker ──► OPEN? ──► Try Fallback Provider
   │
   ├─► Check Rate Limit ──► Limited? ──► Try Fallback Provider
   │
   ├─► Get API Key (Round-Robin) ──► No Key? ──► Try Fallback Provider
   │
   ▼
Execute Request
   │
   ├─► Success ──► Record Success ──► Return Response
   │
   └─► Failure
          │
          ├─► 429 Error ──► Parse Retry-After ──► Disable Until Reset
          │
          └─► Other Error ──► Record Failure ──► Check Circuit Breaker Threshold
```

## Configuration

### Environment Variables

```bash
# Circuit Breaker Configuration
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5    # Failures before circuit opens
CIRCUIT_BREAKER_TIMEOUT=60             # Seconds before retrying (default: 60)

# Rate Limit Manager
RATE_LIMIT_DEFAULT_RETRY=60            # Default retry in seconds when no Retry-After header

# API Key Rotation
KEY_ROTATION_FAILURE_THRESHOLD=5       # Failures before key is disabled
KEY_ROTATION_DISABLE_TIMEOUT=300       # Key disable duration in seconds (default: 5 min)

# Multiple API Keys (comma-separated)
OPENAI_API_KEYS=sk-key1,sk-key2,sk-key3
ANTHROPIC_API_KEYS=sk-ant-key1,sk-ant-key2
```

## Circuit Breaker

The circuit breaker prevents requests to failing providers, allowing them time to recover.

### States

| State | Description |
|-------|-------------|
| **CLOSED** | Normal operation, requests flow through |
| **OPEN** | Circuit is tripped, requests rejected immediately |
| **HALF_OPEN** | Testing state, limited requests allowed to test recovery |

### State Transitions

```
CLOSED ──(N failures)──► OPEN ──(timeout)──► HALF_OPEN
   ▲                                              │
   │                                              │
   └────────────(K successes)─────────────────────┘
                                                  │
                                      (1 failure) │
                                                  ▼
                                               OPEN
```

### Configuration

- `failureThreshold` (default: 5): Number of consecutive failures to open circuit
- `successThreshold` (default: 2): Successes in HALF_OPEN to close circuit
- `timeout` (default: 60000ms): Time before transitioning OPEN → HALF_OPEN

## Rate Limit Handling

When a 429 (Too Many Requests) error is received, the system:

1. **Parses the `Retry-After` header** (if present)
2. **Parses the error message** for reset time (e.g., "reset after 2h21m51s")
3. **Disables the model** until the reset time
4. **Opens the circuit breaker** to prevent further requests

### Supported Formats

The rate limit manager parses these time formats:

- `Retry-After: 120` (seconds)
- `Retry-After: Wed, 21 Oct 2025 07:28:00 GMT` (HTTP-date)
- `"Your quota will reset after 2h21m51s"` (error message)
- `"reset in 30 minutes"` (error message)

### Example 429 Handling

```
Request to claude-sonnet
   │
   ▼
429 Error: "You have exhausted your capacity. Quota resets after 2h21m51s"
   │
   ▼
Parse: 2h21m51s = 8511000ms
   │
   ▼
Disable claude-sonnet until now + 8511000ms
   │
   ▼
Open circuit breaker for anthropic:claude-sonnet
   │
   ▼
Future requests automatically use fallback provider
```

## API Key Rotation

Multiple API keys per provider enable:

- **Higher throughput**: Distribute requests across keys
- **Fault tolerance**: Disable failing keys without losing the provider
- **Cost management**: Use different keys for different tiers

### Configuration

```bash
# Single key (existing format, still works)
OPENAI_API_KEY=sk-your-key

# Multiple keys (new format, enables rotation)
OPENAI_API_KEYS=sk-key1,sk-key2,sk-key3
```

### Key Selection

Keys are selected using round-robin:

```
Request 1 → Key 1
Request 2 → Key 2
Request 3 → Key 3
Request 4 → Key 1  (wraps around)
```

### Key Failure Handling

If a key fails consecutively:

1. After `KEY_ROTATION_FAILURE_THRESHOLD` failures, key is disabled
2. Key remains disabled for `KEY_ROTATION_DISABLE_TIMEOUT_MS`
3. After timeout, key is re-enabled automatically
4. Success resets failure count

### How Key Rotation Works With Fallback Chains

The fallback chain selects **which provider to use**, while key rotation selects **which API key to use for that provider**. They work together, not against each other.

#### Flow

```
Client Request
    │
    ▼
┌──────────────────────────────────────────────┐
│ Step 1: Fallback Chain - Select Provider    │
│ Walk array [0→N] until finding available:   │
│   - Provider enabled?                        │
│   - Circuit breaker CLOSED?                  │
│   - Not rate limited?                        │
│   → Selected: anthropic:claude-sonnet        │
└──────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────┐
│ Step 2: Key Rotator - Select API Key        │
│ (WITHIN the selected provider)               │
│                                               │
│ anthropic has 3 keys: key1, key2, key3       │
│ Current round-robin index: 1                 │
│   → Selected: key2                           │
└──────────────────────────────────────────────┘
    │
    ▼
Execute Request
```

#### Example Scenario

**Configuration:**
```bash
MODEL_FALLBACK_CHAIN='[
  { "model": "claude-sonnet-4-5-20250929", "provider": "anthropic" },
  { "model": "sonnet", "provider": "copilot" },
  { "model": "gpt-4o", "provider": "openai" }
]'

ANTHROPIC_API_KEYS=sk-ant-key1,sk-ant-key2,sk-ant-key3
OPENAI_API_KEYS=sk-openai-key1,sk-openai-key2
```

**Request Flow:**

1. **Request 1**: Fallback chain → anthropic (index 0), Key rotation → key1
2. **Request 2**: Fallback chain → anthropic (index 0), Key rotation → key2
3. **Request 3**: Fallback chain → anthropic (index 0), Key rotation → key3
4. **Request 4**: Fallback chain → anthropic (index 0), Key rotation → key1 (wraps)

**When a Key Fails:**

1. **Request 1**: anthropic + key1 → ❌ Fails 5 times → key1 disabled
2. **Request 2**: anthropic + key2 (skips disabled key1) → ✅ Success
3. **Request 3**: anthropic + key3 → ✅ Success
4. **Request 4**: anthropic + key2 (wraps, key1 still disabled) → ✅ Success

**When ALL Keys Fail:**

1. **All 3 Anthropic keys disabled** (rate limited or errors)
2. Fallback chain moves to next provider
3. **Request**: copilot + GitHub token → ✅ Success

#### Benefits of Combining Both

- **Without key rotation**: 1 key fails → provider fails → immediate fallback
- **With key rotation**: key1 fails → use key2 → key2 fails → use key3 → all fail → fallback

You get **more resilience** before needing to fall back to a different provider.

**Real-world example:**
```
Traffic spike with 3 Anthropic keys (50k tokens/min each):
1. Distribute across keys → 150k tokens/min total capacity
2. Key1 rate limited → Disable key1, use key2 & key3 (100k tokens/min)
3. All Anthropic keys exhausted → Fallback to OpenAI
4. OpenAI serves overflow traffic
```

The combination provides **horizontal scaling (multiple keys)** AND **vertical fallback (multiple providers)**.

## Model Fallback Chain

When a provider is unavailable, requests automatically fall back to the next entry in the chain.

### Configuration

The fallback chain is a simple JSON array where **array index = priority** (0 is highest).

```bash
MODEL_FALLBACK_CHAIN='[
  { "model": "claude-sonnet-4-5-20250929", "provider": "anthropic" },
  { "model": "sonnet", "provider": "copilot" },
  { "model": "claude-opus-4-5-20250604", "provider": "anthropic" },
  { "model": "gpt-4o", "provider": "openai" },
  { "model": "gpt5", "provider": "copilot" },
  { "model": "gemini-1.5-pro-latest", "provider": "gemini" }
]'
```

### How It Works

1. Request comes in
2. Walk through the array from index 0
3. For each entry, check:
   - Is the provider enabled?
   - Is the circuit breaker CLOSED?
   - Is the provider rate limited?
   - Is there an available API key?
4. First entry that passes all checks → use it
5. Stop (don't try remaining entries)

```
Request
   │
   ▼
┌─────────────────────────────────────────────────┐
│ Index 0: anthropic/claude-sonnet-4-5           │
│ Check: Rate limited? ❌ YES → SKIP             │
└─────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────┐
│ Index 1: copilot/sonnet                        │
│ Check: Circuit breaker? ❌ OPEN → SKIP         │
└─────────────────────────────────────────────────┘
   │
   ▼
┌─────────────────────────────────────────────────┐
│ Index 2: anthropic/claude-opus-4-5             │
│ Check: All OK ✅ → USE THIS                    │
└─────────────────────────────────────────────────┘
   │
   ▼
Return response (indexes 3-5 never tried)
```

## Monitoring

### Load Balancer Status Endpoint

```bash
curl http://localhost:11434/health/loadbalancer
```

Response:

```json
{
  "circuitBreakers": {
    "anthropic:claude-sonnet-4-5-20250929": {
      "state": "OPEN",
      "failureCount": 5,
      "timeUntilRetry": 45000
    }
  },
  "rateLimits": {
    "anthropic:claude-sonnet-4-5-20250929": {
      "isLimited": true,
      "timeUntilReset": 8511000,
      "quotaResetTime": "2h21m51s",
      "limitCount": 1
    }
  },
  "keyRotators": {
    "openai": {
      "totalKeys": 3,
      "availableKeys": 2
    }
  },
  "fallbackChain": [
    { "model": "claude-sonnet-4-5-20250929", "provider": "anthropic" },
    { "model": "sonnet", "provider": "copilot" },
    { "model": "gpt-4o", "provider": "openai" }
  ],
  "timestamp": "2026-02-16T10:00:00.000Z"
}
```

### Reset Load Balancer State

```bash
curl -X POST http://localhost:11434/health/loadbalancer/reset
```

## Best Practices

### 1. Configure Multiple API Keys

For high-availability, use multiple keys per provider:

```bash
OPENAI_API_KEYS=sk-prod-1,sk-prod-2,sk-backup
ANTHROPIC_API_KEYS=sk-ant-prod-1,sk-ant-prod-2
```

### 2. Set Appropriate Timeouts

Balance between fast recovery and respecting rate limits:

```bash
# Quick recovery for transient failures (30 seconds)
CIRCUIT_BREAKER_TIMEOUT=30

# Respect rate limits (60 seconds default)
RATE_LIMIT_DEFAULT_RETRY=60
```

### 3. Define Fallback Chain

Configure your preferred provider order:

```bash
MODEL_FALLBACK_CHAIN='[
  { "model": "claude-sonnet-4-5-20250929", "provider": "anthropic" },
  { "model": "sonnet", "provider": "copilot" },
  { "model": "gpt-4o", "provider": "openai" }
]'
```

### 4. Monitor Circuit Breaker State

Regularly check `/health/loadbalancer` to identify:

- Providers experiencing issues
- Keys that need attention
- Rate limit patterns

### 5. Order by Cost

Put cheaper/free providers earlier in the chain:

```json
[
  { "model": "sonnet", "provider": "copilot" },       // Free (GitHub subscription)
  { "model": "gpt-4o-mini", "provider": "openai" },   // Cheaper
  { "model": "gpt-4o", "provider": "openai" },        // More expensive
  { "model": "claude-opus-4-5", "provider": "anthropic" } // Premium
]
```

## Architecture

### Components

```
src/utils/
├── loadBalancer.ts      # Main coordinator
├── circuitBreaker.ts    # Circuit breaker state machine
├── rateLimitManager.ts  # 429 handling and retry parsing
├── keyRotator.ts        # Multi-key round-robin
└── retryHandler.ts      # Integration with request flow
```

### Integration Points

1. **retryHandler.ts**: Uses load balancer for provider selection
2. **health.ts**: Exposes monitoring endpoints
3. **index.ts**: Initializes load balancer on startup

## Troubleshooting

### Provider Always Fails

Check circuit breaker state:

```bash
curl http://localhost:11434/health/loadbalancer | jq '.circuitBreakers'
```

Reset if needed:

```bash
curl -X POST http://localhost:11434/health/loadbalancer/reset
```

### Rate Limited Frequently

1. Add more API keys
2. Increase request spacing
3. Use provider fallbacks

### Keys Not Rotating

Verify keys are configured correctly:

```bash
curl http://localhost:11434/health/loadbalancer | jq '.keyRotators'
```

Check for typos in `*_API_KEYS` environment variables.
