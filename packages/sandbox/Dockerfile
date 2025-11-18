# Dockerfile for Open GitHub Sandbox
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

# Install OpenCode globally via npm
RUN bun add -g opencode-ai

# Set up workspace directory
WORKDIR /workspace
RUN mkdir -p /workspace

# Copy startup script
COPY startup.sh /startup.sh
RUN chmod +x /startup.sh

# Configure git defaults
RUN git config --global init.defaultBranch main && \
    git config --global user.email "sandbox@open-github.com" && \
    git config --global user.name "Open GitHub Sandbox"

# Expose OpenCode server port
EXPOSE 4096

# Health check for OpenCode server (just check if port is listening)
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
    CMD netstat -tln | grep :4096 || exit 1

# Environment variables (will be overridden at runtime)
ENV WORKSPACE_ROOT=/workspace \
    NODE_ENV=development

# Start with the startup script
CMD ["/startup.sh"]
