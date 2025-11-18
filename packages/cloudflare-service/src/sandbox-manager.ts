// @ts-ignore - Cloudflare Sandbox SDK
import { getSandbox } from "@cloudflare/sandbox";
import type { Env, SandboxSession } from "./types";

export class SandboxManager {
  private state: any; // DurableObjectState
  private env: Env;
  private session: SandboxSession | null = null;

  constructor(state: any, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // Load session from storage
    await this.loadSession();

    try {
      // Handle CREATE
      if (request.method === "POST") {
        const body = (await request.json()) as any;

        if (body.action === "create") {
          return await this.createSandbox(body);
        }
      }

      // Handle GET (status)
      if (request.method === "GET") {
        if (!this.session) {
          return new Response(JSON.stringify({ error: "Sandbox not found" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(
          JSON.stringify({
            id: this.session.id,
            url: this.session.url,
            status: this.session.status,
            createdAt: this.session.createdAt,
            owner: this.session.owner,
            repo: this.session.repo,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      // Handle DELETE
      if (request.method === "DELETE") {
        if (!this.session || !this.session.sandboxId) {
          return new Response(null, { status: 204 });
        }

        await this.terminateSandbox();

        return new Response(null, { status: 204 });
      }

      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Durable Object error:", error);

      if (this.session) {
        this.session.status = "error";
        this.session.errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        await this.saveSession();
      }

      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  private async createSandbox(params: {
    owner: string;
    repo: string;
    branch: string;
    sessionId: string;
    githubToken?: string;
  }): Promise<Response> {
    // Check if sandbox already exists
    if (
      this.session &&
      this.session.status !== "error" &&
      this.session.status !== "terminated"
    ) {
      return new Response(
        JSON.stringify({
          id: this.session.id,
          url: this.session.url,
          status: this.session.status,
          createdAt: this.session.createdAt,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // Initialize session
    const sandboxId = `sb-${params.sessionId}-${Date.now()}`;
    this.session = {
      id: sandboxId,
      sessionId: params.sessionId,
      owner: params.owner,
      repo: params.repo,
      branch: params.branch,
      status: "provisioning",
      url: null,
      sandboxId: null,
      createdAt: new Date().toISOString(),
    };
    await this.saveSession();

    // Check if Sandbox binding is available (production only)
    if (!this.env.Sandbox) {
      console.warn("⚠️ Sandbox SDK not available in local development");

      this.session.status = "error";
      this.session.errorMessage =
        "Sandbox SDK only works in production. Deploy to Cloudflare to test full functionality.";
      await this.saveSession();

      return new Response(
        JSON.stringify({
          error: "Sandbox SDK not available",
          message:
            "The Cloudflare Sandbox SDK only works in production deployment.",
          hint: "Deploy with 'bun run deploy' or use packages/core for local Docker-based development",
          session: {
            id: this.session.id,
            status: this.session.status,
            createdAt: this.session.createdAt,
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }

    // Get sandbox instance
    const sandbox = getSandbox(this.env.Sandbox, sandboxId, {
      keepAlive: true, // Keep sandbox running
    });

    try {
      // Update status to cloning
      this.session.status = "cloning";
      this.session.sandboxId = sandboxId;
      await this.saveSession();

      // Build repository URL with token if provided
      const repoUrl = params.githubToken
        ? `https://${params.githubToken}@github.com/${params.owner}/${params.repo}.git`
        : `https://github.com/${params.owner}/${params.repo}.git`;

      // Execute startup script with environment variables in background
      // The startup.sh script will:
      // 1. Clone the repository using REPO_URL env var
      // 2. Checkout the branch using BRANCH env var
      // 3. Start the OpenCode server on port 4096
      // Run in background with nohup so it doesn't block
      sandbox.exec(
        `nohup sh -c 'REPO_URL="${repoUrl}" BRANCH="${params.branch}" SESSION_ID="${params.sessionId}" /startup.sh' > /tmp/startup.log 2>&1 &`,
      );

      // Update status to starting
      this.session.status = "starting";
      await this.saveSession();

      // Wait for the startup script to complete
      // This includes: git clone + OpenCode server start
      await new Promise((resolve) => setTimeout(resolve, 15000));

      // Expose the port and get preview URL (production only)
      const port = parseInt(this.env.OPENCODE_PORT || "4096");
      let exposedUrl: string | null = null;

      if (this.env.ENVIRONMENT === "production" && this.env.WORKER_HOSTNAME) {
        try {
          const exposed = await sandbox.exposePort(port, {
            hostname: this.env.WORKER_HOSTNAME,
            name: "opencode",
          });
          exposedUrl = exposed.url; // Use .url instead of .exposedAt
        } catch (error) {
          console.warn("Failed to expose port (expected in local dev):", error);
          // In local dev, we can't expose preview URLs
          // The sandbox is still running and accessible via Docker
        }
      }

      // Update session with URL and mark as ready
      this.session.url = exposedUrl;
      this.session.status = "ready";
      await this.saveSession();

      return new Response(
        JSON.stringify({
          id: this.session.id,
          url: this.session.url,
          status: this.session.status,
          createdAt: this.session.createdAt,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } catch (error) {
      this.session.status = "error";
      this.session.errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      await this.saveSession();

      throw error;
    }
  }

  private async terminateSandbox(): Promise<void> {
    if (!this.session || !this.session.sandboxId) {
      return;
    }

    const sandbox = getSandbox(this.env.Sandbox, this.session.sandboxId);

    try {
      await sandbox.destroy();
    } catch (error) {
      console.error("Error destroying sandbox:", error);
    }

    this.session.status = "terminated";
    this.session.url = null;
    await this.saveSession();
  }

  private async loadSession(): Promise<void> {
    if (!this.session) {
      this.session =
        ((await this.state.storage.get("session")) as SandboxSession) || null;
    }
  }

  private async saveSession(): Promise<void> {
    if (this.session) {
      await this.state.storage.put("session", this.session);
    }
  }
}
