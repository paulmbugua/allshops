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
RUN pnpm db:generate \
 && pnpm --filter @allshops/database build \
 && pnpm --filter @allshops/worker build \
 && pnpm --filter @allshops/worker deploy --prod /release \
 && release_client="$(find /release/node_modules/.pnpm -path '*/node_modules/@prisma/client' -type d -print -quit)" \
 && generated_client="$(find /workspace/node_modules/.pnpm -path '*/node_modules/.prisma/client' -type d -print -quit)" \
 && test -n "$release_client" \
 && test -n "$generated_client" \
 && release_client="$(readlink -f "$release_client")" \
 && release_modules="$(dirname "$(dirname "$release_client")")" \
 && mkdir -p "$release_modules/.prisma" \
 && cp -R "$generated_client" "$release_modules/.prisma/client" \
 && cd /release \
 && node -e "import('@allshops/database')"

FROM node:22.14.0-alpine AS runtime
RUN apk add --no-cache libc6-compat \
 && addgroup -S -g 10001 allshops \
 && adduser -S -D -H -u 10001 -G allshops allshops
WORKDIR /app
ENV NODE_ENV=production WORKER_HEALTH_PORT=4001
COPY --from=build --chown=allshops:allshops /release ./
USER allshops
EXPOSE 4001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4001/health/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
