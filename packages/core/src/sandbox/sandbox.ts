// Sandbox orchestrator interface and factory
import type {
  SandboxConfig,
  SandboxResult,
  SandboxStatus,
  SandboxProvider as SandboxProviderType,
} from "../types";

/**
 * Abstract interface for sandbox providers
 */
export interface SandboxProvider {
  /**
   * Provision a new sandbox for a repository
   */
  provision(config: SandboxConfig): Promise<SandboxResult>;

  /**
   * Get the status of a sandbox
   */
  getStatus(id: string): Promise<SandboxStatus>;

  /**
   * Terminate a sandbox
   */
  terminate(id: string): Promise<void>;

  /**
   * Check if a sandbox is healthy
   */
  healthCheck(id: string): Promise<boolean>;
}

/**
 * Factory function to create sandbox providers
 */
export function createSandboxProvider(
  provider: SandboxProviderType,
  config: any,
): SandboxProvider {
  switch (provider) {
    case "docker": {
      const { DockerProvider } = require("./docker");
      return new DockerProvider(config);
    }
    case "daytona": {
      const { DaytonaProvider } = require("./daytona");
      return new DaytonaProvider(config);
    }
    default:
      throw new Error(`Unknown sandbox provider: ${provider}`);
  }
}
