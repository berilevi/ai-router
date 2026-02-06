import puppeteer, { Browser, Page, PuppeteerLaunchOptions } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {
  ChatCompletionOptions,
  ChatCompletionResponse,
  StreamChunk,
  ProviderConfig,
  GeminiWebConfig,
} from '../types';
import { BaseProvider } from './base';
import { logger } from '../utils/logger';
import { geminiWebConfig } from '../utils/config';
import { sessionManager } from '../utils/sessionManager';
import { requestQueue } from '../utils/requestQueue';

// Add stealth plugin
puppeteerExtra.use(StealthPlugin());

/**
 * Gemini Web Provider using Puppeteer browser automation
 * Allows access to Gemini Pro subscription through the web interface
 */
export class GeminiWebProvider extends BaseProvider {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isInitialized = false;
  private isLoggedIn = false;
  private webConfig: GeminiWebConfig;

  constructor(config: ProviderConfig) {
    super(config);
    this.webConfig = geminiWebConfig;
    
    // Set up rate limiting for this provider
    requestQueue.setRateLimit('gemini-web', {
      maxConcurrent: 2,
      requestsPerMinute: 10,
      requestsPerHour: 200,
      cooldownMs: 2000,
    });
  }

  isAvailable(): boolean {
    return this.config.enabled && this.isInitialized && this.isLoggedIn;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      logger.info('Initializing Gemini Web provider with Puppeteer...');

      const launchOptions: PuppeteerLaunchOptions = {
        headless: this.webConfig.headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1920,1080',
          '--disable-blink-features=AutomationControlled',
        ],
      };

      if (this.webConfig.chromeExecutablePath) {
        launchOptions.executablePath = this.webConfig.chromeExecutablePath;
      }

      this.browser = await puppeteerExtra.launch(launchOptions);
      this.page = await this.browser.newPage();

      // Set user agent
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0.36'
      );

      // Set viewport
      await this.page.setViewport({ width: 1920, height: 1080 });

      // Try to restore session
      const sessionRestored = await sessionManager.applySessionToPage(this.page, 'gemini-web');
      
      if (sessionRestored) {
        logger.info('Previous session restored, checking login status...');
      }

      // Navigate to Gemini
      await this.page.goto('https://gemini.google.com', {
        waitUntil: 'networkidle2',
        timeout: this.webConfig.timeout,
      });

      // Check if already logged in
      const isLoggedIn = await this.checkLoginStatus();
      
      if (!isLoggedIn && this.webConfig.email && this.webConfig.password) {
        await this.performLogin();
      } else if (!isLoggedIn) {
        logger.warn('Not logged in to Gemini. Please log in manually or provide credentials in .env');
        logger.info('Waiting for manual login (60 seconds)...');
        await this.waitForManualLogin();
      }

      // Dismiss any initial dialogs
      await this.dismissDialogs();

      // Save session after successful login
      await sessionManager.saveSessionFromPage(this.page, 'gemini-web');
      
      // Start auto-save
      sessionManager.startAutoSave(this.page, 'gemini-web');

      // Set up response observer for streaming
      await this.setupResponseObserver();

      this.isInitialized = true;
      logger.info('Gemini Web provider initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Gemini Web provider:', error);
      throw error;
    }
  }

  /**
   * Set up MutationObserver for real-time response streaming
   */
  private async setupResponseObserver(): Promise<void> {
    if (!this.page) return;

    try {
      // Inject observer script
      await this.page.evaluateOnNewDocument(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as unknown as Record<string, unknown>).geminiResponseBuffer = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as unknown as Record<string, unknown>).geminiResponseComplete = false;
        
        const observer = new MutationObserver((_mutations) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const responseElements = document.querySelectorAll('.response-content, .markdown, [data-test-id="response-content"], .message-content');
          if (responseElements.length > 0) {
            const lastElement = responseElements[responseElements.length - 1];
            const text = lastElement.textContent || '';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const currentBuffer = (window as unknown as Record<string, string>).geminiResponseBuffer;
            if (text !== currentBuffer) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (window as unknown as Record<string, string>).geminiResponseBuffer = text;
            }
          }
          
          // Check if response is complete
          const stopButton = document.querySelector('button[aria-label*="stop"], button[title*="stop"]');
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as unknown as Record<string, boolean>).geminiResponseComplete = !stopButton;
        });

        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as unknown as Record<string, unknown>).geminiObserver = observer;
      });

      logger.debug('Response observer set up');
    } catch (error) {
      logger.error('Failed to set up response observer:', error);
    }
  }

  private async checkLoginStatus(): Promise<boolean> {
    if (!this.page) return false;

    try {
      // Check for the chat input which indicates we're logged in
      const chatInput = await this.page.$('div[contenteditable="true"], textarea[placeholder*="Ask"], textarea[placeholder*="Type"]');
      const isLoggedIn = !!chatInput;
      
      if (isLoggedIn) {
        this.isLoggedIn = true;
        logger.info('Already logged in to Gemini');
      }
      
      return isLoggedIn;
    } catch {
      return false;
    }
  }

  private async performLogin(): Promise<void> {
    if (!this.page || !this.webConfig.email || !this.webConfig.password) {
      throw new Error('Missing credentials for login');
    }

    logger.info('Performing automated login to Gemini...');

    try {
      // Click sign in button if present
      const signInButton = await this.page.$('a[href*="signin"], button:has-text("Sign in")');
      if (signInButton) {
        await signInButton.click();
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 });
      }

      // Enter email
      await this.page.waitForSelector('input[type="email"]', { visible: true, timeout: 10000 });
      await this.page.type('input[type="email"]', this.webConfig.email);
      await this.page.click('#identifierNext, button:has-text("Next")');

      // Wait for password field
      await this.page.waitForSelector('input[type="password"]', { visible: true, timeout: 10000 });
      await this.page.type('input[type="password"]', this.webConfig.password);
      await this.page.click('#passwordNext, button:has-text("Next")');

      // Wait for navigation to Gemini
      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      // Check for 2FA
      await this.handle2FA();

      // Wait for chat interface
      await this.page.waitForSelector('div[contenteditable="true"], textarea[placeholder*="Ask"]', { timeout: 30000 });

      this.isLoggedIn = true;
      logger.info('Successfully logged in to Gemini');
    } catch (error) {
      logger.error('Login failed:', error);
      throw new Error('Failed to log in to Gemini. Please check credentials or log in manually.');
    }
  }

  private async handle2FA(): Promise<void> {
    if (!this.page) return;

    try {
      // Check for 2FA prompt
      const twoFactorSelectors = [
        'input[type="tel"]',
        '#totpPin',
        '[data-challengeindex="2"]',
        'input[autocomplete="one-time-code"]',
        'input[placeholder*="code"]',
      ];

      for (const selector of twoFactorSelectors) {
        const has2FA = await this.page.waitForSelector(selector, { timeout: 3000 }).catch(() => null);
        
        if (has2FA) {
          logger.info('2FA detected. Waiting for manual input (60 seconds)...');
          // Wait for user to complete 2FA
          await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });
          return;
        }
      }
    } catch {
      // No 2FA or timeout
    }
  }

  private async waitForManualLogin(): Promise<void> {
    if (!this.page) return;

    const startTime = Date.now();
    const timeout = 60000;

    while (Date.now() - startTime < timeout) {
      const isLoggedIn = await this.checkLoginStatus();
      if (isLoggedIn) {
        this.isLoggedIn = true;
        logger.info('Manual login detected');
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error('Timeout waiting for manual login');
  }

  private async dismissDialogs(): Promise<void> {
    if (!this.page) return;

    try {
      // Dismiss any onboarding dialogs
      const dismissSelectors = [
        'button[aria-label*="close"]',
        'button[aria-label*="dismiss"]',
        'button:has-text("Got it")',
        'button:has-text("Skip")',
        'button:has-text("No thanks")',
        '[role="dialog"] button:has-text("OK")',
      ];

      for (const selector of dismissSelectors) {
        const buttons = await this.page.$$(selector);
        for (const button of buttons) {
          await button.click().catch(() => {});
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    } catch {
      // Ignore errors
    }
  }

  async chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    this.validateOptions(options);

    if (!this.isAvailable()) {
      throw new Error('Gemini Web provider is not available');
    }

    // Use request queue for rate limiting
    return requestQueue.enqueue('gemini-web', async () => {
      const stream = this.chatCompletionStreamInternal(options);
      let fullContent = '';

      for await (const chunk of stream) {
        fullContent += chunk.content;
        if (chunk.done) {
          break;
        }
      }

      return {
        content: fullContent,
        model: options.model,
      };
    });
  }

  async *chatCompletionStream(options: ChatCompletionOptions): AsyncGenerator<StreamChunk> {
    this.validateOptions(options);

    if (!this.isAvailable()) {
      throw new Error('Gemini Web provider is not available');
    }

    // Use request queue for rate limiting
    const stream = await requestQueue.enqueue('gemini-web', async () => {
      return this.chatCompletionStreamInternal(options);
    });

    yield* stream;
  }

  /**
   * Internal streaming implementation
   */
  private async *chatCompletionStreamInternal(
    options: ChatCompletionOptions
  ): AsyncGenerator<StreamChunk> {
    if (!this.page || !this.isAvailable()) {
      throw new Error('Gemini Web provider is not available');
    }

    try {
      // Format messages for Gemini
      const prompt = this.formatMessages(options.messages, options.system);

      // Clear previous response buffer
      await this.page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as unknown as Record<string, string>).geminiResponseBuffer = '';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as unknown as Record<string, boolean>).geminiResponseComplete = false;
      });

      // Find and focus the input field
      const inputSelector = 'div[contenteditable="true"], textarea[placeholder*="Ask"], textarea[placeholder*="Type"]';  
      await this.page.waitForSelector(inputSelector, { visible: true, timeout: 10000 });

      // Focus and clear input
      await this.page.click(inputSelector);
      await this.page.keyboard.down('Control');
      await this.page.keyboard.down('a');
      await this.page.keyboard.up('a');
      await this.page.keyboard.up('Control');
      await this.page.keyboard.press('Delete');

      // Type the message with human-like delays
      await this.typeWithDelay(prompt);

      // Submit
      await this.page.keyboard.press('Enter');

      // Wait for response to start
      await this.page.waitForFunction(
        () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const buffer = (window as unknown as Record<string, string>).geminiResponseBuffer;
          return buffer.length > 0;
        },
        { timeout: 30000 }
      );

      // Stream the response
      let previousText = '';
      let isComplete = false;
      const maxWaitTime = options.maxTokens ? options.maxTokens * 100 : 120000;
      const startTime = Date.now();

      while (!isComplete && Date.now() - startTime < maxWaitTime) {
        // Get current response from page
        const result = await this.page.evaluate(() => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          text: (window as unknown as Record<string, string>).geminiResponseBuffer as string,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          complete: (window as unknown as Record<string, boolean>).geminiResponseComplete as boolean,
        }));

        const currentText = result.text;
        isComplete = result.complete;

        // Yield new content
        if (currentText.length > previousText.length) {
          const newContent = currentText.slice(previousText.length);
          yield {
            content: newContent,
            done: false,
          };
          previousText = currentText;
        }

        // Check if generation is complete
        if (isComplete) {
          break;
        }

        // Small delay to prevent excessive polling
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // Save session after successful completion
      await sessionManager.saveSessionFromPage(this.page, 'gemini-web');

      yield {
        content: '',
        done: true,
      };
    } catch (error) {
      logger.error('Streaming error:', error);
      
      // Try to recover by refreshing the page
      await this.attemptRecovery();
      
      throw error;
    }
  }

  /**
   * Type text with human-like delays
   */
  private async typeWithDelay(text: string): Promise<void> {
    if (!this.page) return;

    // Type in chunks with random delays
    const chunks = text.match(/.{1,10}/g) || [text];
    
    for (const chunk of chunks) {
      await this.page.keyboard.type(chunk, { delay: Math.random() * 50 + 20 });
    }
  }

  /**
   * Attempt to recover from errors
   */
  private async attemptRecovery(): Promise<void> {
    if (!this.page) return;

    try {
      logger.info('Attempting to recover from error...');
      
      // Stop any ongoing generation
      await this.page.keyboard.press('Escape');
      
      // Wait a moment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // Check if we need to refresh
      const needsRefresh = await this.page.evaluate(() => {
        return document.body.textContent?.includes('Error') || 
               document.body.textContent?.includes('Something went wrong');
      });
      
      if (needsRefresh) {
        logger.info('Refreshing page...');
        await this.page.reload({ waitUntil: 'networkidle2' });
        await this.checkLoginStatus();
      }
    } catch (error) {
      logger.error('Recovery failed:', error);
    }
  }

  private formatMessages(
    messages: ChatCompletionOptions['messages'],
    systemPrompt?: string
  ): string {
    let prompt = '';

    // Add system prompt if provided
    if (systemPrompt) {
      prompt += `System: ${systemPrompt}\n\n`;
    }

    // Add conversation history
    for (const message of messages) {
      switch (message.role) {
        case 'system':
          if (!systemPrompt) {
            prompt += `System: ${message.content}\n\n`;
          }
          break;
        case 'user':
          prompt += `User: ${message.content}\n`;
          break;
        case 'assistant':
          prompt += `Assistant: ${message.content}\n`;
          break;
      }
    }

    // Add final prompt indicator
    prompt += 'Assistant: ';

    return prompt.trim();
  }

  async cleanup(): Promise<void> {
    sessionManager.stopAutoSave();
    
    if (this.page) {
      // Save session before closing
      await sessionManager.saveSessionFromPage(this.page, 'gemini-web');
    }
    
    if (this.browser) {
      logger.info('Closing Gemini Web browser...');
      await this.browser.close();
      this.browser = null;
      this.page = null;
      this.isInitialized = false;
      this.isLoggedIn = false;
    }
  }
}

export default GeminiWebProvider;
