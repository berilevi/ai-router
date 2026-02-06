/**
 * Anthropic Messages API Integration Tests
 * Tests the /v1/messages endpoint
 */

import request from 'supertest';
import express from 'express';
import anthropicRoutes from '../routes/anthropic';

// Create test app
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use('/v1', anthropicRoutes);

describe('Anthropic Messages API', () => {
  describe('POST /v1/messages', () => {
    describe('Request Validation', () => {
      it('should reject request without model', async () => {
        const response = await request(app)
          .post('/v1/messages')
          .send({
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 100,
          });

        expect(response.status).toBe(400);
        expect(response.body.type).toBe('error');
        expect(response.body.error.type).toBe('invalid_request_error');
      });

      it('should reject request without messages', async () => {
        const response = await request(app)
          .post('/v1/messages')
          .send({
            model: 'gpt5',
            max_tokens: 100,
          });

        expect(response.status).toBe(400);
        expect(response.body.type).toBe('error');
        expect(response.body.error.type).toBe('invalid_request_error');
      });

      it('should reject request without max_tokens', async () => {
        const response = await request(app)
          .post('/v1/messages')
          .send({
            model: 'gpt5',
            messages: [{ role: 'user', content: 'Hello' }],
          });

        expect(response.status).toBe(400);
        expect(response.body.type).toBe('error');
        expect(response.body.error.type).toBe('invalid_request_error');
      });

      it('should reject invalid message role', async () => {
        const response = await request(app)
          .post('/v1/messages')
          .send({
            model: 'gpt5',
            messages: [{ role: 'invalid', content: 'Hello' }],
            max_tokens: 100,
          });

        expect(response.status).toBe(400);
        expect(response.body.type).toBe('error');
      });

      it('should reject empty messages array', async () => {
        const response = await request(app)
          .post('/v1/messages')
          .send({
            model: 'gpt5',
            messages: [],
            max_tokens: 100,
          });

        expect(response.status).toBe(400);
        expect(response.body.type).toBe('error');
      });

      it('should accept valid request with all required fields', async () => {
        const response = await request(app)
          .post('/v1/messages')
          .send({
            model: 'gpt5',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 100,
          });

        // May return 404/500/503 if provider not available, but validation passed
        expect([200, 404, 500, 503]).toContain(response.status);
      });
    });

    describe('Content Block Validation', () => {
      it('should accept text content blocks', async () => {
        const response = await request(app)
          .post('/v1/messages')
          .send({
            model: 'gpt5',
            messages: [{
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
            }],
            max_tokens: 100,
          });

        expect([200, 404, 500, 503]).toContain(response.status);
      });

      it('should accept image content blocks', async () => {
        const response = await request(app)
          .post('/v1/messages')
          .send({
            model: 'gemini-1.5-pro',
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } },
                { type: 'text', text: 'What is this?' },
              ],
            }],
            max_tokens: 100,
          });

        expect([200, 404, 500, 503]).toContain(response.status);
      });
    });

    describe('Tool Validation', () => {
      it('should accept valid tool definitions', async () => {
        const response = await request(app)
          .post('/v1/messages')
          .send({
            model: 'claude-sonnet-4-5-20250514',
            messages: [{ role: 'user', content: 'What is the weather in Seattle?' }],
            max_tokens: 1000,
            tools: [{
              name: 'get_weather',
              description: 'Get weather for a city',
              input_schema: {
                type: 'object',
                properties: {
                  city: { type: 'string' },
                },
                required: ['city'],
              },
            }],
          });

        expect([200, 404, 500, 503]).toContain(response.status);
      });
    });

    describe('Optional Parameters', () => {
      it('should accept system prompt', async () => {
        const response = await request(app)
          .post('/v1/messages')
          .send({
            model: 'gpt5',
            system: 'You are a helpful assistant.',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 100,
          });

        expect([200, 404, 500, 503]).toContain(response.status);
      });

      it('should accept temperature', async () => {
        const response = await request(app)
          .post('/v1/messages')
          .send({
            model: 'gpt5',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 100,
            temperature: 0.7,
          });

        expect([200, 404, 500, 503]).toContain(response.status);
      });

      it('should reject temperature out of range', async () => {
        const response = await request(app)
          .post('/v1/messages')
          .send({
            model: 'gpt5',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 100,
            temperature: 1.5,
          });

        expect(response.status).toBe(400);
      });

      // Note: Streaming tests require a running provider and are tested in integration tests
      it.skip('should accept stream parameter in request body', async () => {
        // This test is skipped because streaming requires actual provider connectivity
        // and the SSE response handling doesn't complete in a unit test context
        const response = await request(app)
          .post('/v1/messages')
          .send({
            model: 'gpt5',
            messages: [{ role: 'user', content: 'Hello' }],
            max_tokens: 100,
            stream: true,
          });

        expect([200, 404, 500, 503]).toContain(response.status);
      });
    });
  });

  describe('GET /v1/models', () => {
    it('should return models list', async () => {
      const response = await request(app).get('/v1/models');

      expect(response.status).toBe(200);
      expect(response.body.object).toBe('list');
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });
});

describe('Anthropic API Response Format', () => {
  describe('Error Response Format', () => {
    it('should return properly formatted error responses', async () => {
      const response = await request(app)
        .post('/v1/messages')
        .send({
          model: 'gpt5',
          messages: [], // Invalid
          max_tokens: 100,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('type', 'error');
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('type');
      expect(response.body.error).toHaveProperty('message');
    });
  });
});
