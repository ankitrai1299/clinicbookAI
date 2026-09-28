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
# for the schema push the entrypoint runs at start-up.
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app

# openssl/ca-certs for Prisma; chromium + Noto fonts for the headless-Chrome PDF
# renderer (real selectable-text PDFs, incl. Hindi/Tamil/… via fonts-noto-core).
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     openssl ca-certificates \
     chromium fonts-noto-core fonts-noto-color-emoji \
  && rm -rf /var/lib/apt/lists/*

# puppeteer-core does NOT bundle Chromium — point it at the apt-installed one.
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# The schema push that used to be the platform's job. Railway ran it through
# preDeployCommand; hosts without that hook would otherwise start code expecting
# columns the database does not have. Copied with the executable bit set here,
# because a repo cloned on Windows loses it.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Run as the unprivileged user that ships with the base image.
USER node

# Informational only — the platform injects PORT at runtime and the server binds
# to it. Lightsail reads this to decide which port to route to, so keep it in
# step with the server's default.
EXPOSE 5000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
