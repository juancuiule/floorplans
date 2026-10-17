# syntax=docker/dockerfile:1

# Build stage: install deps (pnpm) and produce dist/.
FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Runtime stage: server/*.ts run directly — Node 22.18+ strips the types — but
# the Effect platform packages are real runtime deps, so prod node_modules.
FROM node:24-alpine
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    FLOORPLAN_DATA=/app/data
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY server ./server
COPY src/model ./src/model
COPY examples ./examples
COPY --from=build /app/dist ./dist
# Spaces live in /app/data (a named volume in compose) — owned by node.
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 8080
CMD ["node", "server/main.ts"]
