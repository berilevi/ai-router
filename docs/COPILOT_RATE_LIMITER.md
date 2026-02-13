# Rate Limiter Implementation Specification

## Overview

Implement an intelligent HTTP client rate limiter for GitHub Copilot API that prevents 429 errors by monitoring response headers and adaptively throttling requests.

## Core Requirements

### 1. Data Structure: RateLimitInfo

Create an immutable data class (or equivalent) with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `limit` | int | Maximum requests allowed per hour (from `x-ratelimit-limit`) |
| `remaining` | int | Requests remaining in current window (from `x-ratelimit-remaining`) |
| `reset_timestamp` | int | Unix timestamp when quota resets (from `x-ratelimit-reset`) |
| `used` | int | Requests used in current window (from `x-ratelimit-used`) |
| `retry_after` | Optional[int] | Seconds to wait when server sends `retry-after` header |

**Computed Properties:**
- `reset_datetime`: Convert Unix timestamp to human-readable datetime
- `seconds_until_reset`: Calculate seconds until quota resets
- `is_exhausted`: Boolean, true when `remaining &lt;= 0`
- `usage_percentage`: Float, calculate `(used / limit) * 100`

### 2. Main Class: CopilotRateLimiter

#### Configuration Parameters (Constructor)

| Parameter | Default | Description |
|-----------|---------|-------------|
| `min_delay` | 0.5 | Minimum seconds between requests (fastest speed) |
| `max_delay` | 60.0 | Maximum seconds between requests (slowest speed) |
| `aggressive_threshold` | 80.0 | Usage percentage to start slowing down |
| `safety_buffer` | 5 | Always keep this many requests in reserve |

#### State Tracking

Maintain these instance variables:
- `last_rate_limit_info`: Optional[RateLimitInfo] - Last parsed header data
- `last_request_time`: float - Timestamp of last request (for calculating elapsed time)
- `consecutive_429_errors`: int - Count of recent 429 errors (for exponential backoff)

### 3. Core Methods

#### `parse_headers(headers: Dict[str, str]) -&gt; Optional[RateLimitInfo]`

**Purpose:** Extract rate limit data from HTTP response headers.

**Implementation Details:**
- Headers are case-insensitive - normalize to lowercase for lookup
- Look for: `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, `x-ratelimit-used`, `retry-after`
- Safely convert string values to integers
- Return `None` if `limit` is 0 or parsing fails
- Store successful result in `self.last_rate_limit_info`

**Example Input:**
```python
{
    'X-RateLimit-Limit': '15000',
    'X-RateLimit-Remaining': '14971',
    'X-RateLimit-Reset': '1770998952',
    'X-RateLimit-Used': '29'
}
calculate_adaptive_delay() -> float
Purpose: Determine how long to wait before next request based on current quota status.
Logic Priority (in order):
Reactive: Exponential Backoff on 429 Errors
If consecutive_429_errors > 0:
Calculate: delay = min(2 ** consecutive_429_errors, max_delay)
Log warning with error count and delay time
Return immediately (highest priority)
Server Directive: Respect Retry-After
If retry_after is set in last RateLimitInfo:
Use that value (capped at max_delay)
Log info message
Return immediately
Quota Exhausted: Wait for Reset
If is_exhausted is True:
Calculate: wait_time = seconds_until_reset + 1
Log warning with reset time
Return min(wait_time, max_delay)
Preventive: Gradual Slowdown Near Limit
If usage_percentage >= aggressive_threshold:
Calculate severity: (usage_pct - threshold) / (100 - threshold)
Scale delay: min_delay + (severity * (max_delay - min_delay))
Log info with percentage and new delay
Safety Buffer: Low Remaining Requests
If remaining <= safety_buffer:
Double the current delay
Log info with remaining count
Default: Minimum Delay
Return min_delay if none of above conditions met
Always ensure return value is capped at max_delay
pre_request_delay() -> None
Purpose: Apply calculated delay before making HTTP request.
Implementation:
Calculate elapsed time since last_request_time
Get required delay from calculate_adaptive_delay()
If elapsed < required: sleep for the difference
Update last_request_time to current time
post_request_handler(response: Any, is_429: bool = False) -> None
Purpose: Process response headers after request completes.
Implementation:
Extract headers from response object (check for .headers attribute)
Call parse_headers() to update quota tracking
If successful parse: log current status with emoji indicators:
✅ < 50% usage
⚠️  50-80% usage
🚨 > 80% usage
Update consecutive_429_errors:
If is_429 is True: increment counter
If is_429 is False and counter > 0: reset to 0 and log success
4. HTTP Client Wrapper Class
Create CopilotClientWithRateLimit that uses the rate limiter:
Constructor
Accept optional token parameter
Check environment variables if token not provided: GITHUB_TOKEN, GH_TOKEN, COPILOT_GITHUB_TOKEN
Raise ValueError with helpful message if no token found
Initialize CopilotRateLimiter
Create requests.Session with authorization headers
Log initialization with masked token (show first 4 and last 4 chars only)
Core Request Method: _make_request(method, url, **kwargs)
Features:
Maximum 5 retry attempts
Call rate_limiter.pre_request_delay() before each request
Make HTTP request using session
Call rate_limiter.post_request_handler() after each request
Handle 429 status code:
Check for Retry-After header, use if present
Otherwise use exponential backoff: min(2 ** attempt, 60)
Sleep and retry
Increment attempt counter
Raise exception for other HTTP errors (4xx, 5xx)
Raise exception if max retries exceeded
Convenience Methods
get_copilot_usage(): GET https://api.github.com/user/copilot/usage
chat_completion(messages, model="gpt-4o", **kwargs): POST to chat endpoint
5. Logging Requirements
Use Python's logging module with these levels:
DEBUG: Pre-request sleep details, raw header parsing
INFO: Successful rate limit parsing, status updates (remaining/percentage), retry-after compliance
WARNING: 429 errors detected, high usage (>80%), quota exhausted, exponential backoff activation
ERROR: Request failures, max retries exceeded
All log messages should include relevant numbers (delays, percentages, counts) for debugging.
6. Example Usage Pattern
# Initialize
client = CopilotClientWithRateLimit()

# Automatic rate limiting happens on every call
result = client.chat_completion(messages=[...])  # Waits if needed, retries on 429

# Or use rate limiter standalone with any HTTP client
limiter = CopilotRateLimiter()
limiter.pre_request_delay()  # Wait appropriate time
response = requests.get(url)  # Make request
limiter.post_request_handler(response)  # Update tracking
7. Testing Scenarios
The implementation should handle:
Normal operation (low usage, no delays)
Approaching limit (gradual slowdown starting at 80%)
Hit limit (wait until reset time)
429 error (exponential backoff)
Retry-After header (immediate compliance)
Missing headers (graceful degradation to min_delay)
Rapid successive requests (enforces min_delay between calls)
8. Output Example
When running, logs should show:
INFO: Rate Limit: 14971/15000 remaining (0.19% used) - Resets in 2453s
INFO: 😴 Sleeping 0.50s before request...
INFO: 📡 POST https://api.githubcopilot.com/chat/completions (attempt 1/5)
INFO: ✅ Rate Limit: 14970/15000 remaining (0.20% used) - Resets in 2451s
Or when throttling:
WARNING: 🚨 429 ERROR #1: Backing off for 2.0s
WARNING: 🛑 QUOTA EXHAUSTED! Waiting 245s until reset at 16:09:12
INFO: ⚠️  HIGH USAGE (85.0%): Slowing down to 15.25s between requests
Deliverables
Rate limiter class with all specified methods
HTTP client wrapper demonstrating integration
Standalone example showing header parsing with detailed explanations
Command-line interface to test different scenarios
