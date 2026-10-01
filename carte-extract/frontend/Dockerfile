# Vite build served as static files by nginx.

FROM node:22-alpine AS build

WORKDIR /app

# scripts/ comes in with the manifests because package.json's postinstall runs
# scripts/sync-maplibre-worker.mjs, which copies maplibre's worker into public/
# (see utils/mapStyle.js for why that has to be an unbundled static asset).
# It changes far less often than src/, so the install layer still caches well.
COPY package.json package-lock.json ./
COPY scripts ./scripts
RUN npm ci

COPY . .

# Baked in at build time, because Vite inlines import.meta.env at compile time.
# This is the URL the *browser* uses, so it points at the published host port of
# the backend container, not at the compose-internal hostname.
ARG VITE_API_BASE_URL=http://localhost:8000/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build


FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# 127.0.0.1, not localhost: nginx listens on IPv4 only, while localhost resolves
# to ::1 first inside the container, which would fail the check on a healthy server.
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
