# Build stage
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY packages/runtime/package.json ./packages/runtime/
COPY packages/ui-server/package.json ./packages/ui-server/
COPY packages/ui-frontend/package.json ./packages/ui-frontend/
COPY packages/database/package.json ./packages/database/
COPY packages/tools-core/package.json ./packages/tools-core/
COPY packages/tools-impl/package.json ./packages/tools-impl/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build all packages
RUN pnpm run build

# Production stage
FROM node:20-alpine

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

WORKDIR /app

# Copy package files
COPY package.json pnpm-workspace.yaml ./
COPY packages/runtime/package.json ./packages/runtime/
COPY packages/ui-server/package.json ./packages/ui-server/
COPY packages/ui-frontend/package.json ./packages/ui-frontend/
COPY packages/database/package.json ./packages/database/
COPY packages/tools-core/package.json ./packages/tools-core/
COPY packages/tools-impl/package.json ./packages/tools-impl/

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built artifacts from builder
COPY --from=builder /app/packages/runtime/dist ./packages/runtime/dist
COPY --from=builder /app/packages/ui-server/dist ./packages/ui-server/dist
COPY --from=builder /app/packages/ui-frontend/dist ./packages/ui-frontend/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/tools-core/dist ./packages/tools-core/dist
COPY --from=builder /app/packages/tools-impl/dist ./packages/tools-impl/dist

# Copy configs
COPY configs ./configs

# Create workspace directory
RUN mkdir -p workspace

EXPOSE 3001

# Run the server using the compiled dist files
CMD ["node", "--env-file=.env", "packages/ui-server/dist/server.js"]
