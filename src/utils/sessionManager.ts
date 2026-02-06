import fs from 'fs/promises';
import path from 'path';
import type { Page, Cookie } from 'puppeteer';
import { logger } from './logger';

interface SessionData {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  timestamp: number;
}

interface SessionConfig {
  sessionDir: string;
  maxAge: number; // Maximum age of session in milliseconds
  autoSave: boolean;
  saveInterval: number;
}

/**
 * Session Manager for browser state persistence
 * Saves and restores cookies, localStorage, and sessionStorage
 */
export class SessionManager {
  private config: SessionConfig;
  private currentSession: SessionData | null = null;
  private autoSaveInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = {
      sessionDir: './sessions',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      autoSave: true,
      saveInterval: 60000, // 1 minute
      ...config,
    };

    this.ensureSessionDir();
  }

  /**
   * Ensure session directory exists
   */
  private async ensureSessionDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.sessionDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create session directory:', error);
    }
  }

  /**
   * Get session file path for a provider
   */
  private getSessionFile(provider: string): string {
    return path.join(this.config.sessionDir, `${provider}.json`);
  }

  /**
   * Save browser session
   */
  async saveSession(
    provider: string,
    data: {
      cookies?: SessionData['cookies'];
      localStorage?: Record<string, string>;
      sessionStorage?: Record<string, string>;
    }
  ): Promise<void> {
    try {
      const sessionFile = this.getSessionFile(provider);
      
      const sessionData: SessionData = {
        cookies: data.cookies || [],
        localStorage: data.localStorage || {},
        sessionStorage: data.sessionStorage || {},
        timestamp: Date.now(),
      };

      await fs.writeFile(
        sessionFile,
        JSON.stringify(sessionData, null, 2),
        'utf-8'
      );

      this.currentSession = sessionData;
      logger.debug(`Session saved for ${provider}`);
    } catch (error) {
      logger.error(`Failed to save session for ${provider}:`, error);
    }
  }

  /**
   * Load browser session
   */
  async loadSession(provider: string): Promise<SessionData | null> {
    try {
      const sessionFile = this.getSessionFile(provider);
      
      // Check if file exists
      try {
        await fs.access(sessionFile);
      } catch {
        logger.debug(`No saved session found for ${provider}`);
        return null;
      }

      const data = await fs.readFile(sessionFile, 'utf-8');
      const session: SessionData = JSON.parse(data);

      // Check session age
      const age = Date.now() - session.timestamp;
      if (age > this.config.maxAge) {
        logger.warn(`Session for ${provider} is expired (${Math.round(age / 86400000)} days old)`);
        await this.deleteSession(provider);
        return null;
      }

      this.currentSession = session;
      logger.info(`Session loaded for ${provider} (${Math.round(age / 3600000)} hours old)`);
      
      return session;
    } catch (error) {
      logger.error(`Failed to load session for ${provider}:`, error);
      return null;
    }
  }

  /**
   * Delete saved session
   */
  async deleteSession(provider: string): Promise<void> {
    try {
      const sessionFile = this.getSessionFile(provider);
      await fs.unlink(sessionFile);
      logger.info(`Session deleted for ${provider}`);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Check if session exists and is valid
   */
  async hasValidSession(provider: string): Promise<boolean> {
    const session = await this.loadSession(provider);
    return session !== null && session.cookies.length > 0;
  }

  /**
   * Extract cookies from Puppeteer page
   */
  async extractCookiesFromPage(page: Page): Promise<SessionData['cookies']> {
    try {
      const cookies = await page.cookies();
      return cookies.map((cookie: Cookie) => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      }));
    } catch (error) {
      logger.error('Failed to extract cookies:', error);
      return [];
    }
  }

  /**
   * Extract localStorage from Puppeteer page
   */
  async extractLocalStorageFromPage(page: Page): Promise<Record<string, string>> {
    try {
      return await page.evaluate(() => {
        const data: Record<string, string> = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            data[key] = localStorage.getItem(key) || '';
          }
        }
        return data;
      });
    } catch (error) {
      logger.error('Failed to extract localStorage:', error);
      return {};
    }
  }

  /**
   * Extract sessionStorage from Puppeteer page
   */
  async extractSessionStorageFromPage(page: Page): Promise<Record<string, string>> {
    try {
      return await page.evaluate(() => {
        const data: Record<string, string> = {};
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) {
            data[key] = sessionStorage.getItem(key) || '';
          }
        }
        return data;
      });
    } catch (error) {
      logger.error('Failed to extract sessionStorage:', error);
      return {};
    }
  }

  /**
   * Apply cookies to Puppeteer page
   */
  async applyCookiesToPage(page: Page, cookies: SessionData['cookies']): Promise<void> {
    try {
      for (const cookie of cookies) {
        try {
          await page.setCookie(cookie);
        } catch (error) {
          logger.debug(`Failed to set cookie ${cookie.name}:`, error);
        }
      }
      logger.debug(`Applied ${cookies.length} cookies to page`);
    } catch (error) {
      logger.error('Failed to apply cookies:', error);
    }
  }

  /**
   * Apply localStorage to Puppeteer page
   */
  async applyLocalStorageToPage(
    page: Page,
    localStorage: Record<string, string>
  ): Promise<void> {
    try {
      await page.evaluate((data: Record<string, string>) => {
        for (const [key, value] of Object.entries(data)) {
          window.localStorage.setItem(key, value);
        }
      }, localStorage);
      logger.debug(`Applied ${Object.keys(localStorage).length} localStorage items`);
    } catch (error) {
      logger.error('Failed to apply localStorage:', error);
    }
  }

  /**
   * Apply sessionStorage to Puppeteer page
   */
  async applySessionStorageToPage(
    page: Page,
    sessionStorage: Record<string, string>
  ): Promise<void> {
    try {
      await page.evaluate((data: Record<string, string>) => {
        for (const [key, value] of Object.entries(data)) {
          window.sessionStorage.setItem(key, value);
        }
      }, sessionStorage);
      logger.debug(`Applied ${Object.keys(sessionStorage).length} sessionStorage items`);
    } catch (error) {
      logger.error('Failed to apply sessionStorage:', error);
    }
  }

  /**
   * Save full session from Puppeteer page
   */
  async saveSessionFromPage(page: Page, provider: string): Promise<void> {
    try {
      const cookies = await this.extractCookiesFromPage(page);
      const localStorage = await this.extractLocalStorageFromPage(page);
      const sessionStorage = await this.extractSessionStorageFromPage(page);

      await this.saveSession(provider, {
        cookies,
        localStorage,
        sessionStorage,
      });

      logger.info(`Full session saved for ${provider}`);
    } catch (error) {
      logger.error(`Failed to save session from page for ${provider}:`, error);
    }
  }

  /**
   * Apply full session to Puppeteer page
   */
  async applySessionToPage(page: Page, provider: string): Promise<boolean> {
    try {
      const session = await this.loadSession(provider);
      if (!session) {
        return false;
      }

      await this.applyCookiesToPage(page, session.cookies);
      await this.applyLocalStorageToPage(page, session.localStorage);
      await this.applySessionStorageToPage(page, session.sessionStorage);

      logger.info(`Full session applied for ${provider}`);
      return true;
    } catch (error) {
      logger.error(`Failed to apply session to page for ${provider}:`, error);
      return false;
    }
  }

  /**
   * Start auto-save interval
   */
  startAutoSave(page: Page, provider: string): void {
    if (!this.config.autoSave) return;

    this.stopAutoSave();

    this.autoSaveInterval = setInterval(async () => {
      try {
        await this.saveSessionFromPage(page, provider);
      } catch (error) {
        logger.error('Auto-save failed:', error);
      }
    }, this.config.saveInterval);

    logger.debug(`Auto-save started for ${provider}`);
  }

  /**
   * Stop auto-save interval
   */
  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
      logger.debug('Auto-save stopped');
    }
  }

  /**
   * List all saved sessions
   */
  async listSessions(): Promise<Array<{ provider: string; age: number }>> {
    try {
      const files = await fs.readdir(this.config.sessionDir);
      const sessions: Array<{ provider: string; age: number }> = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const provider = file.replace('.json', '');
          const session = await this.loadSession(provider);
          if (session) {
            sessions.push({
              provider,
              age: Date.now() - session.timestamp,
            });
          }
        }
      }

      return sessions;
    } catch (error) {
      logger.error('Failed to list sessions:', error);
      return [];
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const sessions = await this.listSessions();
      let cleaned = 0;

      for (const { provider, age } of sessions) {
        if (age > this.config.maxAge) {
          await this.deleteSession(provider);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        logger.info(`Cleaned up ${cleaned} expired sessions`);
      }

      return cleaned;
    } catch (error) {
      logger.error('Failed to cleanup sessions:', error);
      return 0;
    }
  }
}

// Singleton instance
export const sessionManager = new SessionManager();

export default sessionManager;
