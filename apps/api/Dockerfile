FROM oven/bun:1.3.14

WORKDIR /app
RUN bun install -g pnpm@9.15.4

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile --filter @club/api...

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "apps/api/src/index.ts"]
