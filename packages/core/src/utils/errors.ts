// Custom error classes for the Open GitHub platform

export class GitHubError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export class SandboxProvisionError extends Error {
  constructor(
    message: string,
    public provider?: string,
  ) {
    super(message);
    this.name = "SandboxProvisionError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

export class ResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResourceLimitError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

// Error response formatter
export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  field?: string;
}

export function formatErrorResponse(error: Error): ErrorResponse {
  if (error instanceof GitHubError) {
    return {
      error: "GitHubError",
      message: error.message,
      statusCode: error.statusCode || 500,
    };
  }

  if (error instanceof SandboxProvisionError) {
    return {
      error: "SandboxProvisionError",
      message: error.message,
      statusCode: 500,
    };
  }

  if (error instanceof SessionNotFoundError) {
    return {
      error: "SessionNotFoundError",
      message: error.message,
      statusCode: 404,
    };
  }

  if (error instanceof ResourceLimitError) {
    return {
      error: "ResourceLimitError",
      message: error.message,
      statusCode: 429,
    };
  }

  if (error instanceof ValidationError) {
    return {
      error: "ValidationError",
      message: error.message,
      statusCode: 400,
      field: error.field,
    };
  }

  // Generic error
  return {
    error: "InternalServerError",
    message: error.message || "An unexpected error occurred",
    statusCode: 500,
  };
}
