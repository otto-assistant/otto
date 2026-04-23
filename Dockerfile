# Otto — monolith Docker image
# Pre-bakes opencode-ai + bridge + mempalace into a single runtime

# ---- Build stage: compile Otto CLI from source ----
FROM node:22-slim AS otto-build

WORKDIR /build
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src/ src/
RUN pnpm build

# ---- Runtime stage: install upstream packages + Otto CLI ----
FROM node:22-slim AS runtime

ARG OPENCODE_VERSION=1.2.20
ARG BRIDGE_VERSION=0.6.2
ARG BUILD_SOURCE_MODE=published

# Runtime deps for bridge bootstrap/runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Pre-install bun so bridge doesn't restart-loop trying to install it
RUN curl -fsSL https://bun.sh/install | bash && ln -sf /root/.bun/bin/bun /usr/local/bin/bun

# Optional local artifact source for fast development builds
COPY artifacts/ /tmp/artifacts/

# Install upstream CLI tools from selected source mode
# - published: install pinned versions from npm registry
# - local: install prepacked tarballs from ./artifacts
RUN if [ "$BUILD_SOURCE_MODE" = "local" ]; then \
      OPENCODE_TGZ=$(ls -1 /tmp/artifacts/opencode-ai-*.tgz 2>/dev/null | head -n 1); \
      BRIDGE_TGZ=$(ls -1 /tmp/artifacts/otto-assistant-bridge-*.tgz 2>/dev/null | head -n 1); \
      if [ -z "$OPENCODE_TGZ" ] || [ -z "$BRIDGE_TGZ" ]; then \
        echo "ERROR: BUILD_SOURCE_MODE=local requires artifacts/opencode-ai-*.tgz and artifacts/otto-assistant-bridge-*.tgz"; \
        exit 1; \
      fi; \
      npm install -g "$OPENCODE_TGZ" "$BRIDGE_TGZ"; \
    else \
      npm install -g "opencode-ai@${OPENCODE_VERSION}" "@otto-assistant/bridge@${BRIDGE_VERSION}"; \
    fi \
    && npm cache clean --force

# Install Otto CLI from build stage
COPY --from=otto-build /build/dist /opt/otto/dist
COPY --from=otto-build /build/package.json /opt/otto/package.json
RUN ln -s /opt/otto/dist/cli.js /usr/local/bin/otto && chmod +x /opt/otto/dist/cli.js

# Create default opencode config dir
RUN mkdir -p /root/.config/opencode /root/.kimaki

# Default opencode.json with mempalace plugin
RUN echo '{"plugin":["mempalace"]}' > /root/.config/opencode/opencode.json

# Workspace inside container
WORKDIR /workspace

# Default: run bridge (long-running Discord bot process)
ENTRYPOINT ["bridge"]
CMD ["start"]
