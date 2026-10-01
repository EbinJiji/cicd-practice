FROM node:24-alpine

# The app has no dependencies and runs with plain `node`, so drop the package
# managers that ship with the base image. Less code in the image means fewer
# vulnerabilities for the Trivy scan to find (npm bundles its own packages).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
      /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg

WORKDIR /app
COPY package.json ./
COPY src ./src

# The commit this image was built from, reported by /health.
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA

ENV PORT=3000
EXPOSE 3000

# Run as the non-root "node" user that ships with the image.
USER node
CMD ["node", "src/server.js"]
