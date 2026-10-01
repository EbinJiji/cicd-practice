# Stage 1: install production dependencies with npm.
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 2: the image that runs. Only node, the app and its dependencies; the
# package managers are removed, so they can't add vulnerabilities (Trivy scan).
FROM node:24-alpine

RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

WORKDIR /app
COPY package.json ./
COPY --from=deps /app/node_modules ./node_modules
COPY src ./src

# The commit this image was built from, reported by /health.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Run as the non-root "node" user that ships with the image.
USER node
CMD ["node", "src/server.js"]
