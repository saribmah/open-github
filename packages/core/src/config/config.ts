// Configuration management with Zod validation
import { z } from "zod";
import type { AppConfig } from "../types";

// Zod schemas for validation
const sandboxProviderSchema = z.enum(["docker", "daytona"]);

const dockerConfigSchema = z.object({
  image: z.string().min(1, "Docker image name is required"),
  network: z.string().default("open-github-network"),
  memoryLimit: z
    .string()
    .regex(/^\d+[kmg]$/i, "Invalid memory limit format (e.g., 2g, 512m)")
    .default("2g"),
  cpuLimit: z.number().positive("CPU limit must be positive").default(1),
});

const daytonaConfigSchema = z.object({
  apiUrl: z.string(),
  apiKey: z.string(),
  workspaceClass: z.enum(["small", "medium", "large"]).default("small"),
  proxyDomain: z.string().optional(), // Optional custom proxy domain
});

const sandboxConfigSchema = z.object({
  provider: sandboxProviderSchema,
  docker: dockerConfigSchema,
  daytona: daytonaConfigSchema,
  sessionTimeout: z
    .number()
    .positive("Session timeout must be positive")
    .default(3600),
  maxConcurrent: z
    .number()
    .positive("Max concurrent sandboxes must be positive")
    .default(10),
});

const githubConfigSchema = z.object({
  token: z.string().optional(),
  apiUrl: z.string().default("https://api.github.com"),
});

const serverConfigSchema = z.object({
  port: z
    .number()
    .int()
    .min(1)
    .max(65535, "Port must be between 1 and 65535")
    .default(3001),
  host: z.string().default("0.0.0.0"),
  allowedOrigins: z
    .array(z.string().min(1))
    .min(1, "At least one allowed origin is required")
    .default(["http://localhost:5173"]),
});

const appConfigSchema = z.object({
  sandbox: sandboxConfigSchema,
  github: githubConfigSchema,
  server: serverConfigSchema,
});

/**
 * Parse integer from environment variable with fallback
 */
function parseIntEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Load and validate configuration from environment variables
 *
 * Environment variables:
 * - SANDBOX_PROVIDER: 'docker' | 'daytona' (default: docker)
 * - DOCKER_IMAGE: Docker image name (required if provider=docker)
 * - DAYTONA_API_URL: Daytona API endpoint (required if provider=daytona)
 * - DAYTONA_API_KEY: Daytona API key (required if provider=daytona)
 * - SESSION_TIMEOUT: Session timeout in seconds (default: 3600)
 * - MAX_CONCURRENT_SANDBOXES: Max concurrent sandboxes (default: 10)
 * - GITHUB_TOKEN: Optional GitHub token for higher rate limits
 * - PORT: Server port (default: 3001)
 * - ALLOWED_ORIGINS: Comma-separated list of allowed origins
 */
function loadConfig(): AppConfig {
  const provider = (process.env.SANDBOX_PROVIDER || "docker") as
    | "docker"
    | "daytona";

  const rawConfig = {
    sandbox: {
      provider,
      docker: {
        image: process.env.DOCKER_IMAGE || "open-github-sandbox:latest",
        network: process.env.DOCKER_NETWORK || "open-github-network",
        memoryLimit: process.env.DOCKER_MEMORY_LIMIT || "2g",
        cpuLimit: parseIntEnv(process.env.DOCKER_CPU_LIMIT, 1),
      },
      daytona: {
        apiUrl: process.env.DAYTONA_API_URL || "https://app.daytona.io/api",
        apiKey:
          process.env.DAYTONA_API_KEY ||
          "dtn_a49447e431ee194dc564339c53d0d183b481cd12399d8fb31d81876266db5067",
        workspaceClass: (process.env.DAYTONA_WORKSPACE_CLASS || "small") as
          | "small"
          | "medium"
          | "large",
        proxyDomain: process.env.DAYTONA_PROXY_DOMAIN || "http://localhost:3002", // Optional proxy domain
      },
      sessionTimeout: parseIntEnv(process.env.SESSION_TIMEOUT, 3600),
      maxConcurrent: parseIntEnv(process.env.MAX_CONCURRENT_SANDBOXES, 10),
    },
    github: {
      token: process.env.GITHUB_TOKEN,
      apiUrl: process.env.GITHUB_API_URL || "https://api.github.com",
    },
    server: {
      port: parseIntEnv(process.env.PORT, 3001),
      host: process.env.HOST || "0.0.0.0",
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(",").map((o) =>
        o.trim(),
      ) || ["http://localhost:5173"],
    },
  };

  try {
    const validated = appConfigSchema.parse(rawConfig);

    // Additional validation: check provider-specific requirements
    if (validated.sandbox.provider === "daytona") {
      if (
        !validated.sandbox.daytona.apiUrl ||
        !validated.sandbox.daytona.apiKey
      ) {
        throw new Error(
          "Daytona provider requires DAYTONA_API_URL and DAYTONA_API_KEY environment variables",
        );
      }
    }

    // Log configuration (without sensitive data)
    console.log("Configuration loaded successfully:");
    console.log(`  Provider: ${validated.sandbox.provider}`);
    console.log(`  Session timeout: ${validated.sandbox.sessionTimeout}s`);
    console.log(`  Max concurrent: ${validated.sandbox.maxConcurrent}`);
    console.log(`  Server: ${validated.server.host}:${validated.server.port}`);

    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("\n❌ Configuration validation failed:\n");
      error.issues.forEach((issue) => {
        console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
      });
      console.error(
        "\nPlease check your environment variables. See .env.example for reference.\n",
      );
      throw new Error("Invalid configuration");
    }
    throw error;
  }
}

// Export singleton config instance
export const config = loadConfig();

/**
 * Validate a configuration object
 */
export function validateConfig(cfg: unknown): AppConfig {
  return appConfigSchema.parse(cfg);
}

/**
 * Get a provider-specific configuration
 */
export function getProviderConfig(cfg: AppConfig) {
  if (cfg.sandbox.provider === "docker") {
    return cfg.sandbox.docker;
  } else {
    return cfg.sandbox.daytona;
  }
}
