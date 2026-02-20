FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production && apk add --no-cache curl

COPY server/ ./server/
COPY public/ ./public/

RUN mkdir -p /data && chown -R node:node /app /data

ENV PORT=3000
ENV CONFIG_PATH=/data/config.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:3000/health || exit 1

USER node
CMD ["node", "server/index.js"]
