// Session management for tracking active sandboxes
import { ulid } from "ulid";
import type { Session, SandboxProvider } from "../types";
import { SessionNotFoundError } from "../utils/errors";

export class SessionManager {
  private sessions: Map<string, Session>;

  constructor() {
    this.sessions = new Map();
  }

  /**
   * Create a new session
   */
  create(
    userId: string,
    owner: string,
    repo: string,
    provider: SandboxProvider,
    sessionTimeout: number,
  ): Session {
    const now = new Date();
    const session: Session = {
      id: ulid(),
      userId,
      owner,
      repo,
      sandboxUrl: "", // Will be set when sandbox is ready
      provider,
      status: "provisioning",
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: new Date(now.getTime() + sessionTimeout * 1000),
    };

    this.sessions.set(session.id, session);
    return session;
  }

  /**
   * Get a session by ID
   */
  get(sessionId: string): Session | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    // Update last accessed time
    session.lastAccessedAt = new Date();
    return session;
  }

  /**
   * Find a session by repository and user
   */
  findByRepo(userId: string, owner: string, repo: string): Session | null {
    for (const session of this.sessions.values()) {
      if (
        session.userId === userId &&
        session.owner === owner &&
        session.repo === repo &&
        (session.status === "provisioning" || session.status === "ready")
      ) {
        return session;
      }
    }
    return null;
  }

  /**
   * Update a session
   */
  update(sessionId: string, updates: Partial<Session>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    Object.assign(session, updates);
    session.lastAccessedAt = new Date();
  }

  /**
   * Delete a session
   */
  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /**
   * List all sessions
   */
  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Find expired sessions
   */
  findExpired(): Session[] {
    const now = new Date();
    return Array.from(this.sessions.values()).filter(
      (session) => session.expiresAt < now,
    );
  }

  /**
   * Clean up expired sessions
   */
  cleanup(): Session[] {
    const expired = this.findExpired();
    for (const session of expired) {
      this.sessions.delete(session.id);
    }
    return expired;
  }

  /**
   * Get count of active sessions
   */
  getActiveCount(): number {
    return Array.from(this.sessions.values()).filter(
      (session) =>
        session.status === "provisioning" || session.status === "ready",
    ).length;
  }
}
