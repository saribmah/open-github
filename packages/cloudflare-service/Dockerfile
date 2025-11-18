# Dockerfile for Cloudflare Sandbox - Open GitHub
# Lightweight sandbox container with OpenCode for running GitHub repos

FROM oven/bun:alpine

# Install essential tools
RUN apk add --no-cache \
    git \
    bash \
    curl \
    ca-certificates \
    tar \
    ripgrep \
    && rm -rf /var/cache/apk/*

# Install OpenCode globally via bun
RUN bun add -g opencode-ai

# Set up workspace directory
WORKDIR /workspace
RUN mkdir -p /workspace/repo

# Copy startup script
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

# Configure git defaults
RUN git config --global init.defaultBranch main && \
    git config --global user.email "sandbox@open-github.com" && \
    git config --global user.name "Open GitHub Sandbox"

# Expose OpenCode server port
EXPOSE 4096

# Health check for OpenCode server
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:4096/doc || exit 1

# Environment variables (will be overridden at runtime)
ENV WORKSPACE_ROOT=/workspace/repo \
    NODE_ENV=development

# Keep container alive - we'll run startup.sh via exec()
CMD ["tail", "-f", "/dev/null"]
