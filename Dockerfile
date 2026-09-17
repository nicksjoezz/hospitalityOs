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
ENV PORT=3000
ENV CORS_ORIGINS=*
ENV DEFAULT_CURRENCY=NGN
ENV JWT_ACCESS_SECRET=NQz2VJ9S45OQwwrQR3FknGNC-eKcoQIlPtLEID-UCNONjpq2lqXUkDcnhWdW_N3R
ENV JWT_REFRESH_SECRET=rpRDBbyONIvuGcaK5L4aNE-n_IwgfzDVNeVTh1xuVg4VyjVYg3LNJyp77UqF6wGp
ENV APP_ENCRYPTION_KEY=27dd7921d1603f3f57df895ba206935504db90824d404a79c24a3670cb5dec3b
ENV PLATFORM_ADMIN_EMAIL=admin@hospitalityos.local
ENV PLATFORM_ADMIN_PASSWORD=ChangeMe_Master_2026!
ENV PLATFORM_ADMIN_NAME="Master Administrator"

COPY package.json package-lock.json* ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages ./packages
COPY --from=build /repo/apps/api ./apps/api
COPY --from=build /repo/apps/web ./apps/web
WORKDIR /repo/apps/api
EXPOSE 3000
# Auto-resolve DATABASE_URL if Railway sets DATABASE_PUBLIC_URL / POSTGRES_URL, then migrate & start
CMD ["sh", "-c", "export DATABASE_URL=\"${DATABASE_URL:-${DATABASE_PUBLIC_URL:-${DATABASE_PRIVATE_URL:-${POSTGRES_URL:-${POSTGRESQL_URL}}}}}\"; npx prisma migrate deploy && node dist/main.js"]
