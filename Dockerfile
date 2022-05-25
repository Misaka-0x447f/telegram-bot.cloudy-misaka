FROM node:16
LABEL author=447f.misaka@outlook.com
WORKDIR ./misaka-app

# Bundle APP files
COPY ./dist .

# Show current folder structure in logs
RUN ls -al

CMD ["node", "./index.js"]
