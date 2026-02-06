import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from './anthropic';
import { ProviderConfig, ChatCompletionMessage, ChatCompletionOptions } from '../types';

// Mock the Anthropic SDK
jest.mock('@anthropic-ai/sdk');

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;
  let mockConfig: ProviderConfig;
  let mockAnthropicClient: jest.Mocked<Anthropic>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      type: 'anthropic',
      name: 'Anthropic',
      apiKey: 'test-api-key',
      baseUrl: 'https://api.anthropic.com/v1',
      enabled: true,
      defaultModel: 'claude-3-5-sonnet-20241022',
      priority: 4,
      models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229'],
    };

    // Create mock client
    mockAnthropicClient = {
      messages: {
        create: jest.fn(),
      },
    } as unknown as jest.Mocked<Anthropic>;

    // Mock the Anthropic constructor
    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(() => mockAnthropicClient);

    provider = new AnthropicProvider(mockConfig);
  });

  describe('isAvailable', () => {
    it('should return true when enabled and apiKey is set', () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it('should return false when disabled', () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledProvider = new AnthropicProvider(disabledConfig);
      expect(disabledProvider.isAvailable()).toBe(false);
    });

    it('should return false when apiKey is missing', () => {
      const noKeyConfig = { ...mockConfig, apiKey: undefined };
      const noKeyProvider = new AnthropicProvider(noKeyConfig);
      expect(noKeyProvider.isAvailable()).toBe(false);
    });

    it('should return false when apiKey is empty string', () => {
      const emptyKeyConfig = { ...mockConfig, apiKey: '' };
      const emptyKeyProvider = new AnthropicProvider(emptyKeyConfig);
      expect(emptyKeyProvider.isAvailable()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize the client successfully', async () => {
      await provider.initialize();

      expect(Anthropic).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: 'https://api.anthropic.com/v1',
      });
    });

    it('should throw error when apiKey is not configured', async () => {
      const noKeyConfig = { ...mockConfig, apiKey: undefined };
      const noKeyProvider = new AnthropicProvider(noKeyConfig);

      await expect(noKeyProvider.initialize()).rejects.toThrow('API key is not configured');
    });

    it('should use undefined baseURL when not configured', async () => {
      const noBaseUrlConfig = { ...mockConfig, baseUrl: undefined };
      const noBaseUrlProvider = new AnthropicProvider(noBaseUrlConfig);

      await noBaseUrlProvider.initialize();

      expect(Anthropic).toHaveBeenCalledWith({
        apiKey: 'test-api-key',
        baseURL: undefined,
      });
    });
  });

  describe('chatCompletion', () => {
    const basicMessages: ChatCompletionMessage[] = [
      { role: 'user', content: 'Hello, Claude!' },
    ];

    const mockResponse = {
      content: [{ type: 'text', text: 'Hello! How can I help you?' }],
      model: 'claude-3-5-sonnet-20241022',
      usage: { input_tokens: 10, output_tokens: 20 },
    };

    beforeEach(async () => {
      await provider.initialize();
      (mockAnthropicClient.messages.create as jest.Mock).mockResolvedValue(mockResponse);
    });

    it('should make basic chat completion request', async () => {
      const options: ChatCompletionOptions = {
        model: 'claude-3-5-sonnet-20241022',
        messages: basicMessages,
      };

      const result = await provider.chatCompletion(options);

      expect(result.content).toBe('Hello! How can I help you?');
      expect(result.model).toBe('claude-3-5-sonnet-20241022');
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
    });

    it('should throw error when model is missing', async () => {
      const options = {
        model: '',
        messages: basicMessages,
      } as ChatCompletionOptions;

      await expect(provider.chatCompletion(options)).rejects.toThrow('Model is required');
    });

    it('should throw error when messages array is empty', async () => {
      const options: ChatCompletionOptions = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [],
      };

      await expect(provider.chatCompletion(options)).rejects.toThrow('Messages are required');
    });

    it('should throw error when provider is not available', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledProvider = new AnthropicProvider(disabledConfig);

      await expect(disabledProvider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages: basicMessages,
      })).rejects.toThrow('not available');
    });

    it('should include optional parameters when provided', async () => {
      const options: ChatCompletionOptions = {
        model: 'claude-3-5-sonnet-20241022',
        messages: basicMessages,
        temperature: 0.7,
        topP: 0.9,
        maxTokens: 1000,
      };

      await provider.chatCompletion(options);

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 1000,
        })
      );
    });

    it('should use default max_tokens of 4096 when not provided', async () => {
      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages: basicMessages,
      });

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 4096,
        })
      );
    });

    it('should handle tool use responses', async () => {
      const toolUseResponse = {
        content: [
          { type: 'text', text: 'I will search for that.' },
          {
            type: 'tool_use',
            id: 'tool_1',
            name: 'search',
            input: { query: 'weather' },
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 30 },
      };
      (mockAnthropicClient.messages.create as jest.Mock).mockResolvedValue(toolUseResponse);

      const result = await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages: basicMessages,
      });

      expect(result.content).toBe('I will search for that.');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0]).toEqual({
        type: 'tool_use',
        id: 'tool_1',
        name: 'search',
        input: { query: 'weather' },
      });
    });
  });

  describe('message formatting', () => {
    let createMock: jest.Mock;

    beforeEach(async () => {
      await provider.initialize();
      createMock = mockAnthropicClient.messages.create as jest.Mock;
      createMock.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 20 },
      });
    });

    it('should handle system message extraction', async () => {
      const messages: ChatCompletionMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful assistant.',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      );
    });

    it('should handle systemPrompt option separately', async () => {
      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        system: 'Be concise.',
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'Be concise.',
        })
      );
    });

    it('should accumulate multiple system messages', async () => {
      const messages: ChatCompletionMessage[] = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Hello' },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are helpful.\n\nBe concise.',
        })
      );
    });

    it('should combine systemPrompt option with system messages', async () => {
      const messages: ChatCompletionMessage[] = [
        { role: 'system', content: 'Be friendly.' },
        { role: 'user', content: 'Hello' },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
        system: 'You are an AI assistant.',
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are an AI assistant.\n\nBe friendly.',
        })
      );
    });

    it('should handle assistant messages', async () => {
      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'user', content: 'How are you?' },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
            { role: 'user', content: 'How are you?' },
          ],
        })
      );
    });

    it('should handle empty content gracefully', async () => {
      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: '' },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: '' }],
        })
      );
    });

    it('should handle tool role messages with tool_call_id', async () => {
      const messages = [
        { role: 'user', content: 'Search for weather' },
        { role: 'tool', content: '{"temperature": 72}', tool_call_id: 'tool_123' },
      ] as unknown as ChatCompletionMessage[];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Search for weather' },
            {
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: 'tool_123',
                  content: '{"temperature": 72}',
                },
              ],
            },
          ],
        })
      );
    });

    it('should handle assistant messages with tool_use blocks', async () => {
      const messages = [
        { role: 'user', content: 'What is the weather?' },
        {
          role: 'assistant',
          content: 'I will check the weather.',
          tool_use: [
            { id: 'tool_1', name: 'get_weather', input: { location: 'NYC' } },
          ],
        },
        { role: 'tool', content: '{"temp": 72}', tool_call_id: 'tool_1' },
      ] as unknown as ChatCompletionMessage[];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'What is the weather?' },
            {
              role: 'assistant',
              content: [
                { type: 'text', text: 'I will check the weather.' },
                {
                  type: 'tool_use',
                  id: 'tool_1',
                  name: 'get_weather',
                  input: { location: 'NYC' },
                },
              ],
            },
            {
              role: 'user',
              content: [
                { type: 'tool_result', tool_use_id: 'tool_1', content: '{"temp": 72}' },
              ],
            },
          ],
        })
      );
    });

    it('should handle multiple consecutive tool results', async () => {
      const messages = [
        { role: 'user', content: 'Get info' },
        { role: 'tool', content: 'Result 1', tool_call_id: 'tool_1' },
        { role: 'tool', content: 'Result 2', tool_call_id: 'tool_2' },
      ] as unknown as ChatCompletionMessage[];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Get info' },
            {
              role: 'user',
              content: [
                { type: 'tool_result', tool_use_id: 'tool_1', content: 'Result 1' },
                { type: 'tool_result', tool_use_id: 'tool_2', content: 'Result 2' },
              ],
            },
          ],
        })
      );
    });

    it('should handle tool message without tool_call_id', async () => {
      const messages = [
        { role: 'user', content: 'Test' },
        { role: 'tool', content: 'Result without id' },
      ] as unknown as ChatCompletionMessage[];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            { role: 'user', content: 'Test' },
            {
              role: 'user',
              content: [
                { type: 'tool_result', tool_use_id: '', content: 'Result without id' },
              ],
            },
          ],
        })
      );
    });
  });

  describe('image handling', () => {
    let createMock: jest.Mock;

    beforeEach(async () => {
      await provider.initialize();
      createMock = mockAnthropicClient.messages.create as jest.Mock;
      createMock.mockResolvedValue({
        content: [{ type: 'text', text: 'I see an image' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 100, output_tokens: 20 },
      });
    });

    it('should format message with JPEG image', async () => {
      // JPEG magic bytes: FF D8 FF
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'Describe this image', images: [jpegBuffer] },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      const calledMessages = createMock.mock.calls[0][0].messages;
      expect(calledMessages[0].content).toEqual([
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: jpegBuffer.toString('base64'),
          },
        },
        { type: 'text', text: 'Describe this image' },
      ]);
    });

    it('should format message with PNG image', async () => {
      // PNG magic bytes: 89 50 4E 47
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'What is this?', images: [pngBuffer] },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      const calledMessages = createMock.mock.calls[0][0].messages;
      expect(calledMessages[0].content[0].source.media_type).toBe('image/png');
    });

    it('should format message with GIF image', async () => {
      // GIF magic bytes: 47 49 46
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);

      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'Describe the animation', images: [gifBuffer] },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      const calledMessages = createMock.mock.calls[0][0].messages;
      expect(calledMessages[0].content[0].source.media_type).toBe('image/gif');
    });

    it('should format message with WebP image', async () => {
      // WebP magic bytes: 52 49 46 46 (RIFF)
      const webpBuffer = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00]);

      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'What do you see?', images: [webpBuffer] },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      const calledMessages = createMock.mock.calls[0][0].messages;
      expect(calledMessages[0].content[0].source.media_type).toBe('image/webp');
    });

    it('should default to JPEG for unknown image format', async () => {
      // Unknown format
      const unknownBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);

      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'Process this', images: [unknownBuffer] },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      const calledMessages = createMock.mock.calls[0][0].messages;
      expect(calledMessages[0].content[0].source.media_type).toBe('image/jpeg');
    });

    it('should handle empty buffer and default to JPEG', async () => {
      // Empty buffer - edge case
      const emptyBuffer = Buffer.alloc(0);

      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'Empty image', images: [emptyBuffer] },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      const calledMessages = createMock.mock.calls[0][0].messages;
      expect(calledMessages[0].content[0].source.media_type).toBe('image/jpeg');
    });

    it('should handle buffer with only 1 byte', async () => {
      // Buffer too small to detect format
      const tinyBuffer = Buffer.from([0x89]);

      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'Tiny buffer', images: [tinyBuffer] },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      const calledMessages = createMock.mock.calls[0][0].messages;
      expect(calledMessages[0].content[0].source.media_type).toBe('image/jpeg');
    });

    it('should handle multiple images', async () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff]);
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'Compare these images', images: [jpegBuffer, pngBuffer] },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      const calledMessages = createMock.mock.calls[0][0].messages;
      expect(calledMessages[0].content).toHaveLength(3); // 2 images + 1 text
      expect(calledMessages[0].content[0].type).toBe('image');
      expect(calledMessages[0].content[1].type).toBe('image');
      expect(calledMessages[0].content[2].type).toBe('text');
    });

    it('should handle empty images array as plain text', async () => {
      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'Just text', images: [] },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      const calledMessages = createMock.mock.calls[0][0].messages;
      expect(calledMessages[0].content).toBe('Just text');
    });

    it('should handle message with images but empty text content', async () => {
      const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff]);

      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: '', images: [jpegBuffer] },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      const calledMessages = createMock.mock.calls[0][0].messages;
      // Should only have the image block, no empty text block
      expect(calledMessages[0].content).toHaveLength(1);
      expect(calledMessages[0].content[0].type).toBe('image');
    });
  });

  describe('tool formatting', () => {
    let createMock: jest.Mock;

    beforeEach(async () => {
      await provider.initialize();
      createMock = mockAnthropicClient.messages.create as jest.Mock;
      createMock.mockResolvedValue({
        content: [{ type: 'text', text: 'Response' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 10, output_tokens: 20 },
      });
    });

    it('should format OpenAI-style tools', async () => {
      const tools = [
        {
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get the current weather',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string', description: 'City name' },
              },
              required: ['location'],
            },
          },
        },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'What is the weather?' }],
        tools,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              name: 'get_weather',
              description: 'Get the current weather',
              input_schema: {
                type: 'object',
                properties: {
                  location: { type: 'string', description: 'City name' },
                },
                required: ['location'],
              },
            },
          ],
        })
      );
    });

    it('should format Anthropic-style tools (pass through)', async () => {
      const tools = [
        {
          name: 'search',
          description: 'Search the web',
          input_schema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
            },
          },
        },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Search for something' }],
        tools,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              name: 'search',
              description: 'Search the web',
              input_schema: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                },
              },
            },
          ],
        })
      );
    });

    it('should handle tools without description', async () => {
      const tools = [
        {
          type: 'function',
          function: {
            name: 'simple_tool',
            parameters: { type: 'object', properties: {} },
          },
        },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Use the tool' }],
        tools,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              name: 'simple_tool',
              description: '',
              input_schema: { type: 'object', properties: {} },
            },
          ],
        })
      );
    });

    it('should handle tools without parameters', async () => {
      const tools = [
        {
          type: 'function',
          function: {
            name: 'no_params_tool',
            description: 'A tool with no parameters',
          },
        },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Use the tool' }],
        tools,
      });

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [
            {
              name: 'no_params_tool',
              description: 'A tool with no parameters',
              input_schema: { type: 'object', properties: {} },
            },
          ],
        })
      );
    });

    it('should not include tools when empty array', async () => {
      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'No tools' }],
        tools: [],
      });

      const callArgs = createMock.mock.calls[0][0];
      expect(callArgs.tools).toBeUndefined();
    });
  });

  describe('chatCompletionStream', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should stream text content', async () => {
      const mockStreamEvents = [
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        { type: 'content_block_delta', delta: { text: 'Hello' } },
        { type: 'content_block_delta', delta: { text: ' world!' } },
        { type: 'message_delta', usage: { output_tokens: 5 } },
      ];

      const asyncIterator = {
        async *[Symbol.asyncIterator]() {
          for (const event of mockStreamEvents) {
            yield event;
          }
        },
      };

      (mockAnthropicClient.messages.create as jest.Mock).mockResolvedValue(asyncIterator);

      const chunks: { content: string; done: boolean }[] = [];
      for await (const chunk of provider.chatCompletionStream({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ content: 'Hello', done: false });
      expect(chunks[1]).toEqual({ content: ' world!', done: false });
      expect(chunks[2]).toEqual({
        content: '',
        done: true,
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      });
    });

    it('should throw error when provider is not available', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const disabledProvider = new AnthropicProvider(disabledConfig);

      const generator = disabledProvider.chatCompletionStream({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      await expect(generator.next()).rejects.toThrow('not available');
    });

    it('should include optional parameters', async () => {
      const mockStreamEvents = [
        { type: 'message_start', message: { usage: { input_tokens: 10 } } },
        { type: 'content_block_delta', delta: { text: 'Hi' } },
        { type: 'message_delta', usage: { output_tokens: 1 } },
      ];

      const asyncIterator = {
        async *[Symbol.asyncIterator]() {
          for (const event of mockStreamEvents) {
            yield event;
          }
        },
      };

      (mockAnthropicClient.messages.create as jest.Mock).mockResolvedValue(asyncIterator);

      const generator = provider.chatCompletionStream({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0.5,
        topP: 0.8,
        maxTokens: 500,
      });

      // Consume the generator
      for await (const _ of generator) {
        // just consume
      }

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.5,
          top_p: 0.8,
          max_tokens: 500,
          stream: true,
        })
      );
    });

    it('should handle stream with no usage data', async () => {
      const mockStreamEvents = [
        { type: 'message_start', message: {} },
        { type: 'content_block_delta', delta: { text: 'Hello' } },
        { type: 'message_delta', usage: {} },
      ];

      const asyncIterator = {
        async *[Symbol.asyncIterator]() {
          for (const event of mockStreamEvents) {
            yield event;
          }
        },
      };

      (mockAnthropicClient.messages.create as jest.Mock).mockResolvedValue(asyncIterator);

      const chunks: { content: string; done: boolean; usage?: object }[] = [];
      for await (const chunk of provider.chatCompletionStream({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hi' }],
      })) {
        chunks.push(chunk);
      }

      expect(chunks[chunks.length - 1]).toEqual({
        content: '',
        done: true,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      });
    });

    it('should handle stream errors', async () => {
      (mockAnthropicClient.messages.create as jest.Mock).mockRejectedValue(
        new Error('API rate limit exceeded')
      );

      const generator = provider.chatCompletionStream({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      await expect(generator.next()).rejects.toThrow('API rate limit exceeded');
    });
  });

  describe('listModels', () => {
    it('should return configured models', async () => {
      const models = await provider.listModels();

      expect(models).toEqual(['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229']);
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await provider.initialize();
    });

    it('should wrap API errors in ProviderError', async () => {
      const apiError = new Error('Invalid API key');
      (mockAnthropicClient.messages.create as jest.Mock).mockRejectedValue(apiError);

      await expect(
        provider.chatCompletion({
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('Anthropic error: Invalid API key');
    });

    it('should handle non-Error objects in error handling', async () => {
      (mockAnthropicClient.messages.create as jest.Mock).mockRejectedValue('String error');

      await expect(
        provider.chatCompletion({
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'Hi' }],
        })
      ).rejects.toThrow('Anthropic error: String error');
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      await provider.initialize();
      (mockAnthropicClient.messages.create as jest.Mock).mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    });

    it('should handle very long messages', async () => {
      const longContent = 'a'.repeat(100000);
      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: longContent },
      ];

      const result = await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      expect(result.content).toBe('OK');
    });

    it('should handle messages with special characters', async () => {
      const messages: ChatCompletionMessage[] = [
        { role: 'user', content: 'Hello 你好 مرحبا 🎉 <script>alert("xss")</script>' },
      ];

      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages,
      });

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'user', content: 'Hello 你好 مرحبا 🎉 <script>alert("xss")</script>' }],
        })
      );
    });

    it('should handle temperature of 0', async () => {
      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 0,
      });

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0,
        })
      );
    });

    it('should handle temperature of 1', async () => {
      await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hi' }],
        temperature: 1,
      });

      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 1,
        })
      );
    });

    it('should handle empty response content', async () => {
      (mockAnthropicClient.messages.create as jest.Mock).mockResolvedValue({
        content: [],
        model: 'claude-3-5-sonnet-20241022',
        usage: { input_tokens: 1, output_tokens: 0 },
      });

      const result = await provider.chatCompletion({
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(result.content).toBe('');
      expect(result.toolCalls).toBeUndefined();
    });
  });
});
