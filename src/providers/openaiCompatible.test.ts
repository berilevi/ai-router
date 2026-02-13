import OpenAI from 'openai';
import { OpenAICompatibleProvider } from './openaiCompatible';
import { ProviderConfig, ChatCompletionMessage, ChatCompletionOptions } from '../types';

// Mock the OpenAI SDK
jest.mock('openai');

describe('OpenAICompatibleProvider', () => {
  let provider: OpenAICompatibleProvider;
  let mockConfig: ProviderConfig;
  let mockOpenAIClient: jest.Mocked<OpenAI>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      type: 'openai',
      name: 'OpenAI',
      apiKey: 'test-api-key',
      baseUrl: 'https://api.openai.com/v1',
      enabled: true,
      defaultModel: 'gpt-4',
      priority: 3,
      models: ['gpt-4', 'gpt-3.5-turbo'],
    };

    // Create mock client
    mockOpenAIClient = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
      embeddings: {
        create: jest.fn(),
      },
      models: {
        list: jest.fn(),
      },
    } as unknown as jest.Mocked<OpenAI>;

    // Mock the OpenAI constructor
    (OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(() => mockOpenAIClient);

    provider = new OpenAICompatibleProvider(mockConfig);
  });

  describe('isAvailable', () => {
    it('should return true when enabled and apiKey is set', () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when disabled', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledProvider = new OpenAICompatibleProvider(disabledConfig);
      expect(disabledProvider.isAvailable()).toBe(false);
    });

    it('should return false when apiKey is missing', () => {
      const noKeyConfig = { ...mockConfig, apiKey: undefined };
      const noKeyProvider = new OpenAICompatibleProvider(noKeyConfig);
      expect(noKeyProvider.isAvailable()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize the client successfully', async () => {
      await provider.initialize();

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://api.openai.com/v1',
      });
    });

    it('should not set baseURL when not configured', async () => {
      const noBaseUrlConfig = { ...mockConfig, baseUrl: undefined };
      const noBaseUrlProvider = new OpenAICompatibleProvider(noBaseUrlConfig);

      await noBaseUrlProvider.initialize();

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
      });
    });
  });

  describe('chatCompletion', () => {
    const basicMessages: ChatCompletionMessage[] = [
      { role: 'user', content: 'Hello, GPT!' },
    ];

    const mockResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Hello! How can I help you?',
          },
        },
      ],
      model: 'gpt-4',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    };

    beforeEach(async () => {
      await provider.initialize();
    });

    it('should complete a basic chat request', async () => {
      (mockOpenAIClient.chat.completions.create as jest.Mock).mockResolvedValue(mockResponse);

      const options: ChatCompletionOptions = {
        model: 'gpt-4',
        messages: basicMessages,
        maxTokens: 100,
      };

      const result = await provider.chatCompletion(options);

      expect(result).toEqual({
        content: 'Hello! How can I help you?',
        model: 'gpt-4',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
      });
    });

    it('should handle tool calling requests', async () => {
      const toolCallResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_123',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"location": "San Francisco"}',
                  },
                },
              ],
            },
          },
        ],
        model: 'gpt-4',
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80,
        },
      };

      (mockOpenAIClient.chat.completions.create as jest.Mock).mockResolvedValue(toolCallResponse);

      const options: ChatCompletionOptions = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'What is the weather in San Francisco?' }],
        maxTokens: 100,
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get current weather',
              parameters: {
                type: 'object',
                properties: {
                  location: { type: 'string' },
                },
                required: ['location'],
              },
            },
          },
        ],
      };

      const result = await provider.chatCompletion(options);

      expect(result.content).toBe('');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        id: 'call_123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"location": "San Francisco"}',
        },
      });
    });

    it('should handle system messages', async () => {
      (mockOpenAIClient.chat.completions.create as jest.Mock).mockResolvedValue(mockResponse);

      const options: ChatCompletionOptions = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello!' }],
        system: 'You are a helpful assistant.',
        maxTokens: 100,
      };

      await provider.chatCompletion(options);

      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello!' },
          ],
        })
      );
    });

    it('should handle temperature and topP parameters', async () => {
      (mockOpenAIClient.chat.completions.create as jest.Mock).mockResolvedValue(mockResponse);

      const options: ChatCompletionOptions = {
        model: 'gpt-4',
        messages: basicMessages,
        maxTokens: 100,
        temperature: 0.7,
        topP: 0.9,
      };

      await provider.chatCompletion(options);

      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          top_p: 0.9,
        })
      );
    });
  });

  describe('chatCompletionStream', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should stream chat completions', async () => {
      const mockStream = [
        {
          choices: [
            {
              delta: { content: 'Hello' },
            },
          ],
        },
        {
          choices: [
            {
              delta: { content: ' world!' },
            },
          ],
        },
        {
          choices: [{ delta: {} }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        },
      ];

      (mockOpenAIClient.chat.completions.create as jest.Mock).mockResolvedValue(
        (async function* () {
          for (const chunk of mockStream) {
            yield chunk;
          }
        })()
      );

      const options: ChatCompletionOptions = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello!' }],
        maxTokens: 100,
      };

      const chunks: string[] = [];
      let finalChunk;

      for await (const chunk of provider.chatCompletionStream(options)) {
        if (chunk.done) {
          finalChunk = chunk;
        } else {
          chunks.push(chunk.content);
        }
      }

      expect(chunks).toEqual(['Hello', ' world!']);
      expect(finalChunk).toMatchObject({
        done: true,
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });
    });

    it('should handle tool calls in streaming', async () => {
      const mockStream = [
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_123',
                    type: 'function',
                    function: { name: 'get_weather', arguments: '' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: '{"location":' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: '"SF"}' },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [{ delta: {} }],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 30,
            total_tokens: 80,
          },
        },
      ];

      (mockOpenAIClient.chat.completions.create as jest.Mock).mockResolvedValue(
        (async function* () {
          for (const chunk of mockStream) {
            yield chunk;
          }
        })()
      );

      const options: ChatCompletionOptions = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        maxTokens: 100,
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: {
                type: 'object',
                properties: { location: { type: 'string' } },
              },
            },
          },
        ],
      };

      let finalChunk;
      for await (const chunk of provider.chatCompletionStream(options)) {
        if (chunk.done) {
          finalChunk = chunk;
        }
      }

      expect(finalChunk?.toolCalls).toBeDefined();
      expect(finalChunk?.toolCalls![0]).toMatchObject({
        id: 'call_123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '{"location":"SF"}',
        },
      });
    });
  });

  describe('generateEmbeddings', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should generate embeddings', async () => {
      const mockEmbeddingResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
          },
        ],
      };

      (mockOpenAIClient.embeddings.create as jest.Mock).mockResolvedValue(mockEmbeddingResponse);

      const result = await provider.generateEmbeddings('test text');

      expect(result).toEqual([[0.1, 0.2, 0.3]]);
      expect(mockOpenAIClient.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: ['test text'],
      });
    });
  });

  describe('listModels', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should list available models', async () => {
      const mockModels = {
        data: [
          { id: 'gpt-4' },
          { id: 'gpt-3.5-turbo' },
          { id: 'text-embedding-ada-002' },
        ],
      };

      (mockOpenAIClient.models.list as jest.Mock).mockResolvedValue(mockModels);

      const models = await provider.listModels();

      expect(models).toContain('gpt-4');
      expect(models).toContain('gpt-3.5-turbo');
    });

    it('should fallback to configured models on error', async () => {
      (mockOpenAIClient.models.list as jest.Mock).mockRejectedValue(new Error('API Error'));

      const models = await provider.listModels();

      expect(models).toEqual(['gpt-4', 'gpt-3.5-turbo']);
    });
  });
});
