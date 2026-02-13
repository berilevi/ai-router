# AI Router

A powerful Ollama-compatible API bridge that allows you to use Google Gemini (via web automation or API), OpenAI, and other AI providers through the Ollama interface. This enables seamless integration with existing Ollama clients while accessing multiple AI backends.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

## Features

- **Ollama-Compatible API**: Drop-in replacement for Ollama server on port 11434
- **Multi-Provider Support**: Route requests to different AI providers based on model selection
- **Gemini Web Automation**: Access Gemini Pro subscription via Puppeteer browser automation
- **Gemini API Support**: Use Google's official Generative AI API
- **OpenAI-Compatible**: Support for OpenAI, Azure OpenAI, and compatible APIs
- **Streaming Support**: Real-time streaming responses for all providers
- **Model Routing**: Automatic provider selection based on model name
- **Embeddings**: Generate embeddings through compatible providers
- **Rate Limiting**: Built-in request rate limiting with per-provider queues
- **Session Persistence**: Save/restore browser state for seamless reconnection
- **Error Recovery**: Automatic retry with exponential backoff and fallback providers
- **Metrics & Monitoring**: Prometheus-compatible metrics endpoint
- **Health Checks**: Kubernetes-ready health probes

## Supported Providers

| Provider | Type | Authentication | Models | Status |
|----------|------|----------------|--------|--------|
| Gemini Web | Browser Automation | Google Account | gemini, gemini-pro, gemini-ultra | ✓ |
| Gemini API | Official API | API Key | gemini-1.5-flash, gemini-1.5-pro, etc. | ✓ |
| OpenAI | API | API Key | gpt-4o, gpt-4o-mini, gpt-4, gpt-3.5-turbo | ✓ |
| **Anthropic** | **Native SDK** | **API Key** | **claude-3-5-sonnet, claude-3-opus, etc.** | **✓** |
| Custom | OpenAI-compatible | API Key | Configurable | ✓ |

## Quick Start

### Prerequisites

- Node.js 18+ installed
- For Gemini Web: Google account with Gemini access
- For API providers: Valid API keys

### Installation

```bash
# Extract the archive
cd ai-router

# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env with your credentials
nano .env
```

### Configuration

Edit `.env` file with your settings:

```env
# Server Configuration
PORT=11434
NODE_ENV=development
LOG_LEVEL=info

# Gemini Web Automation (Puppeteer)
GEMINI_WEB_ENABLED=true
GOOGLE_EMAIL=your-email@gmail.com
GOOGLE_PASSWORD=your-password
PUPPETEER_HEADLESS=true

# Gemini API
GEMINI_API_KEY=your-gemini-api-key
GEMINI_DEFAULT_MODEL=gemini-1.5-flash-latest

# OpenAI
OPENAI_API_KEY=your-openai-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_DEFAULT_MODEL=gpt-4o-mini

# Anthropic (Native SDK)
ANTHROPIC_API_KEY=your-anthropic-key
# Optional: Custom base URL (defaults to https://api.anthropic.com)
ANTHROPIC_BASE_URL=
ANTHROPIC_DEFAULT_MODEL=claude-sonnet-4-5-20250929

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Request Timeout (milliseconds)
REQUEST_TIMEOUT=300000
```

### Running the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm run build
npm start
```

The server will start on port 11434 (default Ollama port).

## Usage Examples

### Using cURL

```bash
# List available models
curl http://localhost:11434/api/tags

# Generate completion
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gemini-flash",
    "prompt": "Explain quantum computing:",
    "stream": false
  }'

# Chat completion
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### Using JavaScript/TypeScript

```javascript
import ollama from 'ollama';

// Configure to use the bridge
const client = new ollama.Ollama({ host: 'http://localhost:11434' });

// Generate completion
const response = await client.generate({
  model: 'gemini-flash',
  prompt: 'What is machine learning?',
});

console.log(response.response);

// Chat completion
const chat = await client.chat({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'Explain Node.js' }
  ]
});

console.log(chat.message.content);
```

### Using Python

```python
import ollama

# The client automatically connects to localhost:11434
response = ollama.generate(
    model='gemini-pro',
    prompt='Explain quantum computing:'
)

print(response['response'])

# Chat completion
chat = ollama.chat(
    model='claude-sonnet',
    messages=[
        {'role': 'user', 'content': 'Hello!'}
    ]
)

print(chat['message']['content'])
```

## Model Mapping

The bridge maps Ollama-style model names to provider-specific models:

| Ollama Model | Provider | Actual Model |
|--------------|----------|--------------|
| `gemini` | Gemini Web | gemini-pro |
| `gemini-pro` | Gemini Web | gemini-pro |
| `gemini-flash` | Gemini API | gemini-1.5-flash-latest |
| `gemini-1.5-pro` | Gemini API | gemini-1.5-pro-latest |
| `gpt-4o` | OpenAI | gpt-4o |
| `gpt-4o-mini` | OpenAI | gpt-4o-mini |
| `claude` | Anthropic | claude-sonnet-4-5-20250929 |
| `claude-sonnet` | Anthropic | claude-sonnet-4-5-20250929 |

## API Endpoints

### Ollama-Compatible Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tags` | GET | List available models |
| `/api/generate` | POST | Generate completion |
| `/api/chat` | POST | Chat completion |
| `/api/embed` | POST | Generate embeddings |
| `/api/pull` | POST | Pull model (no-op) |
| `/api/show` | POST | Show model info |
| `/api/delete` | DELETE | Delete model (no-op) |

### Bridge-Specific Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | API documentation |
| `/health` | GET | Health check |
| `/health/providers` | GET | Provider status |
| `/health/queue` | GET | Queue status |
| `/health/sessions` | GET | Session status |
| `/health/ready` | GET | Kubernetes readiness probe |
| `/health/live` | GET | Kubernetes liveness probe |
| `/metrics` | GET | Prometheus metrics |
| `/metrics/json` | GET | JSON metrics |
| `/metrics/summary` | GET | Metrics summary |

## Provider Configuration

### Gemini Web (Puppeteer)

The Gemini Web provider uses Puppeteer to automate the Gemini web interface. This is useful for:
- Accessing Gemini Pro subscription features
- Using Gemini when API access is limited

**Configuration:**
```env
GEMINI_WEB_ENABLED=true
GOOGLE_EMAIL=your-email@gmail.com
GOOGLE_PASSWORD=your-password
PUPPETEER_HEADLESS=true
```

**Note:** For accounts with 2FA, you may need to complete the login manually on first run.

### Gemini API

Uses Google's official Generative AI SDK for direct API access.

**Configuration:**
```env
GEMINI_API_KEY=your-api-key-from-makersuite
GEMINI_DEFAULT_MODEL=gemini-1.5-flash-latest
```

Get your API key from: https://makersuite.google.com/app/apikey

### OpenAI-Compatible Providers

Supports OpenAI, Azure OpenAI, and any OpenAI-compatible API.

**Configuration:**
```env
OPENAI_API_KEY=your-openai-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_DEFAULT_MODEL=gpt-4o-mini
```

### Anthropic Provider (Native)

The Anthropic provider uses the official `@anthropic-ai/sdk` for native integration with Anthropic's API.

**Features:**
- Native integration with Anthropic's Messages API
- Automatic system message handling (Anthropic-specific format)
- Vision/image support with automatic MIME type detection
- Tool/function calling with format conversion from OpenAI to Anthropic
- Streaming with proper token usage tracking

**Configuration:**
```env
ANTHROPIC_API_KEY=your-anthropic-key
ANTHROPIC_DEFAULT_MODEL=claude-sonnet-4-5-20250929
# Optional: Custom base URL (defaults to https://api.anthropic.com)
ANTHROPIC_BASE_URL=
```
- `compatible`: Always use OpenAI-compatible wrapper
- `auto`: Use native SDK (default, most flexible)

## Advanced Configuration

### Custom Model Mappings

Edit `src/utils/config.ts` to add custom model mappings:

```typescript
export const modelMappings: ModelMapping[] = [
  {
    ollamaModel: 'my-custom-model',
    provider: 'openai',
    providerModel: 'gpt-4-turbo',
    supportsImages: true,
    supportsTools: true,
    contextWindow: 128000,
  },
];
```

### Rate Limiting Configuration

Per-provider rate limits can be configured in `src/routes/api.ts`:

```typescript
requestQueue.setRateLimit('gemini-api', {
  maxConcurrent: 5,
  requestsPerMinute: 60,
  requestsPerHour: 1000,
  cooldownMs: 500,
});
```

### Adding Custom Providers

1. Create a new provider class extending `BaseProvider`
2. Register it in `ProviderFactory`
3. Add configuration in `.env`

## Docker Support

```bash
# Build Docker image
docker build -t ai-router .

# Run with environment file
docker run -p 11434:11434 --env-file .env ai-router
```

### Docker Compose

```yaml
version: '3.8'
services:
  ai-router:
    build: .
    ports:
      - "11434:11434"
    environment:
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./logs:/app/logs
      - ./sessions:/app/sessions
```

## Monitoring

### Prometheus Metrics

The `/metrics` endpoint provides Prometheus-compatible metrics:

```
ollama_bridge_requests_total 1000
ollama_bridge_requests_successful 950
ollama_bridge_requests_failed 50
ollama_bridge_request_duration_ms_avg 1500.50
ollama_bridge_tokens_input_total 50000
ollama_bridge_tokens_output_total 100000
```

### Health Checks

For Kubernetes deployments:

```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 11434
  initialDelaySeconds: 10
  periodSeconds: 30

readinessProbe:
  httpGet:
    path: /health/ready
    port: 11434
  initialDelaySeconds: 5
  periodSeconds: 10
```

## Troubleshooting

### Gemini Web Login Issues

If automated login fails:
1. Set `PUPPETEER_HEADLESS=false` to see the browser
2. Log in manually when prompted
3. The session will be saved for subsequent runs

### Rate Limiting

Adjust rate limits in `.env`:
```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

### Provider Not Available

Check provider status:
```bash
curl http://localhost:11434/health/providers
```

### Session Expired

Sessions expire after 7 days. Delete the session file to force re-authentication:
```bash
rm sessions/gemini-web.json
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Run test suite (57 tests covering all providers)
npm test

# Lint code
npm run lint
```

## Project Structure

```
ai-router/
├── src/
│   ├── providers/               # AI provider implementations
│   │   ├── base.ts              # Base provider class
│   │   ├── geminiWeb.ts         # Gemini Web (Puppeteer)
│   │   ├── geminiApi.ts         # Gemini API
│   │   ├── anthropic.ts         # Anthropic (Native SDK) - NEW
│   │   ├── openaiCompatible.ts  # OpenAI-compatible wrapper
│   │   ├── index.ts             # Provider factory with mode selection
│   │   ├── anthropic.test.ts    # Anthropic provider tests (52 tests)
│   │   └── index.test.ts        # Factory tests (5 tests)
│   ├── routes/                  # Express routes
│   │   ├── api.ts               # Ollama-compatible API
│   │   ├── health.ts            # Health endpoints
│   │   └── metrics.ts           # Metrics endpoints
│   ├── middleware/              # Express middleware
│   │   └── errorHandler.ts
│   ├── utils/                   # Utilities
│   │   ├── config.ts            # Configuration with provider mode validation
│   │   ├── configValidator.ts   # Config validation
│   │   ├── logger.ts            # Winston logger
│   │   ├── metrics.ts           # Metrics collection
│   │   ├── modelRouter.ts       # Model routing logic
│   │   ├── requestQueue.ts      # Request queue & rate limiting
│   │   ├── retryHandler.ts      # Error recovery & retry logic
│   │   └── sessionManager.ts    # Session persistence
│   ├── types/                   # TypeScript types
│   │   └── index.ts
│   └── index.ts                 # Main entry point
├── examples/                    # Usage examples
│   ├── basic_usage.js
│   ├── basic_usage.py
│   └── curl_examples.sh
├── sessions/                    # Session storage (created at runtime)
├── logs/                        # Log files (created at runtime)
├── jest.config.js               # Jest test configuration
├── .env.example                 # Environment template
├── Dockerfile                   # Docker image
├── docker-compose.yml           # Docker Compose config
├── Makefile                     # Convenient commands
├── package.json
├── tsconfig.json
└── README.md
```

## Security Considerations

- Store API keys in `.env` file (never commit to version control)
- Use HTTPS in production
- Implement proper authentication for production deployments
- Be cautious with browser automation credentials
- Review rate limits to prevent abuse
- Sessions are stored in `sessions/` directory with 7-day expiry

## Testing

The project includes comprehensive test coverage with 57 tests:

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test anthropic.test.ts
```

**Test Coverage:**
- **AnthropicProvider** (52 tests)
  - Provider initialization and availability
  - Chat completion (basic, with tools, with images)
  - Streaming with token tracking
  - Message formatting (system messages, multi-turn, tool results)
  - Image handling (JPEG, PNG, GIF, WebP, edge cases)
  - Tool formatting (OpenAI ↔ Anthropic conversion)
  - Error handling and edge cases
  - ✅ **Integration tests passing with Claude Haiku 4.5** (weather, calculator, multi-turn)

- **ProviderFactory** (5 tests)
  - Provider instance caching
  - Provider initialization and availability
  - Unknown provider handling

## Anthropic Provider Features

The native Anthropic provider provides:

### Message Handling
- Automatic extraction of system messages (Anthropic-specific requirement)
- Support for multi-turn conversations
- Proper handling of tool result messages

### Vision Support
- Automatic MIME type detection (JPEG, PNG, GIF, WebP)
- Base64 encoding of images
- Multiple images per message

### Tool/Function Calling
- Automatic conversion from OpenAI tool format to Anthropic
- Support for tool result messages in multi-turn conversations
- Proper error handling for invalid tool definitions

### Streaming
- Real-time token counting
- Proper usage metrics in stream completion
- Error handling and recovery
  - `auto`: Automatic selection (default)

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Acknowledgments

- [Ollama](https://ollama.ai/) for the excellent API design
- [Google Generative AI](https://ai.google.dev/) for Gemini
- [Puppeteer](https://pptr.dev/) for browser automation
- [OpenAI](https://openai.com/) for API compatibility

## Support

For issues, questions, or contributions:
- GitHub Issues: [your-repo/issues](https://github.com/yourusername/ai-router/issues)
- Documentation: [Full Docs](https://github.com/yourusername/ai-router/wiki)

---

**Note**: This project is not affiliated with Google, OpenAI, or Ollama. It is an independent bridge service for educational and development purposes.
