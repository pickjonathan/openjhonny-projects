# OpenClaw Dockerfile with Automatic Configuration
# This extends the official OpenClaw Dockerfile with auto-configuration features

FROM node:22-bookworm

# Install Bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /app

ARG OPENCLAW_DOCKER_APT_PACKAGES=""
RUN if [ -n "$OPENCLAW_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $OPENCLAW_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

# Optionally install Chromium for browser automation.
# Uses system Chromium via apt (stable, no Playwright cache path issues in Docker).
# Playwright is told to use the system binary via PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.
ARG OPENCLAW_INSTALL_BROWSER=""
RUN if [ -n "$OPENCLAW_INSTALL_BROWSER" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
        chromium \
        chromium-sandbox \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libgtk-3-0 \
        libnss3 \
        libxss1 && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi

COPY . .
RUN pnpm build
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

ENV NODE_ENV=production

# Install agent runtime tools: sudo, python3/pip3, common dev utilities.
# sudo allows the `node` user to run elevated commands (pip install, apt, etc.)
# without rebuilding the image. NOPASSWD is intentional — this is an agent sandbox.
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      sudo \
      python3 \
      python3-pip \
      python3-venv \
      curl \
      wget \
      git \
      jq && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/* && \
    printf 'node ALL=(ALL) NOPASSWD:ALL\nDefaults:node env_keep += "PATH"\nDefaults:node secure_path="/home/node/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"\n' > /etc/sudoers.d/node && \
    chmod 440 /etc/sudoers.d/node

# Create a Python venv for the node user so `pip install` works without
# --break-system-packages (Debian Bookworm PEP 668 restriction).
# The venv's bin is prepended to PATH so `python` and `pip` resolve to it.
RUN python3 -m venv /home/node/venv && \
    chown -R node:node /home/node/venv
ENV PATH="/home/node/venv/bin:${PATH}"

# Allow non-root user to write temp files during runtime/tests.
RUN chown -R node:node /app

# Copy custom entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Security hardening: Run as non-root user
USER node

# Use custom entrypoint for automatic configuration
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Default command
CMD ["node", "openclaw.mjs", "gateway", "--allow-unconfigured"]
