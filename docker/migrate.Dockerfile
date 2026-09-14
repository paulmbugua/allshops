FROM node:22.14.0-alpine
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile
COPY packages/database packages/database
RUN pnpm db:generate
USER node
CMD ["node", "packages/database/node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "packages/database/prisma/schema.prisma"]
