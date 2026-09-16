# All-in-one production image: builds web + shared + api, and the API serves the
# built SPA (SERVE_WEB=true) so one container/domain runs the whole platform
# (ideal for Railway/Render/Fly). Postgres + Redis are external managed services.

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /repo
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm install
COPY packages ./packages
COPY apps ./apps
RUN npm run build --workspace @hospitalityos/shared \
 && npm run db:generate --workspace @hospitalityos/api \
 && npm run build --workspace @hospitalityos/api \
 && npm run build --workspace @hospitalityos/web

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /repo
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV SERVE_WEB=true
ENV WEB_DIST=/repo/apps/web/dist
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api ./apps/api
COPY --from=build /repo/apps/web/dist ./apps/web/dist
WORKDIR /repo/apps/api
EXPOSE 3000
# Apply migrations then start. Run `npm run db:bootstrap` once after first deploy
# to create the owner login (or set BOOTSTRAP_* envs and run it as a release cmd).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
