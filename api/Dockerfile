# Build context is the REPO ROOT, not api/ — this is an npm workspaces monorepo and the API
# depends on @tennisladder/shared, which has to be built from source alongside it.
#   docker build -f api/Dockerfile .
#
# The Node major here (both stages) must match .nvmrc, which CI and local installs follow.

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Prisma's query engine needs OpenSSL.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Manifests first so the dependency layer caches independently of source changes. Every workspace
# manifest is needed or npm ci refuses the lockfile, web included.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY api/package.json api/
COPY web/package.json web/

# --ignore-scripts: the root postinstall builds @tennisladder/shared, whose sources aren't copied
# yet. Both that and prisma generate are run explicitly below instead.
RUN npm ci --ignore-scripts

COPY packages/shared packages/shared
COPY api api

RUN npm run build --workspace=@tennisladder/shared \
  && npx prisma generate --schema api/prisma/schema.prisma \
  && npm run build --workspace=@tennisladder/api \
  && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000

# Copied wholesale: npm workspaces links @tennisladder/shared into node_modules as a symlink into
# packages/shared, so the tree has to keep its relative layout.
COPY --from=build --chown=node:node /app /app

USER node
EXPOSE 4000

CMD ["node", "api/dist/index.js"]
