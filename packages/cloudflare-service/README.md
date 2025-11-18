# Cloudflare Sandbox Service

A simple Cloudflare Worker service for orchestrating GitHub repository sandboxes using Cloudflare's Sandbox SDK and Durable Objects.

## Features

- **Simple REST API** with 3 endpoints (create, get, delete)
- **Cloudflare Sandbox SDK** for container provisioning
- **Durable Objects** for persistent session state
- **GitHub Repository Cloning** with branch support
- **OpenCode/Code Server** running on port 4096
- **Preview URLs** for accessing sandboxes

## Architecture

This service uses:

- **Cloudflare Workers** for the REST API
- **Durable Objects** for stateful session management
- **Cloudflare Sandbox SDK** for container orchestration

## Prerequisites

- Cloudflare Workers Paid Plan (required for Sandbox SDK and Durable Objects)
- Wrangler CLI installed globally: `npm install -g wrangler`
- Authenticated with Cloudflare: `wrangler login`

## Installation

```bash
# Install dependencies
npm install

# Set up secrets (for private repositories)
wrangler secret put GITHUB_TOKEN
# Enter your GitHub personal access token when prompted
```

## Development

```bash
# Run locally with Wrangler dev server
npm run dev

# Test the endpoints
curl -X POST http://localhost:8787/sandbox/create \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "facebook",
    "repo": "react",
    "branch": "main",
    "sessionId": "test-123"
  }'
```

## Deployment

```bash
# Deploy to Cloudflare
npm run deploy
```

The first deployment will:

1. Build and push the Docker container image
2. Deploy the Worker
3. Set up Durable Objects
4. Configure bindings

## API Endpoints

### POST /sandbox/create

Create a new sandbox for a GitHub repository.

**Request:**

```json
{
  "owner": "facebook",
  "repo": "react",
  "branch": "main",
  "sessionId": "unique-session-id",
  "githubToken": "optional-for-private-repos"
}
```

**Response (200):**

```json
{
  "id": "sb-unique-session-id-1700000000000",
  "url": "https://4096-sb-unique-session-id.workers.dev",
  "status": "ready",
  "createdAt": "2024-11-18T10:30:00.000Z"
}
```

### GET /sandbox/:sessionId

Get the status of an existing sandbox.

**Response (200):**

```json
{
  "id": "sb-unique-session-id-1700000000000",
  "url": "https://4096-sb-unique-session-id.workers.dev",
  "status": "ready",
  "createdAt": "2024-11-18T10:30:00.000Z",
  "owner": "facebook",
  "repo": "react"
}
```

### DELETE /sandbox/:sessionId

Terminate a sandbox.

**Response:** `204 No Content`

### GET /health

Health check endpoint.

**Response (200):**

```json
{
  "status": "healthy",
  "timestamp": "2024-11-18T10:30:00.000Z"
}
```

## Sandbox Status Values

- `provisioning` - Sandbox is being created
- `cloning` - Repository is being cloned
- `starting` - Server is starting
- `ready` - Sandbox is ready and accessible
- `error` - An error occurred
- `terminated` - Sandbox has been terminated

## Environment Variables

Set these in `wrangler.toml` under `[vars]`:

- `GITHUB_API_URL` - GitHub API endpoint (default: https://api.github.com)
- `DEFAULT_BRANCH` - Default branch to clone (default: main)
- `OPENCODE_PORT` - Port for OpenCode server (default: 4096)

## Secrets

Set these using `wrangler secret put`:

- `GITHUB_TOKEN` - GitHub personal access token for private repositories

## Container Image

The `Dockerfile` includes:

- Ubuntu 22.04 base
- Git for repository cloning
- Node.js 20.x
- code-server (placeholder for OpenCode)

Modify the Dockerfile to install your preferred code editor/server.

## Monitoring

```bash
# View live logs
npm run tail

# View logs in Cloudflare dashboard
# https://dash.cloudflare.com -> Workers & Pages -> Your worker -> Logs
```

## Cost Considerations

- Workers Paid Plan: $5/month minimum
- Durable Objects: $0.15 per million requests
- Sandbox containers: Pricing based on usage (see Cloudflare pricing)

## Troubleshooting

### Sandbox fails to start

- Check that the Docker image is built correctly
- Verify GitHub token is set for private repos
- Check Worker logs: `npm run tail`

### Preview URL not accessible

- Ensure the port is exposed correctly in the sandbox
- Check firewall/network settings
- Verify the hostname configuration

## License

MIT
