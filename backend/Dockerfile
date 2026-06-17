# syntax=docker/dockerfile:1

# ---------- Builder ----------
# Compiles TypeScript -> dist/ and generates the Prisma client.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Prisma engines need openssl + CA certs at build and run time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies against the lockfile (reproducible builds).
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client before compiling (src imports @prisma/client).
COPY prisma ./prisma
RUN npx prisma generate

# Compile TypeScript.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Runner ----------
# Slim runtime image. Ships the full node_modules so the Prisma CLI is present
# for the `prisma db push` pre-deploy step (see railway.json).
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Run as the unprivileged user that ships with the base image.
USER node

# Informational only — Railway injects PORT at runtime and the server binds to it.
EXPOSE 5000

CMD ["node", "dist/server.js"]
