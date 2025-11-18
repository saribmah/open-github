# Open GitHub Sandbox

Docker container for running GitHub repositories with OpenCode server.

## Overview

This sandbox container:

1. Clones a GitHub repository on startup
2. Starts an OpenCode server on port 4096
3. Provides a development environment for the cloned repo

## Building

```bash
docker build -t open-github-sandbox:latest .
```

## Running

```bash
docker run -d \
  --name my-sandbox \
  -e REPO_URL=https://github.com/owner/repo.git \
  -e BRANCH=main \
  -e SESSION_ID=my-session \
  -p 4096:4096 \
  open-github-sandbox:latest
```

## Environment Variables

- `REPO_URL` (required) - GitHub repository URL to clone
- `BRANCH` (optional) - Branch to checkout (defaults to default branch)
- `SESSION_ID` (optional) - Unique session identifier

## Testing

Run the test script to verify everything works:

```bash
./test-sandbox.sh
```

This will:

1. Build the Docker image if needed
2. Start a container with a test repository
3. Wait for OpenCode server to be ready
4. Test the health endpoint
5. Show container logs
6. Keep container running for debugging

## Debugging

### Check if container is running

```bash
docker ps | grep open-github
```

### View logs

```bash
docker logs <container-name>
```

### Execute commands inside container

```bash
docker exec -it <container-name> bash
```

### Test OpenCode manually

```bash
docker exec <container-name> bunx opencode --version
docker exec <container-name> bunx opencode server --help
```

### Check if server is listening

```bash
docker exec <container-name> netstat -tlnp
```

## Troubleshooting

### OpenCode server not starting

If the OpenCode server doesn't start, check:

1. **OpenCode is installed correctly:**

   ```bash
   docker exec <container-name> bunx opencode --version
   ```

2. **Repository was cloned:**

   ```bash
   docker exec <container-name> ls -la /workspace
   ```

3. **Check startup script logs:**
   ```bash
   docker logs <container-name>
   ```

### Health check failing

The health endpoint is at `http://localhost:4096/health`. If it's not responding:

1. Check if the port is mapped correctly:

   ```bash
   docker port <container-name>
   ```

2. Check if the server is running inside the container:
   ```bash
   docker exec <container-name> curl http://localhost:4096/health
   ```

## Architecture

```
┌─────────────────────────────────────┐
│         Docker Container            │
│                                     │
│  ┌──────────────────────────────┐  │
│  │     startup.sh               │  │
│  │  1. Clone repository         │  │
│  │  2. Configure git            │  │
│  │  3. Start OpenCode server    │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │     /workspace               │  │
│  │  (cloned repository)         │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │   OpenCode Server :4096      │  │
│  │  - Health check endpoint     │  │
│  │  - Development server        │  │
│  └──────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

## Files

- `Dockerfile` - Container image definition
- `startup.sh` - Container entrypoint script
- `test-sandbox.sh` - Test script for local development
- `README.md` - This file
