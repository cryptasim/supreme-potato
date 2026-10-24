# React/Vite frontend: build static assets with pnpm, serve them with nginx.
# Build context: ./frontend

# ---- build stage -----------------------------------------------------------
FROM node:22-alpine AS build

# Pin pnpm to the version that produced pnpm-lock.yaml so --frozen-lockfile
# behaves the same here, in CI and on Vercel.
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /app
# Optional pnpm config files (globs) carry settings such as onlyBuiltDependencies.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* .npmrc* ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---- runtime stage ---------------------------------------------------------
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
