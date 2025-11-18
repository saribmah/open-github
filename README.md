# Open GitHub

Visit `open-github.com/owner/repo` to instantly spin up a development sandbox for any GitHub repository.

## Overview

Open GitHub automatically creates isolated development environments for GitHub repositories. Simply add `open-` before `github.com` in any repository URL:

```
github.com/colinhacks/zod  →  open-github.com/colinhacks/zod
```

The system will:

1. Validate the repository exists
2. Provision a Docker container
3. Clone the repository
4. Start an OpenCode development server
5. Connect you to the live environment

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     User Browser                        │
│                 open-github.com/owner/repo              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Frontend (SolidJS)                         │
│  - Parses route (owner/repo)                           │
│  - Calls backend API                                    │
│  - Displays loading/error states                       │
│  - Connects to OpenCode via SDK                        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              Backend API (Hono + Bun)                   │
│  - Validates GitHub repos                              │
│  - Manages sessions                                     │
│  - Provisions Docker containers                        │
│  - Returns sandbox URLs                                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│           Docker Container (Sandbox)                    │
│  - Clones repository                                    │
│  - Runs OpenCode server                                │
│  - Isolated environment                                │
└─────────────────────────────────────────────────────────┘
```

## Package Structure

```
open-github/
├── packages/
│   ├── core/          # Backend API server
│   │   ├── src/
│   │   │   ├── config/      # Configuration management
│   │   │   ├── github/      # GitHub API integration
│   │   │   ├── sandbox/     # Docker/Daytona providers
│   │   │   ├── utils/       # Error handling
│   │   │   └── index.ts     # Main API routes
│   │   └── test-*.ts        # Test scripts
│   │
│   ├── sandbox/       # Docker container for sandboxes
│   │   ├── Dockerfile       # Container definition
│   │   ├── startup.sh       # Entrypoint script
│   │   └── test-*.sh        # Test scripts
│   │
│   ├── desktop/       # Frontend application
│   │   └── src/
│   │       ├── context/     # React contexts
│   │       ├── pages/       # Page components
│   │       └── index.tsx    # Entry point
│   │
│   └── ui/            # Shared UI components
│
└── IMPLEMENTATION_PLAN.md
```

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) (v1.2+)
- [Docker](https://www.docker.com/) (v20+)
- Node.js (v18+)

### 1. Install Dependencies

```bash
bun install
```

### 2. Build Sandbox Container

```bash
cd packages/sandbox
docker build -t open-github-sandbox:latest .
```

### 3. Start Backend API

```bash
cd packages/core
bun run dev
```

The API will start on `http://localhost:3001`

### 4. Start Frontend (in another terminal)

```bash
cd packages/desktop
bun run dev
```

The frontend will start on `http://localhost:5173`

### 5. Test It Out

Visit: `http://localhost:5173/colinhacks/zod`

This will:

- Call the backend API to create a sandbox for `colinhacks/zod`
- Wait for the Docker container to be ready
- Connect to the OpenCode server
- Display the development environment

## Environment Variables

### Backend (`packages/core/.env`)

```bash
# Sandbox Configuration
SANDBOX_PROVIDER=docker              # 'docker' or 'daytona'
DOCKER_IMAGE=open-github-sandbox:latest
SESSION_TIMEOUT=3600                 # Session TTL in seconds
MAX_CONCURRENT_SANDBOXES=10

# GitHub
GITHUB_TOKEN=                        # Optional, for higher rate limits

# Server
PORT=3001
HOST=0.0.0.0
ALLOWED_ORIGINS=http://localhost:5173,https://open-github.com
```

### Frontend (`packages/desktop/.env`)

```bash
VITE_API_URL=http://localhost:3001
VITE_OPENCODE_SERVER_HOST=127.0.0.1  # Fallback for dev
VITE_OPENCODE_SERVER_PORT=4096        # Fallback for dev
```

## Testing

### Test Backend API

```bash
cd packages/core
./test-api.sh
```

Tests:

- Health check
- Repository validation
- Sandbox creation
- Status polling
- Session management
- Cleanup

### Test Docker Provider

```bash
cd packages/core
bun run test-docker.ts
```

Tests:

- Docker availability
- Container provisioning
- Health checks
- Termination

### Test Sandbox Container

```bash
cd packages/sandbox
./test-sandbox.sh
```

Tests repository cloning and OpenCode server startup

## API Documentation

### POST /api/sandbox/create

Create a new sandbox for a repository.

**Request:**

```json
{
  "owner": "colinhacks",
  "repo": "zod",
  "branch": "main" // optional
}
```

**Response:**

```json
{
  "sessionId": "01KAAJ7W56P589FQJYQ3GA4HFH",
  "status": "provisioning",
  "estimatedTime": 30
}
```

### GET /api/sandbox/:sessionId

Get sandbox status.

**Response:**

```json
{
  "sessionId": "01KAAJ7W56P589FQJYQ3GA4HFH",
  "status": "ready",
  "url": "http://localhost:32898",
  "owner": "colinhacks",
  "repo": "zod",
  "provider": "docker",
  "createdAt": "2025-11-18T04:05:51.910Z",
  "expiresAt": "2025-11-18T05:05:51.910Z"
}
```

### DELETE /api/sandbox/:sessionId

Terminate a sandbox.

**Response:**

```json
{
  "success": true,
  "message": "Session 01KAAJ7W56P589FQJYQ3GA4HFH terminated"
}
```

### GET /api/repo/validate

Validate a GitHub repository.

**Query Parameters:**

- `owner` - Repository owner
- `repo` - Repository name

**Response:**

```json
{
  "valid": true,
  "metadata": {
    "owner": "colinhacks",
    "name": "zod",
    "fullName": "colinhacks/zod",
    "defaultBranch": "main",
    "cloneUrl": "https://github.com/colinhacks/zod.git",
    "isPrivate": false,
    "language": "TypeScript"
  }
}
```

## Deployment

### Backend

Deploy to any server with Docker support:

```bash
# Build
cd packages/core
bun run build

# Run
PORT=3001 bun run start
```

### Frontend

Build and deploy as static site:

```bash
cd packages/desktop
bun run build
```

Deploy `dist/` to any static host (Vercel, Netlify, Cloudflare Pages, etc.)

### Sandbox Container

Push to container registry:

```bash
cd packages/sandbox
docker build -t your-registry/open-github-sandbox:latest .
docker push your-registry/open-github-sandbox:latest
```

Update `DOCKER_IMAGE` env var in backend.

## Development

### Project Structure

- **Monorepo** managed with Bun workspaces
- **TypeScript** throughout
- **Hono** for backend API
- **SolidJS** for frontend
- **Docker** for sandboxes
- **OpenCode** for development environment

### Key Features

✅ GitHub repository validation  
✅ Docker container provisioning  
✅ Session management with TTL  
✅ Automatic cleanup  
✅ CORS support  
✅ Error handling  
✅ Health checks  
✅ Concurrent sandbox limits  
✅ Repository caching (reuse sessions)

## Troubleshooting

### Sandbox not starting

Check Docker is running:

```bash
docker ps
```

Check container logs:

```bash
docker logs <container-name>
```

### Port conflicts

Change backend port:

```bash
PORT=3002 bun run dev
```

### Frontend can't connect

Check `VITE_API_URL` points to backend:

```bash
echo $VITE_API_URL
```

## License

MIT

## Contributing

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for development roadmap.
