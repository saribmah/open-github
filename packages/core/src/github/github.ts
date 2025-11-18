// GitHub API integration and repository validation
import type { RepoMetadata } from "../types";
import { GitHubError } from "../utils/errors";

export class GitHubClient {
  private apiUrl: string;
  private token?: string;

  constructor(apiUrl: string, token?: string) {
    this.apiUrl = apiUrl;
    this.token = token;
  }

  /**
   * Build headers for GitHub API requests
   */
  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "open-github/1.0",
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }

  /**
   * Validate that a repository exists and is accessible
   */
  async validateRepository(owner: string, repo: string): Promise<boolean> {
    try {
      await this.getRepositoryMetadata(owner, repo);
      return true;
    } catch (error) {
      if (error instanceof GitHubError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Fetch repository metadata from GitHub API
   */
  async getRepositoryMetadata(
    owner: string,
    repo: string,
  ): Promise<RepoMetadata> {
    // Validate inputs
    if (!owner || !repo) {
      throw new GitHubError("Repository owner and name are required", 400);
    }

    const url = `${this.apiUrl}/repos/${owner}/${repo}`;
    const headers = this.buildHeaders();

    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = `Failed to fetch repository: ${response.statusText}`;

        // Try to parse error details from GitHub API
        try {
          const errorData = JSON.parse(errorBody);
          if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // Ignore JSON parse errors
        }

        throw new GitHubError(errorMessage, response.status);
      }

      const data = (await response.json()) as any;

      return {
        owner: data.owner.login,
        name: data.name,
        fullName: data.full_name,
        defaultBranch: data.default_branch,
        cloneUrl: data.clone_url,
        isPrivate: data.private,
        language: data.language,
        size: data.size,
      };
    } catch (error) {
      if (error instanceof GitHubError) {
        throw error;
      }
      // Handle network errors
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new GitHubError(
          "Network error: Failed to connect to GitHub API",
          503,
        );
      }
      throw new GitHubError(`Failed to fetch repository metadata: ${error}`);
    }
  }

  /**
   * Get the default branch for a repository
   */
  async getDefaultBranch(owner: string, repo: string): Promise<string> {
    const metadata = await this.getRepositoryMetadata(owner, repo);
    return metadata.defaultBranch;
  }

  /**
   * Check rate limit status
   */
  async checkRateLimit(): Promise<{
    remaining: number;
    limit: number;
    reset: Date;
  }> {
    const url = `${this.apiUrl}/rate_limit`;
    const headers = this.buildHeaders();

    try {
      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new GitHubError(
          `Failed to check rate limit: ${response.statusText}`,
          response.status,
        );
      }

      const data = (await response.json()) as any;

      return {
        remaining: data.rate.remaining,
        limit: data.rate.limit,
        reset: new Date(data.rate.reset * 1000),
      };
    } catch (error) {
      if (error instanceof GitHubError) {
        throw error;
      }
      throw new GitHubError(`Failed to check rate limit: ${error}`);
    }
  }

  /**
   * Check if a repository is public
   */
  async isPublicRepository(owner: string, repo: string): Promise<boolean> {
    try {
      const metadata = await this.getRepositoryMetadata(owner, repo);
      return !metadata.isPrivate;
    } catch (error) {
      if (error instanceof GitHubError && error.statusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get repository clone URL (HTTPS)
   */
  async getCloneUrl(owner: string, repo: string): Promise<string> {
    const metadata = await this.getRepositoryMetadata(owner, repo);
    return metadata.cloneUrl;
  }
}
