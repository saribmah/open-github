// Core type definitions for the Open GitHub platform

// Session Types
export type SessionStatus = "provisioning" | "ready" | "error" | "terminated";
export type SandboxProvider = "docker" | "daytona";

export interface Session {
  id: string; // ULID
  userId: string; // Browser fingerprint or user identifier
  owner: string;
  repo: string;
  sandboxUrl: string;
  provider: SandboxProvider;
  status: SessionStatus;
  containerId?: string; // For Docker
  workspaceId?: string; // For Daytona
  createdAt: Date;
  lastAccessedAt: Date;
  expiresAt: Date;
  error?: string;
}

// GitHub Types
export interface RepoMetadata {
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  cloneUrl: string;
  isPrivate: boolean;
  language?: string;
  size: number;
}

// Sandbox Types
export interface SandboxConfig {
  sessionId: string;
  owner: string;
  repo: string;
  branch?: string;
  cloneUrl: string;
}

export interface SandboxResult {
  id: string; // Container/workspace ID
  url: string; // WebSocket/HTTP URL for OpenCode server
  status: "provisioning" | "ready";
}

export interface SandboxStatus {
  id: string;
  status: SessionStatus;
  url?: string;
  error?: string;
}

// Configuration Types
export interface DockerConfig {
  image: string;
  network: string;
  memoryLimit: string;
  cpuLimit: number;
}

export interface DaytonaConfig {
  apiUrl: string;
  apiKey: string;
  workspaceClass: string;
}

export interface SandboxConfiguration {
  provider: SandboxProvider;
  docker: DockerConfig;
  daytona: DaytonaConfig;
  sessionTimeout: number;
  maxConcurrent: number;
}

export interface GitHubConfig {
  token?: string;
  apiUrl: string;
}

export interface ServerConfig {
  port: number;
  host: string;
  allowedOrigins: string[];
}

export interface AppConfig {
  sandbox: SandboxConfiguration;
  github: GitHubConfig;
  server: ServerConfig;
}
