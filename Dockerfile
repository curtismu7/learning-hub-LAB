# Build the web app, then run the hub API, which also serves web/dist and the packaged packs.
FROM node:22-alpine AS build
WORKDIR /app
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY web web
RUN npm run build -w web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
COPY package.json package-lock.json ./
COPY server/package.json server/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY server/src server/src
COPY server/schema server/schema
COPY packs packs
COPY data data
COPY --from=build /app/web/dist web/dist
USER node
EXPOSE 4600
# Inside the container the hub must listen on all interfaces, so HUB_BIND is set here on purpose.
# The k8s manifest sets HUB_ALLOWED_HOSTS and MOCK_ONLY; the image does not carry a .env.
ENV HUB_PORT=4600 HUB_BIND=0.0.0.0
CMD ["node", "server/src/index.js"]
