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

# Install pinned upstream CLI tools globally
RUN npm install -g opencode-ai@${OPENCODE_VERSION} && npm cache clean --force

# Install bridge globally (0.6.2+ has proper npm dependencies, 0.6.0 had workspace: refs)
RUN npm install -g @otto-assistant/bridge@${BRIDGE_VERSION} && npm cache clean --force

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

# Entrypoint: bridge (long-running Discord bot process)
# Otto CLI is available as `otto` for management commands
ENTRYPOINT ["bridge"]
CMD ["start"]
