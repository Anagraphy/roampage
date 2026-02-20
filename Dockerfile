FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production && apk add --no-cache curl su-exec

COPY server/ ./server/
COPY public/ ./public/
COPY entrypoint.sh /entrypoint.sh

RUN mkdir -p /data && chown -R node:node /app /data && chmod +x /entrypoint.sh

ENV PORT=3000
ENV CONFIG_PATH=/data/config.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server/index.js"]
