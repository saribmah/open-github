import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { createProxyMiddleware, type Options } from "http-proxy-middleware";
import { Daytona } from "@daytonaio/sdk";

dotenv.config({ quiet: true });

// Environment variables
const DAYTONA_API_KEY = process.env.DAYTONA_API_KEY;
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || "0.0.0.0";
const PROXY_DOMAIN = process.env.PROXY_DOMAIN || "localhost";
const CACHE_TTL = parseInt(process.env.CACHE_TTL || "300000", 10);
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(",").map((o) =>
  o.trim(),
) || ["*"];

if (!DAYTONA_API_KEY) {
  throw new Error("DAYTONA_API_KEY is not set");
}

// Initialize Daytona SDK
const daytona = new Daytona({
  apiKey: DAYTONA_API_KEY,
  target: "us",
});

// Cache for sandbox preview URLs
interface CacheEntry {
  url: string;
  timestamp: number;
}

const urlCache = new Map<string, CacheEntry>();

// Clean up expired cache entries every minute
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of urlCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      urlCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
  }
}, 60000);

/**
 * Parse sandbox ID and port from subdomain
 * Format: {port}-{sandboxId}.{domain}
 * Example: 4096-abc123def456.proxy.yourdomain.com
 */
function parseSandboxInfo(host: string): {
  sandboxId: string;
  port: number;
} {
  const parts = host.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid host format");
  }

  const subdomain = parts[0];
  if (!subdomain) {
    throw new Error("Invalid subdomain");
  }

  const subdomainParts = subdomain.split("-");

  if (subdomainParts.length < 2) {
    throw new Error("Invalid subdomain format. Expected: {port}-{sandboxId}");
  }

  const portStr = subdomainParts[0];
  if (!portStr) {
    throw new Error("Port is missing from subdomain");
  }

  const port = parseInt(portStr, 10);
  const sandboxId = subdomainParts.slice(1).join("-");

  if (isNaN(port)) {
    throw new Error("Invalid port number");
  }

  return { sandboxId, port };
}

/**
 * Restore UUID format from DNS-safe sandbox ID
 * Converts: 9cbb20f460984cd6ba1cdaf96c2ff9b3 → 9cbb20f4-6098-4cd6-ba1c-daf96c2ff9b3
 */
function restoreUuidFormat(sandboxId: string): string {
  // If already has hyphens, return as-is
  if (sandboxId.includes("-")) {
    return sandboxId;
  }

  // Check if it looks like a UUID without hyphens (32 hex chars)
  if (/^[0-9a-f]{32}$/i.test(sandboxId)) {
    // Standard UUID format: 8-4-4-4-12
    return `${sandboxId.slice(0, 8)}-${sandboxId.slice(8, 12)}-${sandboxId.slice(12, 16)}-${sandboxId.slice(16, 20)}-${sandboxId.slice(20)}`;
  }

  // Not a UUID, return as-is
  return sandboxId;
}

/**
 * Get preview URL with caching
 */
async function getPreviewUrl(sandboxId: string, port: number): Promise<string> {
  const cacheKey = `${sandboxId}:${port}`;

  // Check cache
  const cached = urlCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`✅ Cache hit for ${sandboxId}:${port}`);
    return cached.url;
  }

  // Restore UUID format for Daytona API (converts DNS-safe ID back to UUID)
  const daytonaSandboxId = restoreUuidFormat(sandboxId);

  // Fetch from Daytona SDK
  console.log(`🔍 Fetching preview URL for ${daytonaSandboxId}:${port}`);
  const sandbox = await daytona.get(daytonaSandboxId);

  // Get the preview link for the specified port
  const previewLink = await sandbox.getPreviewLink(port);
  const previewUrl = previewLink.url;

  // Cache the result
  urlCache.set(cacheKey, {
    url: previewUrl,
    timestamp: Date.now(),
  });

  console.log(`💾 Cached preview URL for ${sandboxId}:${port}`);

  return previewUrl;
}

// Extended request interface for error tracking
interface ProxyRequest extends Request {
  proxyError?: Error;
  targetUrl?: string;
}

// Helper function to send JSON error response with CORS headers
function sendError(
  res: Response,
  req: Request,
  status: number,
  error: string,
  message: string,
) {
  const origin = req.headers.origin || "*";
  res.set({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Requested-With",
    "Content-Type": "application/json",
  });
  res.status(status).json({ error, message });
}

// Create proxy middleware
const proxyOptions: Options<Request, Response> = {
  router: async (req: Request) => {
    const proxyReq = req as ProxyRequest;

    try {
      if (!req.headers.host) {
        throw new Error("Host header is required");
      }

      const { sandboxId, port } = parseSandboxInfo(req.headers.host);
      const url = await getPreviewUrl(sandboxId, port);

      proxyReq.targetUrl = url;
      console.log(`🔄 ${req.method} ${req.url} → ${url}`);

      return url;
    } catch (error) {
      console.error("❌ Router error:", error);
      proxyReq.proxyError = error as Error;
      return "http://localhost:1"; // Dummy URL, error handled in proxyReq hook
    }
  },

  changeOrigin: true,
  autoRewrite: true,
  ws: true,
  xfwd: true,
  proxyTimeout: 0,
  timeout: 0,

  on: {
    proxyReq: (proxyReq, req, res) => {
      const customReq = req as ProxyRequest;

      // If there was a routing error, abort the proxy request
      if (customReq.proxyError) {
        proxyReq.destroy();
        return;
      }

      // Set Daytona headers to disable their CORS and preview warning
      proxyReq.setHeader("X-Daytona-Disable-CORS", "true");
      proxyReq.setHeader("X-Daytona-Skip-Preview-Warning", "true");

      // Handle SSE requests
      if (
        req.url === "/event" ||
        req.headers.accept?.includes("text/event-stream")
      ) {
        proxyReq.setHeader("Accept", "text/event-stream");
        proxyReq.setHeader("Cache-Control", "no-cache");
        proxyReq.setHeader("Connection", "keep-alive");
        console.log("🌊 SSE request: " + req.url);
      }
    },

    proxyRes: (proxyRes, req, res) => {
      const proxyReq = req as ProxyRequest;

      // Add CORS headers to the response
      const origin = req.headers.origin || "*";
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Expose-Headers",
        "Content-Length, Content-Type",
      );

      // Log non-200 responses
      if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
        console.warn(
          `⚠️  HTTP ${proxyRes.statusCode} from ${proxyReq.targetUrl}`,
        );
      }
    },

    error: (err, req, res) => {
      console.error("❌ Proxy error:", err.message);
      const proxyReq = req as ProxyRequest;

      // If there was a routing error, send that error
      if (proxyReq.proxyError) {
        sendError(
          res as Response,
          req,
          500,
          "ProxyError",
          proxyReq.proxyError.message,
        );
      } else {
        sendError(
          res as Response,
          req,
          502,
          "BadGateway",
          "Failed to connect to sandbox",
        );
      }
    },
  },
};

const proxyMiddleware = createProxyMiddleware(proxyOptions);

// Create Express app
const app = express();

// CORS middleware - must be before any routes
app.use(
  cors({
    origin: ALLOWED_ORIGINS.includes("*") ? true : ALLOWED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
    ],
    exposedHeaders: ["Content-Length", "Content-Type"],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
);

// Explicit OPTIONS handler for preflight requests
app.options("*", (_req: Request, res: Response) => {
  res.status(204).end();
});

// Health check endpoint
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    cache: {
      size: urlCache.size,
      ttl: CACHE_TTL,
    },
  });
});

// Stats endpoint
app.get("/stats", (_req: Request, res: Response) => {
  const now = Date.now();
  const entries = Array.from(urlCache.entries()).map(([key, entry]) => {
    const age = now - entry.timestamp;
    const remaining = Math.max(0, CACHE_TTL - age);
    return {
      key,
      age: Math.floor(age / 1000),
      remaining: Math.floor(remaining / 1000),
    };
  });

  res.json({
    totalCached: urlCache.size,
    entries,
  });
});

// Apply proxy middleware to all other routes
app.use(proxyMiddleware);

// Start server
app.listen(Number(PORT), HOST, () => {
  console.log("\n" + "=".repeat(60));
  console.log("🔄 Open GitHub Daytona Proxy Server");
  console.log("=".repeat(60));
  console.log(`\n📍 Server: http://${HOST}:${PORT}`);
  console.log(`🌐 Domain: ${PROXY_DOMAIN}`);
  console.log(`💾 Cache TTL: ${CACHE_TTL / 1000}s`);
  console.log(`\n📝 URL Format: {port}-{sandboxId}.${PROXY_DOMAIN}`);
  console.log(`   Example: 4096-abc123.${PROXY_DOMAIN}`);
  console.log("\n" + "=".repeat(60) + "\n");
});
