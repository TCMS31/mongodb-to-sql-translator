# syntax=docker/dockerfile:1

# ---- build stage: compile TypeScript with dev dependencies present ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- deps stage: production dependencies only -------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- runtime stage ----------------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps  /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# node:20-alpine ships an unprivileged `node` user; nothing here needs root.
USER node

# The image is a CLI, so "healthy" means it can still translate a known query.
HEALTHCHECK --interval=30s --timeout=5s --start-period=2s --retries=3 \
  CMD node dist/cli.js "db.healthcheck.find({ok: 1})" > /dev/null || exit 1

ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--help"]
