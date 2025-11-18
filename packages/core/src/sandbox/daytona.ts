// Daytona-based sandbox provider implementation
import { Daytona, Sandbox as DaytonaSandbox } from "@daytonaio/sdk";
import type {
  SandboxConfig,
  SandboxResult,
  SandboxStatus,
  DaytonaConfig,
} from "../types";
import type { SandboxProvider } from "./sandbox";
import { SandboxProvisionError } from "../utils/errors";

export class DaytonaProvider implements SandboxProvider {
  private daytona: Daytona;
  private config: DaytonaConfig;
  private snapshotName: string;

  constructor(config: DaytonaConfig) {
    this.config = config;

    if (!config.apiKey) {
      throw new Error("Daytona API key is required");
    }

    // Initialize Daytona SDK
    this.daytona = new Daytona({
      apiKey: config.apiKey,
      target: "us", // Can be made configurable
    });

    // Snapshot name should match what was pushed via build script
    this.snapshotName = "open-github-sandbox:0.2.0";

    console.log("✅ Daytona provider initialized");
  }

  /**
   * Provision a new Daytona workspace for the repository
   */
  async provision(config: SandboxConfig): Promise<SandboxResult> {
    try {
      console.log(
        `🚀 Provisioning Daytona workspace for ${config.owner}/${config.repo}`,
      );

      // Create Daytona sandbox with snapshot
      const sandbox = await this.daytona.create({
        snapshot: this.snapshotName,
        autoStopInterval: 45, // Stop after 45 minutes of inactivity
        autoDeleteInterval: 0, // Don't auto-delete (we manage cleanup)
        public: true, // Make workspace accessible
      });

      console.log(`  ✅ Daytona sandbox created: ${sandbox.id}`);

      // Get preview link for OpenCode server (port 4096)
      const previewLink = await sandbox.getPreviewLink(4096);

      console.log(`  🌐 Preview URL: ${previewLink.url}`);

      // Start the OpenCode server with repository
      await this.startOpenCodeServer(sandbox, config);

      // Wait for server to be ready
      await this.waitForServerReady(previewLink.url);

      return {
        id: sandbox.id,
        url: previewLink.url,
        status: "ready",
      };
    } catch (error) {
      console.error(`  ❌ Daytona provisioning failed:`, error);
      throw new SandboxProvisionError(
        `Failed to provision Daytona workspace: ${error}`,
        "daytona",
      );
    }
  }

  /**
   * Start OpenCode server in the Daytona sandbox
   */
  private async startOpenCodeServer(
    sandbox: DaytonaSandbox,
    config: SandboxConfig,
  ): Promise<void> {
    try {
      console.log(`  🔧 Starting OpenCode server...`);

      // Create a process session
      const sessionId = `opencode-${sandbox.id}`;
      await sandbox.process.createSession(sessionId);

      // Build environment variables
      const env = {
        REPO_URL: config.cloneUrl,
        BRANCH: config.branch || "",
        SESSION_ID: config.sessionId,
      };

      const envString = Object.entries(env)
        .map(([key, value]) => `${key}=${value}`)
        .join(" ");

      // Execute startup command
      // This assumes the sandbox has a startup script similar to Docker version
      const command = `${envString} /startup.sh`;

      const result = await sandbox.process.executeSessionCommand(sessionId, {
        command,
        runAsync: true,
      });

      console.log(`  ✅ OpenCode server started (command ID: ${result.cmdId})`);

      // Optionally stream logs (disabled for now - check SDK documentation for correct usage)
      // if (process.env.DAYTONA_LOGS_ENABLED === "true") {
      //   sandbox.process
      //     .getSessionCommandLogs(sessionId, result.cmdId!, (data) =>
      //       console.log(`[Daytona] ${data}`),
      //     )
      //     .catch(() => {});
      // }
    } catch (error) {
      console.error(`  ❌ Failed to start OpenCode server:`, error);
      throw error;
    }
  }

  /**
   * Wait for OpenCode server to be ready
   */
  private async waitForServerReady(
    url: string,
    maxAttempts = 5,
  ): Promise<void> {
    console.log(`  ⏳ Waiting for OpenCode server to be ready...`);

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const response = await fetch(`${url}/docs`, {
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          console.log(`  ✅ OpenCode server is ready`);
          return;
        }
      } catch(e) {
        // Server not ready yet
          console.log(e)
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // throw new Error("OpenCode server failed to start within timeout");
  }

  /**
   * Get the status of a Daytona workspace
   */
  async getStatus(workspaceId: string): Promise<SandboxStatus> {
    try {
      const sandbox = await this.daytona.get(workspaceId);

      // Map Daytona states to our status
      let status: SandboxStatus["status"];
      switch (sandbox.state) {
        case "started":
          status = "ready";
          break;
        case "stopped":
          status = "terminated";
          break;
        case "creating":
        case "starting":
          status = "provisioning";
          break;
        default:
          status = "error";
      }

      // Get preview URL if sandbox is running
      let url: string | undefined;
      if (status === "ready") {
        const previewLink = await sandbox.getPreviewLink(4096);
        url = previewLink.url;
      }

      return {
        id: workspaceId,
        status,
        url,
      };
    } catch (error) {
      return {
        id: workspaceId,
        status: "error",
        error: `Failed to get workspace status: ${error}`,
      };
    }
  }

  /**
   * Terminate a Daytona workspace
   */
  async terminate(workspaceId: string): Promise<void> {
    try {
      console.log(`🗑️  Terminating Daytona workspace: ${workspaceId}`);

      const sandbox = await this.daytona.get(workspaceId);

      // Stop the sandbox first
      await this.daytona.stop(sandbox);
      console.log(`  ✅ Workspace stopped`);

      // Delete the sandbox
      await this.daytona.delete(sandbox);
      console.log(`  ✅ Workspace deleted`);
    } catch (error) {
      console.error(`  ⚠️  Failed to terminate workspace:`, error);
      throw new Error(`Failed to terminate Daytona workspace: ${error}`);
    }
  }

  /**
   * Check if a Daytona workspace is healthy
   */
  async healthCheck(workspaceId: string): Promise<boolean> {
    try {
      const status = await this.getStatus(workspaceId);

      if (status.status !== "ready" || !status.url) {
        return false;
      }

      // Check if OpenCode server is responding
      try {
        const response = await fetch(`${status.url}/docs`, {
          signal: AbortSignal.timeout(2000),
        });
        return response.ok;
      } catch {
        return false;
      }
    } catch {
      return false;
    }
  }

  /**
   * Get an active sandbox by ID
   */
  async getActiveSandbox(
    workspaceId: string,
  ): Promise<DaytonaSandbox | undefined> {
    try {
      const sandbox = await this.daytona.get(workspaceId);
      return sandbox.state === "started" ? sandbox : undefined;
    } catch (error) {
      console.error(`Failed to check Daytona workspace status: ${error}`);
      return undefined;
    }
  }
}
