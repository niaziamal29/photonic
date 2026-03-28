FROM node:20-bookworm AS build

RUN corepack enable

WORKDIR /app

ARG BASE_PATH=/
ARG VITE_API_URL=

ENV BASE_PATH=${BASE_PATH}
ENV VITE_API_URL=${VITE_API_URL}

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/photonics-sim build

FROM caddy:2-alpine

COPY deploy/Caddyfile /etc/caddy/templates/Caddyfile.https
COPY deploy/Caddyfile.http /etc/caddy/templates/Caddyfile.http
COPY deploy/web-entrypoint.sh /usr/local/bin/web-entrypoint.sh
COPY --from=build /app/artifacts/photonics-sim/dist/public /srv

RUN chmod +x /usr/local/bin/web-entrypoint.sh

EXPOSE 80
EXPOSE 443

ENTRYPOINT ["/usr/local/bin/web-entrypoint.sh"]
