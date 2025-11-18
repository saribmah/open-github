// @ts-ignore - Re-export for Cloudflare Workers runtime
export { Sandbox } from "@cloudflare/sandbox";
export { SandboxManager } from "./sandbox-manager";

import type { Env, CreateSandboxRequest, SandboxResponse } from "./types";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // POST /sandbox/create - Create a new sandbox
      if (path === "/sandbox/create" && request.method === "POST") {
        const body = (await request.json()) as CreateSandboxRequest;

        // Validate input
        if (!body.owner || !body.repo || !body.sessionId) {
          return new Response(
            JSON.stringify({
              error: "Missing required fields: owner, repo, sessionId",
            }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        // Get or create the session manager for this sessionId
        const managerId = env.SANDBOX_MANAGER.idFromName(body.sessionId);
        const manager = env.SANDBOX_MANAGER.get(managerId);

        // Create sandbox via Durable Object
        const response = await manager.fetch(request.url, {
          method: "POST",
          body: JSON.stringify({
            action: "create",
            owner: body.owner,
            repo: body.repo,
            branch: body.branch || env.DEFAULT_BRANCH,
            sessionId: body.sessionId,
            githubToken: body.githubToken || env.GITHUB_TOKEN,
          }),
          headers: { "Content-Type": "application/json" },
        });

        const result = (await response.json()) as SandboxResponse;

        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // GET /sandbox/:id - Get sandbox status
      if (path.startsWith("/sandbox/") && request.method === "GET") {
        const sessionId = path.split("/")[2];

        if (!sessionId) {
          return new Response(
            JSON.stringify({ error: "Session ID required" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const managerId = env.SANDBOX_MANAGER.idFromName(sessionId);
        const manager = env.SANDBOX_MANAGER.get(managerId);

        const response = await manager.fetch(request.url, {
          method: "GET",
        });

        const result = await response.json();

        return new Response(JSON.stringify(result), {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // DELETE /sandbox/:id - Terminate sandbox
      if (path.startsWith("/sandbox/") && request.method === "DELETE") {
        const sessionId = path.split("/")[2];

        if (!sessionId) {
          return new Response(
            JSON.stringify({ error: "Session ID required" }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const managerId = env.SANDBOX_MANAGER.idFromName(sessionId);
        const manager = env.SANDBOX_MANAGER.get(managerId);

        await manager.fetch(request.url, {
          method: "DELETE",
        });

        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      }

      // Health check endpoint
      if (path === "/health" && request.method === "GET") {
        return new Response(
          JSON.stringify({
            status: "healthy",
            timestamp: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // 404 for unknown routes
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (error) {
      console.error("Worker error:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  },
};
