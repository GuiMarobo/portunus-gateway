# check=skip=InvalidDefaultArgInFrom
ARG NODE_IMAGE

FROM ${NODE_IMAGE} AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY libs/common/package.json libs/common/
COPY apps/mock-provider/package.json apps/mock-provider/
RUN pnpm install --frozen-lockfile --filter @portunus/mock-provider...
COPY libs/common libs/common
COPY apps/mock-provider apps/mock-provider
RUN pnpm --filter @portunus/mock-provider build \
 && pnpm --filter @portunus/mock-provider deploy --prod /prod/mock-provider

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /prod/mock-provider ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=10 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3001/health').then((response) => process.exit(response.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "dist/main.js"]
