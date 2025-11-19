export interface CreateSandboxRequest {
  owner: string;
  repo: string;
  branch?: string;
  sessionId: string;
  githubToken?: string; // Optional for private repos
}

export interface SandboxResponse {
  id: string;
  url: string;
  status: SandboxStatus;
  createdAt: string;
  owner?: string;
  repo?: string;
}

export type SandboxStatus =
  | "provisioning"
  | "cloning"
  | "starting"
  | "ready"
  | "error"
  | "terminated";

export interface SandboxSession {
  id: string;
  sessionId: string;
  owner: string;
  repo: string;
  branch: string;
  status: SandboxStatus;
  url: string | null;
  sandboxId: string | null;
  createdAt: string;
  errorMessage?: string;
}

export interface Env {
  SANDBOX_MANAGER: any; // DurableObjectNamespace from Cloudflare Workers
  Sandbox: any; // Sandbox binding from @cloudflare/sandbox
  ASSETS: Fetcher; // Static assets binding for desktop app
  GITHUB_API_URL: string;
  DEFAULT_BRANCH: string;
  OPENCODE_PORT: string;
  GITHUB_TOKEN?: string; // Optional secret for private repos
  ENVIRONMENT?: string;
  WORKER_HOSTNAME?: string;
}
