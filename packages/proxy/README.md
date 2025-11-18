# Daytona Proxy Server

A custom proxy server for Open GitHub that bypasses the Daytona preview URL warning screen, providing seamless access to Daytona-hosted sandboxes.

## Problem

When using Daytona's preview URLs directly, users encounter a warning screen that must be accepted before accessing the workspace. This creates friction in the user experience.

## Solution

This proxy server intercepts requests, authenticates with Daytona's API, and forwards traffic directly to the sandbox without the warning screen. It includes caching to minimize API calls and improve performance.

## Features

- **Transparent Proxying**: Routes traffic to Daytona sandboxes without warning screens
- **Intelligent Caching**: Caches preview URLs for 5 minutes (configurable) to reduce API calls
- **WebSocket Support**: Fully supports WebSocket connections for OpenCode
- **Error Handling**: Graceful error handling with detailed logging
- **Health Monitoring**: Built-in health check and stats endpoints

## Architecture

```
Client Request
    ↓
https://4096-{sandboxId}.proxy.yourdomain.com
    ↓
Proxy Server (this service)
    ↓
Daytona SDK → Get Preview URL (cached)
    ↓
Forward to actual Daytona sandbox
```

## Setup

### 1. Install Dependencies

```bash
cd packages/proxy
bun install
```

### 2. Configure Environment

Create a `.env` file based on `.env.example`:

```bash
# Daytona Configuration
DAYTONA_API_KEY=your-api-key-here
DAYTONA_API_URL=https://app.daytona.io/api

# Proxy Configuration
PORT=3002
PROXY_DOMAIN=proxy.yourdomain.com

# Cache Configuration (in milliseconds)
CACHE_TTL=300000  # 5 minutes
```

### 3. Deploy the Proxy

#### Option A: Local Development

```bash
bun run dev
```

#### Option B: Production Deployment

Deploy to your cloud provider of choice. The service needs to be accessible at your configured domain.

**Example with Docker:**

```dockerfile
FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install
COPY . .
CMD ["bun", "run", "index.ts"]
```

**Example with fly.io:**

```bash
fly launch
fly secrets set DAYTONA_API_KEY=your-key
fly deploy
```

### 4. Configure DNS

Set up a wildcard DNS record pointing to your proxy server:

```
*.proxy.yourdomain.com → your-proxy-server-ip
```

### 5. Configure SSL/TLS

Use a reverse proxy like Nginx or Caddy to handle SSL certificates for the wildcard domain.

**Example Caddyfile:**

```caddy
*.proxy.yourdomain.com {
    reverse_proxy localhost:3002
}
```

### 6. Update Backend Configuration

In your backend service (`packages/core`), set the proxy domain:

```bash
# In packages/core/.env
DAYTONA_PROXY_DOMAIN=proxy.yourdomain.com
```

## URL Format

The proxy uses a specific URL format to identify the sandbox and port:

```
https://{port}-{sandboxId}.{PROXY_DOMAIN}
```

**Example:**

- Sandbox ID: `abc123def456`
- Port: `4096` (OpenCode server)
- Proxy Domain: `proxy.yourdomain.com`
- **Result**: `https://4096-abc123def456.proxy.yourdomain.com`

## API Endpoints

### Health Check

```bash
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2025-11-17T22:30:00.000Z",
  "cache": {
    "size": 5,
    "ttl": 300000
  }
}
```

### Cache Stats

```bash
GET /stats
```

**Response:**

```json
{
  "totalCached": 5,
  "entries": [
    {
      "key": "abc123:4096",
      "age": 120,
      "remaining": 180
    }
  ]
}
```

## Caching Strategy

The proxy caches Daytona preview URLs to reduce API calls:

1. **Cache Key**: `{sandboxId}:{port}`
2. **TTL**: 5 minutes (configurable via `CACHE_TTL`)
3. **Automatic Cleanup**: Runs every minute to remove expired entries

### Why Caching?

- **Performance**: Eliminates API roundtrip for cached URLs
- **Rate Limiting**: Reduces load on Daytona API
- **Reliability**: Works even if Daytona API is temporarily slow

## Monitoring

### Logs

The proxy logs all important events:

```
✅ Cache hit for abc123:4096
🔍 Fetching preview URL for def456:4096
💾 Cached preview URL for def456:4096
🔄 Proxying GET /docs → https://...
⚠️  Proxy response error: 404
❌ Proxy middleware error: ...
🧹 Cleaned 3 expired cache entries
```

### Metrics to Monitor

- Cache hit rate (check logs for `✅ Cache hit` vs `🔍 Fetching`)
- Response times
- Error rates
- Active cache entries (`/stats`)

## Security Considerations

### API Key Protection

- Store `DAYTONA_API_KEY` securely (use environment variables or secrets manager)
- Never commit API keys to version control
- Rotate keys regularly

### Access Control

The proxy forwards requests to **any** sandbox ID provided in the URL. Consider adding:

1. **Validation**: Verify that the requesting user owns the sandbox
2. **Rate Limiting**: Prevent abuse with rate limiting middleware
3. **IP Whitelisting**: Restrict proxy access to known IPs (optional)

### HTTPS

Always use HTTPS in production:

- SSL certificate for wildcard domain (`*.proxy.yourdomain.com`)
- Use Let's Encrypt or your cloud provider's SSL service

## Troubleshooting

### Issue: "Invalid host format" error

**Cause**: Request didn't include proper subdomain format

**Solution**: Ensure URLs match `{port}-{sandboxId}.{domain}` format

### Issue: "Failed to connect to sandbox"

**Cause**: Daytona API returned an invalid URL or sandbox doesn't exist

**Solution**:

1. Check if sandbox exists: `daytona sandbox list`
2. Verify API key has access to the sandbox
3. Check sandbox state (must be `started`)

### Issue: High latency

**Cause**: Cache misses or slow Daytona API

**Solution**:

1. Increase `CACHE_TTL` for longer-lived sandboxes
2. Check `/stats` endpoint for cache performance
3. Deploy proxy closer to Daytona servers

### Issue: WebSocket connections fail

**Cause**: Reverse proxy not configured for WebSocket upgrade

**Solution**: Enable WebSocket support in your reverse proxy

**Nginx:**

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

**Caddy:**

```caddy
reverse_proxy localhost:3002 {
    transport http {
        versions 1.1 2
    }
}
```

## Performance Tuning

### Cache TTL

Adjust based on your usage patterns:

- **Short-lived sandboxes** (< 15 min): Lower TTL (60-120s)
- **Long-lived sandboxes** (> 1 hour): Higher TTL (300-600s)

```bash
# For development (1 minute cache)
CACHE_TTL=60000

# For production (5 minutes)
CACHE_TTL=300000
```

### Concurrent Connections

The proxy uses Express.js which handles concurrent connections well. For high traffic:

1. **Horizontal Scaling**: Deploy multiple proxy instances behind a load balancer
2. **CDN**: Use a CDN to cache static assets (if applicable)

## Integration with Open GitHub

### Backend Configuration

The backend automatically uses the proxy when `DAYTONA_PROXY_DOMAIN` is set:

```typescript
// In packages/core/src/sandbox/daytona.ts
const accessUrl = this.config.proxyDomain
  ? `https://4096-${sandbox.id}.${this.config.proxyDomain}`
  : previewLink.url; // Falls back to direct Daytona URL
```

### Frontend Changes

No frontend changes required! The frontend receives the proxy URL from the backend and connects normally.

## Cost Considerations

### Daytona API Usage

Each uncached request makes one API call to Daytona:

- `daytona.get(sandboxId)` - Get sandbox details
- `sandbox.getPreviewLink(port)` - Get preview URL

With caching enabled, this reduces to approximately:

- **1 API call per 5 minutes per active sandbox**

### Proxy Hosting Costs

- **Compute**: Minimal (< 1 GB RAM, 1 vCPU sufficient for most workloads)
- **Bandwidth**: Depends on OpenCode usage (primarily WebSocket traffic)
- **Estimate**: $5-20/month for low-moderate traffic

## License

Part of the Open GitHub platform - see root LICENSE file.

## Support

For issues or questions:

1. Check troubleshooting section above
2. Review logs for error messages
3. Open an issue in the main repository
