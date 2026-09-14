FROM node:22.14.0-alpine AS build
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
COPY . .
ARG NEXT_PUBLIC_API_URL=/api/v1
ARG NEXT_PUBLIC_APP_VERSION=0.0.0
ARG NEXT_PUBLIC_GIT_SHA=unknown
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_APP_VERSION=$NEXT_PUBLIC_APP_VERSION \
    NEXT_PUBLIC_GIT_SHA=$NEXT_PUBLIC_GIT_SHA
RUN pnpm --filter @allshops/contracts build \
 && pnpm --filter @allshops/ui build \
 && pnpm --filter @allshops/web build

FROM node:22.14.0-alpine AS runtime
RUN addgroup -S -g 10001 allshops \
 && adduser -S -D -H -u 10001 -G allshops allshops
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=allshops:allshops /workspace/apps/web/.next/standalone ./
COPY --from=build --chown=allshops:allshops /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=allshops:allshops /workspace/apps/web/public ./apps/web/public
USER allshops
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
