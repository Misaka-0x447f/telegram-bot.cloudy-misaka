FROM node:20
LABEL author=447f.misaka@outlook.com
WORKDIR ./misaka-app

# ffmpeg is required for video → gif conversion in the imgconv module.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install production dependencies. sharp needs its platform-specific native
# binary (@img/sharp-*), which rollup keeps external, so we install prod deps
# inside the image instead of copying them from the CI runner.
# --ignore-scripts skips husky's "prepare" (dev-only) and any postinstalls;
# sharp v0.33+ has no postinstall — its binaries ship in the platform packages.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Fail the build if the native deps aren't usable in this image
# (rather than only finding out at first request time).
RUN node -e "require('sharp')" && ffmpeg -version >/dev/null

# Bundle APP files
COPY ./dist ./

# Show current folder structure in logs
RUN ls -al

CMD ["node", "./index.js"]
