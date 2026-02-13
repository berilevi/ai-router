/**
 * Integration Tests for Tool Calling
 *
 * These tests make real API calls to test tool calling functionality.
 * They are skipped by default to avoid API costs and rate limits.
 *
 * To run these tests:
 * 1. Set environment variables: ANTHROPIC_API_KEY and/or OPENAI_API_KEY
 * 2. Run: npm test -- --testPathPattern=tool-calling.integration.test.ts
 *
 * Or run specific providers:
 * - ANTHROPIC_API_KEY=sk-... npm test -- tool-calling.integration
 * - OPENAI_API_KEY=sk-... npm test -- tool-calling.integration
 */

import { AnthropicProvider } from '../providers/anthropic';
import { OpenAICompatibleProvider } from '../providers/openaiCompatible';
import { ChatCompletionOptions } from '../types';

const SKIP_INTEGRATION_TESTS = !process.env.RUN_INTEGRATION_TESTS;

// Weather tool definition (compatible format for both providers)
const weatherTool = {
  type: 'function' as const,
  function: {
    name: 'get_weather',
    description: 'Get the current weather in a given location',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city and state, e.g. San Francisco, CA',
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'The temperature unit to use',
        },
      },
      required: ['location'],
    },
  },
};

// Calculator tool definition
const calculatorTool = {
  type: 'function' as const,
  function: {
    name: 'calculate',
    description: 'Perform basic mathematical calculations',
    parameters: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['add', 'subtract', 'multiply', 'divide'],
          description: 'The mathematical operation to perform',
        },
        a: {
          type: 'number',
          description: 'First number',
        },
        b: {
          type: 'number',
          description: 'Second number',
        },
      },
      required: ['operation', 'a', 'b'],
    },
  },
};

describe.skipIf(SKIP_INTEGRATION_TESTS)('Tool Calling Integration Tests', () => {
  describe('Anthropic Provider', () => {
    const anthropicProvider = new AnthropicProvider({
      type: 'anthropic',
      name: 'Anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      enabled: !!process.env.ANTHROPIC_API_KEY,
      defaultModel: 'claude-haiku-4-5-20251001', // Use Haiku 4.5 for cheaper testing
      priority: 4,
      models: ['claude-haiku-4-5-20251001'],
    });

    beforeAll(async () => {
      if (anthropicProvider.isAvailable()) {
        await anthropicProvider.initialize();
      }
    });

    it.skipIf(!process.env.ANTHROPIC_API_KEY)('should call weather tool', async () => {
      const options: ChatCompletionOptions = {
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 1024,
        messages: [
          {
            role: 'user',
            content: 'What is the weather like in San Francisco?',
          },
        ],
        tools: [weatherTool],
      };

      const response = await anthropicProvider.chatCompletion(options);

      console.log('Anthropic Response:', JSON.stringify(response, null, 2));

      // Should have tool calls
      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls!.length).toBeGreaterThan(0);

      // Check the tool call structure
      const toolCall = response.toolCalls![0];
      expect(toolCall).toHaveProperty('id');
      expect(toolCall).toHaveProperty('name', 'get_weather');
      expect(toolCall).toHaveProperty('input');
      expect(toolCall.input).toHaveProperty('location');

      // Location should mention San Francisco
      const location = toolCall.input.location as string;
      expect(location.toLowerCase()).toContain('san francisco');
    }, 30000);

    it.skipIf(!process.env.ANTHROPIC_API_KEY)('should call calculator tool', async () => {
      const options: ChatCompletionOptions = {
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 1024,
        messages: [
          {
            role: 'user',
            content: 'What is 15 multiplied by 7?',
          },
        ],
        tools: [calculatorTool],
      };

      const response = await anthropicProvider.chatCompletion(options);

      console.log('Anthropic Calculator Response:', JSON.stringify(response, null, 2));

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls!.length).toBeGreaterThan(0);

      const toolCall = response.toolCalls![0];
      expect(toolCall.name).toBe('calculate');
      expect(toolCall.input).toMatchObject({
        operation: 'multiply',
        a: 15,
        b: 7,
      });
    }, 30000);

    it.skipIf(!process.env.ANTHROPIC_API_KEY)('should handle multi-turn tool conversation', async () => {
      // First request with tool
      const options1: ChatCompletionOptions = {
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 1024,
        messages: [
          {
            role: 'user',
            content: 'What is the weather in Tokyo?',
          },
        ],
        tools: [weatherTool],
      };

      const response1 = await anthropicProvider.chatCompletion(options1);

      expect(response1.toolCalls).toBeDefined();
      const toolCall = response1.toolCalls![0];

      // Simulate tool execution
      const toolResult = {
        temperature: 22,
        condition: 'sunny',
        humidity: 65,
      };

      // Second request with tool result
      const options2: ChatCompletionOptions = {
        model: 'claude-haiku-4-5-20251001',
        maxTokens: 1024,
        messages: [
          {
            role: 'user',
            content: 'What is the weather in Tokyo?',
          },
          {
            role: 'assistant',
            content: response1.content,
            tool_use: [{
              id: toolCall.id,
              name: toolCall.name,
              input: toolCall.input,
            }],
          },
          {
            role: 'tool',
            content: JSON.stringify(toolResult),
            tool_call_id: toolCall.id,
          },
        ],
        tools: [weatherTool],
      };

      const response2 = await anthropicProvider.chatCompletion(options2);

      console.log('Anthropic Multi-turn Response:', JSON.stringify(response2, null, 2));

      // Should have text response about the weather
      expect(response2.content).toBeTruthy();
      expect(response2.content.toLowerCase()).toContain('tokyo');
    }, 30000);
  });

  describe('OpenAI Provider', () => {
    const openaiProvider = new OpenAICompatibleProvider({
      type: 'openai',
      name: 'OpenAI',
      apiKey: process.env.OPENAI_API_KEY || '',
      enabled: !!process.env.OPENAI_API_KEY,
      defaultModel: 'gpt-4o-mini',
      priority: 3,
      models: ['gpt-4o-mini', 'gpt-4o'],
    });

    beforeAll(async () => {
      if (openaiProvider.isAvailable()) {
        await openaiProvider.initialize();
      }
    });

    it.skipIf(!process.env.OPENAI_API_KEY)('should call weather tool', async () => {
      const options: ChatCompletionOptions = {
        model: 'gpt-4o-mini',
        maxTokens: 1024,
        messages: [
          {
            role: 'user',
            content: 'What is the weather like in New York?',
          },
        ],
        tools: [weatherTool],
      };

      const response = await openaiProvider.chatCompletion(options);

      console.log('OpenAI Response:', JSON.stringify(response, null, 2));

      // Should have tool calls
      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls!.length).toBeGreaterThan(0);

      // Check the tool call structure
      const toolCall = response.toolCalls![0];
      expect(toolCall).toHaveProperty('id');
      expect(toolCall).toHaveProperty('function');
      expect(toolCall.function).toHaveProperty('name', 'get_weather');
      expect(toolCall.function).toHaveProperty('arguments');

      // Parse arguments and check location
      const args = JSON.parse(toolCall.function.arguments);
      expect(args).toHaveProperty('location');
      expect(args.location.toLowerCase()).toContain('new york');
    }, 30000);

    it.skipIf(!process.env.OPENAI_API_KEY)('should call calculator tool', async () => {
      const options: ChatCompletionOptions = {
        model: 'gpt-4o-mini',
        maxTokens: 1024,
        messages: [
          {
            role: 'user',
            content: 'Calculate 42 plus 17',
          },
        ],
        tools: [calculatorTool],
      };

      const response = await openaiProvider.chatCompletion(options);

      console.log('OpenAI Calculator Response:', JSON.stringify(response, null, 2));

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls!.length).toBeGreaterThan(0);

      const toolCall = response.toolCalls![0];
      expect(toolCall.function.name).toBe('calculate');

      const args = JSON.parse(toolCall.function.arguments);
      expect(args).toMatchObject({
        operation: 'add',
        a: 42,
        b: 17,
      });
    }, 30000);

    it.skipIf(!process.env.OPENAI_API_KEY)('should handle streaming with tool calls', async () => {
      const options: ChatCompletionOptions = {
        model: 'gpt-4o-mini',
        maxTokens: 1024,
        messages: [
          {
            role: 'user',
            content: 'What is the weather in London?',
          },
        ],
        tools: [weatherTool],
      };

      const chunks: any[] = [];
      let finalChunk: any;

      for await (const chunk of openaiProvider.chatCompletionStream(options)) {
        chunks.push(chunk);
        if (chunk.done) {
          finalChunk = chunk;
        }
      }

      console.log('OpenAI Streaming Final Chunk:', JSON.stringify(finalChunk, null, 2));

      expect(finalChunk).toBeDefined();
      expect(finalChunk.done).toBe(true);
      expect(finalChunk.toolCalls).toBeDefined();
      expect(finalChunk.toolCalls!.length).toBeGreaterThan(0);

      const toolCall = finalChunk.toolCalls![0];
      expect(toolCall.function.name).toBe('get_weather');
    }, 30000);
  });

  describe('Cross-Provider Comparison', () => {
    it.skipIf(!process.env.ANTHROPIC_API_KEY || !process.env.OPENAI_API_KEY)(
      'should produce similar tool calls for same prompt',
      async () => {
        const anthropicProvider = new AnthropicProvider({
          type: 'anthropic',
          name: 'Anthropic',
          apiKey: process.env.ANTHROPIC_API_KEY!,
          enabled: true,
          defaultModel: 'claude-haiku-4-5-20251001',
          priority: 4,
          models: ['claude-haiku-4-5-20251001'],
        });

        const openaiProvider = new OpenAICompatibleProvider({
          type: 'openai',
          name: 'OpenAI',
          apiKey: process.env.OPENAI_API_KEY!,
          enabled: true,
          defaultModel: 'gpt-4o-mini',
          priority: 3,
          models: ['gpt-4o-mini'],
        });

        await anthropicProvider.initialize();
        await openaiProvider.initialize();

        const prompt = 'What is 25 times 4?';
        const options: ChatCompletionOptions = {
          model: '',
          maxTokens: 1024,
          messages: [{ role: 'user', content: prompt }],
          tools: [calculatorTool],
        };

        const [anthropicResponse, openaiResponse] = await Promise.all([
          anthropicProvider.chatCompletion({ ...options, model: 'claude-haiku-4-5-20251001' }),
          openaiProvider.chatCompletion({ ...options, model: 'gpt-4o-mini' }),
        ]);

        console.log('Anthropic:', JSON.stringify(anthropicResponse.toolCalls, null, 2));
        console.log('OpenAI:', JSON.stringify(openaiResponse.toolCalls, null, 2));

        // Both should call the calculator tool
        expect(anthropicResponse.toolCalls).toBeDefined();
        expect(openaiResponse.toolCalls).toBeDefined();

        // Both should call the multiply operation
        const anthropicTool = anthropicResponse.toolCalls![0];
        const openaiTool = openaiResponse.toolCalls![0];

        expect(anthropicTool.name).toBe('calculate');
        expect(openaiTool.function.name).toBe('calculate');

        // Both should have multiply operation with a=25, b=4
        expect(anthropicTool.input).toMatchObject({
          operation: 'multiply',
          a: 25,
          b: 4,
        });

        const openaiArgs = JSON.parse(openaiTool.function.arguments);
        expect(openaiArgs).toMatchObject({
          operation: 'multiply',
          a: 25,
          b: 4,
        });
      },
      60000
    );
  });
});
