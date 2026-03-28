FROM node:20-bookworm

RUN corepack enable

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @workspace/api-server build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["pnpm", "--filter", "@workspace/api-server", "start"]

