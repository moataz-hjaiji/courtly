FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.test.json vitest.config.ts ./
COPY src ./src
COPY migrations ./migrations
COPY test ./test
RUN npm run build

# `docker compose --profile test run --rm api-test` uses this stage (has dev deps + tests).
FROM build AS test
CMD ["npm", "test"]

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
EXPOSE 3000
# Migrations and seed are idempotent, so running them on every start is safe.
CMD ["sh", "-c", "node dist/migrate.js && node dist/seed.js && node dist/server.js"]
