import express from "express";
import type { Request, Response } from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import { createProxyMiddleware, type Options } from "http-proxy-middleware";
import { Daytona } from "@daytonaio/sdk";

dotenv.config({ quiet: true });

const DAYTONA_API_KEY = process.env.DAYTONA_API_KEY;
const PORT = process.env.PORT || 3002;
const PROXY_DOMAIN = process.env.PROXY_DOMAIN || "localhost";
const CACHE_TTL = parseInt(process.env.CACHE_TTL || "300000", 10); // 5 minutes default

if (!DAYTONA_API_KEY) {
  throw new Error("DAYTONA_API_KEY is not set");
}

// Initialize Daytona SDK
const daytona = new Daytona({
  apiKey: DAYTONA_API_KEY,
  target: "us", // Can be made configurable
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

// Custom request interface to store error info
interface CustomRequest extends Request {
  _err?: Error;
  _targetUrl?: string;
}

/**
 * Create proxy middleware
 */
const proxyOptions: Options<Request, Response> = {
  router: async (req: Request) => {
    const customReq = req as CustomRequest;
    try {
      if (!req.headers.host) {
        throw new Error("Host header is required");
      }

      const { sandboxId, port } = parseSandboxInfo(req.headers.host);
      const url = await getPreviewUrl(sandboxId, port);

      customReq._targetUrl = url;
      console.log(`🔄 Proxying ${req.method} ${req.url} → ${url}`);

      return url;
    } catch (error) {
      console.error("❌ Router error:", error);
      customReq._err = error as Error;
    }

    // Return dummy URL on error (will be handled by error handlers)
    return "http://localhost:1";
  },
  changeOrigin: true,
  autoRewrite: true,
  ws: true, // Enable WebSocket support
  xfwd: true,
  // SSE (Server-Sent Events) configuration
  // Don't buffer streaming responses
  selfHandleResponse: false,
  // Increase timeout for long-lived connections
  proxyTimeout: 0, // No timeout for streaming
  timeout: 0, // No timeout
  on: {
    proxyReq: (proxyReq, req, res) => {
      const customReq = req as CustomRequest;

      // Add Daytona-specific headers to disable their CORS and preview warning
      // This prevents duplicate CORS headers and skips the preview warning page
      proxyReq.setHeader("X-Daytona-Disable-CORS", "true");
      proxyReq.setHeader("X-Daytona-Skip-Preview-Warning", "true");

      // For SSE (Server-Sent Events), ensure proper headers
      if (
        req.url === "/event" ||
        req.headers.accept?.includes("text/event-stream")
      ) {
        proxyReq.setHeader("Accept", "text/event-stream");
        proxyReq.setHeader("Cache-Control", "no-cache");
        proxyReq.setHeader("Connection", "keep-alive");
        console.log("🌊 Streaming request detected: " + req.url);
      }

      if (
        customReq._err &&
        "writeHead" in res &&
        typeof res.writeHead === "function"
      ) {
        // Add CORS headers to error responses
        const origin = req.headers.origin || "http://localhost:5173";
        res.writeHead(500, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Expose-Headers": "Content-Length,Content-Type",
        });
        if ("end" in res && typeof res.end === "function") {
          res.end(
            JSON.stringify({
              error: "ProxyError",
              message: customReq._err.message || "Failed to proxy request",
            }),
          );
        }
        return;
      }
    },
    proxyRes: (proxyRes, req) => {
      // Daytona won't send CORS headers because we set X-Daytona-Disable-CORS: true
      // Our Express CORS middleware will add the correct headers

      // Handle non-200 responses
      if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
        const customReq = req as CustomRequest;
        console.warn(
          `⚠️  Proxy response error: ${proxyRes.statusCode} for ${customReq._targetUrl}`,
        );
      }
    },
    error: (err, req, res) => {
      console.error("❌ Proxy middleware error:", err);
      if ("writeHead" in res && typeof res.writeHead === "function") {
        // Add CORS headers to error responses
        const origin = req.headers.origin || "http://localhost:5173";
        res.writeHead(502, {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Credentials": "true",
          "Access-Control-Expose-Headers": "Content-Length,Content-Type",
        });
        if ("end" in res && typeof res.end === "function") {
          res.end(
            JSON.stringify({
              error: "BadGateway",
              message: "Failed to connect to sandbox",
            }),
          );
        }
      }
    },
  },
};

const proxyMiddleware = createProxyMiddleware(proxyOptions);

// Create Express app
const app = express();

// CORS configuration - allow requests from any origin
// This is necessary for the frontend to connect to the proxy
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : ["http://localhost:5173", "https://localhost:5173"];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return callback(null, true);

      // Check if origin is in allowed list or matches wildcard
      if (
        ALLOWED_ORIGINS.includes("*") ||
        ALLOWED_ORIGINS.includes(origin) ||
        ALLOWED_ORIGINS.some((allowed) => {
          if (allowed.includes("*")) {
            const pattern = new RegExp(
              "^" + allowed.replace(/\*/g, ".*") + "$",
            );
            return pattern.test(origin);
          }
          return false;
        })
      ) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all origins for now (can restrict later)
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Content-Length", "Content-Type"],
    maxAge: 86400, // 24 hours
  }),
);

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
  const stats: Record<string, any> = {
    totalCached: urlCache.size,
    entries: [],
  };

  const now = Date.now();
  for (const [key, entry] of urlCache.entries()) {
    const age = now - entry.timestamp;
    const remaining = Math.max(0, CACHE_TTL - age);
    stats.entries.push({
      key,
      age: Math.floor(age / 1000),
      remaining: Math.floor(remaining / 1000),
    });
  }

  res.json(stats);
});

// Apply proxy middleware to all other routes
app.use(proxyMiddleware);

// Start server
// Bind to 0.0.0.0 for cloud platforms (Render, Fly.io, Railway, etc.)
const HOST = process.env.HOST || "0.0.0.0";

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
