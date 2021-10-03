FROM keymetrics/pm2:16-buster
LABEL author=447f.misaka@outlook.com

# Bundle APP files
COPY ./dist/index.js .
COPY ./scripts/docker .
COPY scripts/docker/ecosystem.config.js .
CMD mkdir local-configs
CMD chmod 644 local-configs

# Install app dependencies
ENV NPM_CONFIG_LOGLEVEL warn
RUN npm install --production

# Show current folder structure in logs
RUN ls -al

CMD [ "pm2-runtime", "start", "ecosystem.config.js" ]
