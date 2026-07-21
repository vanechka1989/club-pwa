FROM oven/bun:1.3.14 AS dependencies

WORKDIR /app
RUN bun install -g pnpm@9.15.4

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile --filter @club/api...

FROM oven/bun:1.3.14 AS runtime

WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg postgresql-client \
  && rm -rf /var/lib/apt/lists/*

COPY --from=dependencies --chown=bun:bun /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml /app/tsconfig.base.json ./
COPY --from=dependencies --chown=bun:bun /app/node_modules ./node_modules
COPY --from=dependencies --chown=bun:bun /app/packages ./packages
COPY --from=dependencies --chown=bun:bun /app/apps/api ./apps/api
RUN mkdir -p /app/uploads && chown bun:bun /app/uploads

ENV NODE_ENV=production
EXPOSE 3000
USER bun

CMD ["bun", "apps/api/src/index.ts"]
