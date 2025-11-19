# Cloudflare Production Deployment Guide

## Prerequisites

1. **Cloudflare Account** - Sign up at https://dash.cloudflare.com
2. **Wrangler CLI** - Already installed (comes with the project)
3. **Cloudflare Workers Paid Plan** - Required for Durable Objects and Containers

## Step 1: Login to Cloudflare

```bash
cd packages/my-sandbox
npx wrangler login
```

This will open a browser window to authenticate with your Cloudflare account.

## Step 2: Review Configuration

The `wrangler.jsonc` is already configured with:
- ✅ Durable Objects (SandboxManager, Sandbox)
- ✅ Container configuration (Dockerfile)
- ✅ Environment variables
- ✅ Migrations for Durable Objects

## Step 3: Deploy to Production

```bash
bun run deploy
# or
npx wrangler deploy
```

This will:
1. Build your Docker container image
2. Upload it to Cloudflare
3. Deploy the Worker with Durable Objects
4. Create the necessary bindings

## Step 4: Verify Deployment

After deployment, Wrangler will output your Worker URL:

```
Published my-sandbox (X.XX sec)
  https://my-sandbox.<your-subdomain>.workers.dev
```

Test the health endpoint:

```bash
curl https://my-sandbox.<your-subdomain>.workers.dev/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-18T23:45:00.000Z"
}
```

## Step 5: Test Sandbox Creation

Create a sandbox with a unique sessionId:

```bash
curl -X POST https://my-sandbox.<your-subdomain>.workers.dev/sandbox/create \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "octocat",
    "repo": "Hello-World",
    "sessionId": "test-'$(date +%s)'"
  }'
```

This will take ~60+ seconds and return:

```json
{
  "id": "sb-test-xxx-xxx",
  "url": null,
  "status": "ready",
  "createdAt": "2025-11-18T23:45:00.000Z"
}
```

## Step 6: Check Sandbox Status

```bash
curl https://my-sandbox.<your-subdomain>.workers.dev/sandbox/<sessionId>
```

## Optional: Custom Domain & Preview URLs

To enable OpenCode server preview URLs (expose port 4096 to the internet):

### 1. Add a Custom Domain

In Cloudflare Dashboard:
1. Go to Workers & Pages
2. Select your worker
3. Go to Settings > Domains & Routes
4. Add a custom domain (e.g., `sandbox.yourdomain.com`)

### 2. Set up Wildcard DNS

Add a DNS record:
```
Type: CNAME
Name: *.sandbox
Target: sandbox.yourdomain.com
```

### 3. Update wrangler.jsonc

Add production environment configuration:

```jsonc
{
  "vars": {
    "GITHUB_API_URL": "https://api.github.com",
    "DEFAULT_BRANCH": "main",
    "OPENCODE_PORT": "4096",
    "ENVIRONMENT": "production",
    "WORKER_HOSTNAME": "sandbox.yourdomain.com"
  }
}
```

### 4. Redeploy

```bash
bun run deploy
```

Now OpenCode servers will be accessible at:
```
https://4096-<sandbox-id>.sandbox.yourdomain.com
```

## API Endpoints

Once deployed, your worker exposes these endpoints:

### Health Check
```bash
GET https://my-sandbox.<your-subdomain>.workers.dev/health
```

### Create Sandbox
```bash
POST https://my-sandbox.<your-subdomain>.workers.dev/sandbox/create
Content-Type: application/json

{
  "owner": "octocat",
  "repo": "Hello-World",
  "branch": "main",  // optional
  "sessionId": "unique-session-id",
  "githubToken": "ghp_xxx"  // optional, for private repos
}
```

### Get Sandbox Status
```bash
GET https://my-sandbox.<your-subdomain>.workers.dev/sandbox/<sessionId>
```

### Delete Sandbox
```bash
DELETE https://my-sandbox.<your-subdomain>.workers.dev/sandbox/<sessionId>
```

## Monitoring & Logs

View logs in real-time:

```bash
npx wrangler tail
```

Or view in the Cloudflare Dashboard:
1. Go to Workers & Pages
2. Select your worker
3. Click on "Logs" tab

## Troubleshooting

### Issue: "Container exited with unexpected exit code"

This can happen if you hit the max_instances limit (currently 10). Increase in wrangler.jsonc:

```jsonc
"containers": [
  {
    "class_name": "Sandbox",
    "image": "./Dockerfile",
    "instance_type": "lite",
    "max_instances": 50  // Increase as needed
  }
]
```

### Issue: Preview URLs not working

1. Verify custom domain is set up
2. Check WORKER_HOSTNAME is configured
3. Ensure ENVIRONMENT is set to "production"

### Issue: OpenCode installation fails

Check logs with `wrangler tail` - this is usually a network issue. The sandbox will still become "ready" but OpenCode won't be available.

## Cost Considerations

Cloudflare Sandbox pricing:
- Container instances: Billed per vCPU-second
- Durable Objects: Storage + requests
- Workers: Requests beyond free tier

See: https://developers.cloudflare.com/sandbox/pricing/

## Next Steps

- Set up monitoring/alerting
- Implement authentication for /sandbox/create endpoint
- Add rate limiting
- Configure secrets for GitHub tokens

