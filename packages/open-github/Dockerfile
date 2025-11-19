FROM docker.io/cloudflare/sandbox:0.5.1

# On a Mac with Apple Silicon, you might need to specify the platform:
# FROM --platform=linux/arm64 docker.io/cloudflare/sandbox:0.5.1

WORKDIR /workspace

# Install OpenCode during image build
RUN curl -fsSL https://opencode.ai/install | bash

# Add OpenCode to PATH for all sessions
ENV PATH="/root/.opencode/bin:${PATH}"

# Verify installation
RUN opencode --version

# Required during local development to access exposed ports
# OpenCode server port
EXPOSE 4096
