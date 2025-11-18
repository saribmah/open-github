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
          return await this.createSandbox(request.url, body);
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

  private async createSandbox(hostname: string, params: {
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

      console.log(`Creating sandbox for ${params.owner}/${params.repo}`);

      // Execute git clone
      console.log(`Cloning repository: ${repoUrl}`);

      const cloneCommand = params.branch
        ? `cd /workspace && git clone --depth 1 --branch ${params.branch} ${repoUrl} repo 2>&1 || git clone --depth 1 ${repoUrl} repo 2>&1`
        : `cd /workspace && git clone --depth 1 ${repoUrl} repo 2>&1`;

      const cloneResult = await sandbox.exec(cloneCommand);
      console.log("Clone result:", cloneResult);

      if (!cloneResult.success) {
        throw new Error(
          `Failed to clone repository: ${cloneResult.stderr || cloneResult.stdout}`,
        );
      }

      // Verify the clone worked by checking the directory
      const verifyResult = await sandbox.exec(`ls -la /workspace/repo`);
      console.log("Verify result:", verifyResult);

      // Update status to starting (installing OpenCode)
      this.session.status = "starting";
      await this.saveSession();

      // Install OpenCode
      console.log("Installing OpenCode...");
      const installCommand = `curl -fsSL https://opencode.ai/install | bash`;
      const installResult = await sandbox.exec(installCommand);
      console.log("OpenCode install result:", installResult);

      if (!installResult.success) {
        console.warn(
          "OpenCode installation failed, but continuing:",
          installResult.stderr || installResult.stdout,
        );
        // Don't throw error - we can continue without OpenCode for now
      }

      // Verify OpenCode is installed (check the actual binary location)
      const ocVerifyResult = await sandbox.exec(
        `/root/.opencode/bin/opencode --version 2>&1 || echo "OpenCode not found"`,
      );
      console.log("OpenCode verify result:", ocVerifyResult);

      // Start OpenCode server in background
      console.log("Starting OpenCode server...");
      const port = parseInt(this.env.OPENCODE_PORT || "4096");

      await sandbox.startProcess(
        `/root/.opencode/bin/opencode serve --port=${port} --hostname=0.0.0.0`,
        {
          cwd: "/workspace/repo",
          env: {
            PATH: "/root/.opencode/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
          },
        },
      );
      console.log(`OpenCode server started on port ${port}`);

      // Wait for OpenCode server to be ready
      console.log("Waiting for OpenCode server to be ready...");
      let serverReady = false;
      for (let i = 0; i < 15; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check if server is responding (any response means it's running)
        const healthCheck = await sandbox.exec(
          `curl -s -o /dev/null -w "%{http_code}" http://localhost:${port}/ 2>&1`,
        );

        // Any HTTP response code means the server is running (200, 404, etc.)
        if (healthCheck.success && healthCheck.stdout.match(/^[2-5]\d{2}$/)) {
          serverReady = true;
          console.log(`OpenCode server is ready! (HTTP ${healthCheck.stdout})`);
          break;
        }
        console.log(`Waiting for server... attempt ${i + 1}/15`);
      }

      if (!serverReady) {
        console.warn(
          "OpenCode server did not become ready in time, but continuing...",
        );
      }

      // Expose the port and get preview URL
      let exposedUrl: string | null = null;

      if (this.env.ENVIRONMENT === "production" && this.env.WORKER_HOSTNAME) {
        try {
          const exposed = await sandbox.exposePort(port, {
            hostname: this.env.WORKER_HOSTNAME,
            name: "opencode",
          });
          // The SDK returns { exposedAt, port, name }
          exposedUrl = (exposed as any).exposedAt || null;
          console.log("OpenCode server exposed at:", exposedUrl);
        } catch (error) {
          console.warn("Failed to expose port (expected in local dev):", error);
          // In local dev, we can't expose preview URLs
          // The sandbox is still running and accessible via Docker
        }
      } else {
        console.log("Running in development mode - port exposure skipped");
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
