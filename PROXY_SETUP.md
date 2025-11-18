# Daytona Proxy Setup Guide

This guide explains how to set up the custom proxy server to bypass Daytona's preview URL warning screen.

## Quick Start

### 1. Install Proxy Dependencies

```bash
cd packages/proxy
bun install
```

### 2. Configure Proxy Environment

Create `packages/proxy/.env`:

```bash
DAYTONA_API_KEY=your-daytona-api-key
DAYTONA_API_URL=https://app.daytona.io/api
PORT=3002
PROXY_DOMAIN=proxy.yourdomain.com
CACHE_TTL=300000
```

### 3. Configure Backend to Use Proxy

Add to `packages/core/.env`:

```bash
SANDBOX_PROVIDER=daytona
DAYTONA_API_KEY=your-daytona-api-key
DAYTONA_PROXY_DOMAIN=proxy.yourdomain.com
```

### 4. Run Services

```bash
# Terminal 1: Start proxy
cd packages/proxy
bun run dev

# Terminal 2: Start backend
cd packages/core
bun run dev

# Terminal 3: Start frontend
cd packages/desktop
bun run dev
```

## How It Works

### Without Proxy (Default Daytona)

```
User → Frontend → Backend → Daytona Sandbox
                              ↓
                    ⚠️ Warning Screen
                              ↓
                    User must accept
                              ↓
                    OpenCode Interface
```

### With Proxy (This Solution)

```
User → Frontend → Backend → Proxy Server → Daytona Sandbox
                              ↓
                    No warning screen! ✅
                              ↓
                    OpenCode Interface
```

## URL Structure

The proxy transforms URLs like this:

**Direct Daytona URL** (shows warning):

```
https://4096-abc123.preview.daytona.app
```

**Proxy URL** (no warning):

```
https://4096-abc123.proxy.yourdomain.com
```

The backend automatically generates the correct URL based on whether `DAYTONA_PROXY_DOMAIN` is set.

## Production Deployment

### 1. Deploy Proxy Server

Deploy `packages/proxy` to your hosting provider:

- **Fly.io**: `fly launch` in packages/proxy
- **Railway**: Connect GitHub repo, deploy packages/proxy
- **DigitalOcean**: Use App Platform with Dockerfile
- **AWS/GCP**: Deploy as containerized service

### 2. Configure DNS

Set up wildcard DNS:

```
*.proxy.yourdomain.com → [your-proxy-server-ip]
```

### 3. Setup SSL

Use Caddy (recommended) or Nginx for automatic SSL:

**Caddy** (automatic HTTPS):

```caddy
*.proxy.yourdomain.com {
    reverse_proxy localhost:3002
}
```

**Nginx**:

```nginx
server {
    listen 443 ssl http2;
    server_name *.proxy.yourdomain.com;

    ssl_certificate /path/to/wildcard.crt;
    ssl_certificate_key /path/to/wildcard.key;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 4. Update Backend Configuration

In production, set:

```bash
DAYTONA_PROXY_DOMAIN=proxy.yourdomain.com
```

## Testing

### 1. Test Proxy Health

```bash
curl http://localhost:3002/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "2025-11-17T22:30:00.000Z",
  "cache": {
    "size": 0,
    "ttl": 300000
  }
}
```

### 2. Test Full Flow

1. Start all services (proxy, backend, frontend)
2. Open `http://localhost:5173/facebook/react`
3. Check browser network tab for the sandbox URL
4. Should see: `https://4096-{sandboxId}.proxy.yourdomain.com` (if configured)
5. No warning screen should appear!

### 3. Monitor Cache Performance

```bash
curl http://localhost:3002/stats
```

Check cache hit rate in proxy logs:

- `✅ Cache hit` = Good! Using cached URL
- `🔍 Fetching preview URL` = API call to Daytona

## Troubleshooting

### Proxy Not Working

**Check 1**: Verify proxy is running

```bash
curl http://localhost:3002/health
```

**Check 2**: Verify backend configuration

```bash
cd packages/core
grep DAYTONA_PROXY_DOMAIN .env
```

**Check 3**: Check backend logs

```bash
# Should see:
# ✅ Daytona sandbox created: abc123
# 🌐 Preview URL: https://...daytona.app
# 🔄 Proxy URL: https://4096-abc123.proxy.yourdomain.com
```

### Still Seeing Warning Screen

**Cause**: Proxy domain not configured or DNS not set up

**Solution**:

1. Ensure `DAYTONA_PROXY_DOMAIN` is set in backend `.env`
2. Restart backend service
3. Create new sandbox (existing ones use old URLs)

### WebSocket Connection Fails

**Cause**: Reverse proxy not configured for WebSocket upgrade

**Solution**: Add WebSocket headers to your reverse proxy (see SSL setup above)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      User Browser                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              Frontend (localhost:5173)                   │
│  - Receives proxy URL from backend                       │
│  - Connects OpenCode SDK to proxy URL                    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│              Backend (localhost:3001)                    │
│  - Creates Daytona sandbox                               │
│  - Gets direct preview URL                               │
│  - Transforms to proxy URL if configured                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│          Proxy Server (localhost:3002)                   │
│  - Receives request for 4096-{sandboxId}                 │
│  - Calls Daytona API to get preview URL (cached)         │
│  - Proxies traffic to actual Daytona sandbox             │
└────────────────────┬────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────┐
│               Daytona Sandbox                            │
│  - OpenCode server running on port 4096                  │
│  - No warning screen! Direct access                      │
└─────────────────────────────────────────────────────────┘
```

## Environment Variables Reference

### Backend (`packages/core/.env`)

```bash
# Required for Daytona
SANDBOX_PROVIDER=daytona
DAYTONA_API_KEY=your-key

# Optional: Enable proxy (recommended)
DAYTONA_PROXY_DOMAIN=proxy.yourdomain.com
```

### Proxy (`packages/proxy/.env`)

```bash
# Required
DAYTONA_API_KEY=your-key

# Optional (with defaults)
DAYTONA_API_URL=https://app.daytona.io/api
PORT=3002
PROXY_DOMAIN=proxy.yourdomain.com
CACHE_TTL=300000  # 5 minutes in milliseconds
```

## Cost Estimate

### Development (Local)

- **Cost**: $0
- **Setup**: Run proxy locally
- **Limitations**: Only accessible from your machine

### Production (Small Scale)

- **Proxy Hosting**: $5-10/month (Fly.io, Railway)
- **Domain**: $10-15/year
- **SSL**: Free (Let's Encrypt)
- **Total**: ~$5-10/month

### Production (High Traffic)

- **Proxy Hosting**: $20-50/month (multiple instances, load balancer)
- **CDN**: $10-30/month (optional, for static assets)
- **Total**: ~$30-80/month

## Benefits

✅ **No Warning Screen**: Users connect directly to sandboxes  
✅ **Better UX**: Seamless experience without clicks  
✅ **Caching**: Reduces API calls to Daytona  
✅ **Custom Domain**: Professional, branded URLs  
✅ **WebSocket Support**: Full OpenCode functionality  
✅ **Monitoring**: Built-in health checks and stats

## Next Steps

1. ✅ Proxy service implemented
2. ✅ Backend integration complete
3. ✅ Documentation written
4. 🔲 Deploy proxy to production
5. 🔲 Configure DNS wildcard
6. 🔲 Setup SSL certificate
7. 🔲 Update production backend config
8. 🔲 Test end-to-end

## Resources

- **Proxy README**: `packages/proxy/README.md` (detailed documentation)
- **Daytona Docs**: https://www.daytona.io/docs
- **Daytona Proxy Sample**: https://github.com/daytonaio/daytona-proxy-samples

For questions or issues, check the troubleshooting section or open an issue in the repository.
