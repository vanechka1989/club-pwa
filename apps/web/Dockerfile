FROM node:22-alpine AS build

WORKDIR /app

# The production VPS is intentionally small; Node otherwise caps the build
# heap near 512 MiB and vue-tsc can terminate before Vite starts.
ENV NODE_OPTIONS=--max-old-space-size=768

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY apps/web ./apps/web

RUN pnpm install --frozen-lockfile --filter @club/web...
RUN pnpm --filter @club/web build

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 8080
