// Docker-based sandbox provider implementation
import type {
  SandboxConfig,
  SandboxResult,
  SandboxStatus,
  DockerConfig,
} from "../types";
import type { SandboxProvider } from "./sandbox";
import { SandboxProvisionError } from "../utils/errors";

interface DockerInspect {
  State: {
    Status: string;
    Running: boolean;
    Paused: boolean;
    Restarting: boolean;
    Dead: boolean;
    ExitCode: number;
  };
  NetworkSettings: {
    Ports: Record<string, Array<{ HostPort: string }> | null>;
  };
}

export class DockerProvider implements SandboxProvider {
  private config: DockerConfig;

  constructor(config: DockerConfig) {
    this.config = config;
  }

  /**
   * Execute a Docker command
   */
  private async exec(args: string[]): Promise<string> {
    const proc = Bun.spawn(["docker", ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const error = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(`Docker command failed: ${error || output}`);
    }

    return output.trim();
  }

  /**
   * Generate unique container name from session ID
   */
  private getContainerName(sessionId: string): string {
    return `open-github-${sessionId}`;
  }

  /**
   * Build repository clone URL
   */
  private buildRepoUrl(config: SandboxConfig): string {
    return `https://github.com/${config.owner}/${config.repo}.git`;
  }

  /**
   * Provision a new Docker container for the repository
   */
  async provision(config: SandboxConfig): Promise<SandboxResult> {
    const containerName = this.getContainerName(config.sessionId);
    const repoUrl = config.cloneUrl || this.buildRepoUrl(config);

    try {
      console.log(`🐳 Provisioning Docker container: ${containerName}`);
      console.log(`   Repository: ${config.owner}/${config.repo}`);
      console.log(`   Branch: ${config.branch || "default"}`);

      // Check if Docker is available
      try {
        await this.exec(["version", "--format", "{{.Server.Version}}"]);
      } catch (error) {
        throw new SandboxProvisionError(
          "Docker is not available. Please ensure Docker is installed and running.",
          "docker",
        );
      }

      // Check if image exists locally, pull if not
      try {
        await this.exec(["inspect", this.config.image]);
      } catch {
        console.log(`   📥 Pulling Docker image: ${this.config.image}`);
        await this.exec(["pull", this.config.image]);
      }

      // Build Docker run command
      const runArgs = [
        "run",
        "-d", // Detached mode
        "--name",
        containerName,
        "--network",
        this.config.network,
        "-e",
        `REPO_URL=${repoUrl}`,
        "-e",
        `BRANCH=${config.branch || ""}`,
        "-e",
        `SESSION_ID=${config.sessionId}`,
        "-p",
        "4096", // Auto-assign host port for container port 4096
        "--memory",
        this.config.memoryLimit,
        `--cpus=${this.config.cpuLimit}`,
        this.config.image,
      ];

      // Start the container
      const containerId = await this.exec(runArgs);
      console.log(`   ✅ Container started: ${containerId.substring(0, 12)}`);

      // Get the assigned port
      const portInfo = await this.exec(["port", containerId, "4096"]);

      // Parse port (format: "0.0.0.0:12345\n[::]:12345")
      // Take first line and extract port number
      const firstLine = portInfo.split("\n")[0]?.trim() || "";
      const parts = firstLine.split(":");
      const hostPort = parts[parts.length - 1] || "4096";
      // Use 127.0.0.1 instead of localhost to avoid IPv6 issues
      const url = `http://127.0.0.1:${hostPort}`;

      console.log(`   🌐 Sandbox URL: ${url}`);

      // Wait for container to be ready (basic check)
      await this.waitForContainer(containerId, 5000);

      return {
        id: containerId,
        url,
        status: "ready",
      };
    } catch (error) {
      console.error(`   ❌ Failed to provision container:`, error);

      // Cleanup on failure
      try {
        await this.terminate(containerName);
      } catch {
        // Ignore cleanup errors
      }

      throw new SandboxProvisionError(
        `Failed to provision Docker container: ${error}`,
        "docker",
      );
    }
  }

  /**
   * Wait for container to be running
   */
  private async waitForContainer(
    containerId: string,
    timeoutMs: number,
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const status = await this.getStatus(containerId);
        if (status.status === "ready") {
          return;
        }
      } catch {
        // Container not ready yet
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    throw new Error("Container failed to start within timeout");
  }

  /**
   * Get the status of a Docker container
   */
  async getStatus(containerId: string): Promise<SandboxStatus> {
    try {
      const output = await this.exec([
        "inspect",
        "--format",
        "{{json .}}",
        containerId,
      ]);

      const data = JSON.parse(output) as DockerInspect;

      if (!data.State.Running) {
        return {
          id: containerId,
          status: "terminated",
          error: `Container exited with code ${data.State.ExitCode}`,
        };
      }

      if (data.State.Paused) {
        return {
          id: containerId,
          status: "error",
          error: "Container is paused",
        };
      }

      // Get port mapping
      const ports = data.NetworkSettings.Ports["4096/tcp"];
      const hostPort = (ports?.[0]?.HostPort || "4096").toString().trim();
      // Use 127.0.0.1 instead of localhost to avoid IPv6 issues
      const url = `http://127.0.0.1:${hostPort}`;

      return {
        id: containerId,
        status: "ready",
        url,
      };
    } catch (error) {
      return {
        id: containerId,
        status: "error",
        error: `Failed to get container status: ${error}`,
      };
    }
  }

  /**
   * Terminate a Docker container
   */
  async terminate(containerId: string): Promise<void> {
    try {
      console.log(`🗑️  Terminating container: ${containerId}`);

      // Stop the container (with 10 second timeout)
      try {
        await this.exec(["stop", "-t", "10", containerId]);
        console.log(`   ✅ Container stopped`);
      } catch (error) {
        console.log(`   ⚠️  Failed to stop container gracefully: ${error}`);
      }

      // Remove the container
      try {
        await this.exec(["rm", "-f", containerId]);
        console.log(`   ✅ Container removed`);
      } catch (error) {
        console.log(`   ⚠️  Failed to remove container: ${error}`);
      }
    } catch (error) {
      throw new Error(`Failed to terminate container: ${error}`);
    }
  }

  /**
   * Check if a Docker container is healthy
   */
  async healthCheck(containerId: string): Promise<boolean> {
    try {
      const status = await this.getStatus(containerId);

      if (status.status !== "ready") {
        return false;
      }

      // Optional: Add HTTP health check to sandbox URL
      if (status.url) {
        try {
          const response = await fetch(`${status.url}/health`, {
            signal: AbortSignal.timeout(2000),
          });
          return response.ok;
        } catch {
          // Health endpoint might not be ready yet
          return true; // Container is running at least
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all containers managed by this provider
   */
  async listContainers(): Promise<string[]> {
    try {
      const output = await this.exec([
        "ps",
        "-a",
        "--filter",
        "name=open-github-",
        "--format",
        "{{.ID}}",
      ]);

      if (!output) return [];
      return output.split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Cleanup all stopped containers
   */
  async cleanupStoppedContainers(): Promise<number> {
    try {
      const containers = await this.listContainers();
      let cleaned = 0;

      for (const containerId of containers) {
        const status = await this.getStatus(containerId);
        if (status.status === "terminated" || status.status === "error") {
          await this.terminate(containerId);
          cleaned++;
        }
      }

      console.log(`🧹 Cleaned up ${cleaned} stopped containers`);
      return cleaned;
    } catch (error) {
      console.error("Failed to cleanup containers:", error);
      return 0;
    }
  }
}
