/**
 * Copilot Session Manager
 * Manages session persistence for multi-turn conversations with GitHub Copilot
 */

import { logger } from './logger';
import { copilotConfig } from './copilotModelMapping';

interface CopilotSession {
  sessionId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any;  // Copilot SDK session object
  createdAt: number;
  lastAccessedAt: number;
  model: string;
}

/**
 * Manages Copilot sessions for multi-turn conversations
 */
class CopilotSessionManager {
  private sessions: Map<string, CopilotSession> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly ttl: number;

  constructor() {
    this.ttl = copilotConfig.sessionTTL;
    this.startCleanupInterval();
  }

  /**
   * Start periodic cleanup of expired sessions
   */
  private startCleanupInterval(): void {
    // Clean up every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Stop the cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Generate a unique session ID
   */
  generateSessionId(): string {
    return `copilot_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Get or extract session ID from request headers/metadata
   */
  extractSessionId(headers: Record<string, string | string[] | undefined>, metadata?: { user_id?: string }): string | null {
    // Check x-session-id header first
    const sessionHeader = headers['x-session-id'];
    if (sessionHeader) {
      return Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    }

    // Check metadata.user_id
    if (metadata?.user_id) {
      return `user_${metadata.user_id}`;
    }

    return null;
  }

  /**
   * Store a session
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storeSession(sessionId: string, session: any, model: string): void {
    const now = Date.now();
    this.sessions.set(sessionId, {
      sessionId,
      session,
      createdAt: now,
      lastAccessedAt: now,
      model,
    });
    logger.debug(`Stored Copilot session: ${sessionId}`);
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): CopilotSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Update last accessed time
      session.lastAccessedAt = Date.now();
      return session;
    }
    return undefined;
  }

  /**
   * Check if a session exists and is valid
   */
  hasValidSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const now = Date.now();
    const isExpired = now - session.lastAccessedAt > this.ttl;

    if (isExpired) {
      this.deleteSession(sessionId);
      return false;
    }

    return true;
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        // Destroy the Copilot session if it has a destroy method
        if (session.session?.destroy) {
          await session.session.destroy();
        }
      } catch (error) {
        logger.warn(`Error destroying Copilot session ${sessionId}:`, error);
      }
      this.sessions.delete(sessionId);
      logger.debug(`Deleted Copilot session: ${sessionId}`);
    }
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions(): void {
    const now = Date.now();
    const expiredSessionIds: string[] = [];

    // First, collect expired session IDs
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastAccessedAt > this.ttl) {
        expiredSessionIds.push(sessionId);
      }
    }

    // Then delete them in a separate loop to avoid modifying map during iteration
    for (const sessionId of expiredSessionIds) {
      this.deleteSession(sessionId);
    }

    if (expiredSessionIds.length > 0) {
      logger.info(`Cleaned up ${expiredSessionIds.length} expired Copilot sessions`);
    }
  }

  /**
   * Get session statistics
   */
  getStats(): { total: number; byModel: Record<string, number> } {
    const byModel: Record<string, number> = {};

    for (const session of this.sessions.values()) {
      byModel[session.model] = (byModel[session.model] || 0) + 1;
    }

    return {
      total: this.sessions.size,
      byModel,
    };
  }

  /**
   * Clean up all sessions (for shutdown)
   */
  async cleanupAll(): Promise<void> {
    logger.info(`Cleaning up ${this.sessions.size} Copilot sessions...`);

    for (const sessionId of this.sessions.keys()) {
      await this.deleteSession(sessionId);
    }

    this.stopCleanupInterval();
    logger.info('All Copilot sessions cleaned up');
  }
}

// Export singleton instance
export const copilotSessionManager = new CopilotSessionManager();
export default copilotSessionManager;
