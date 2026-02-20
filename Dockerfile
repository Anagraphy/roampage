FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production && apk add --no-cache curl su-exec

COPY server/ ./server/
COPY public/ ./public/
COPY entrypoint.sh /entrypoint.sh

# Download frontend dependencies at build time — not committed to git
RUN curl -sL "https://unpkg.com/pell@1.0.6/dist/pell.min.js" -o public/pell.min.js \
 && curl -sL "https://unpkg.com/pell@1.0.6/dist/pell.min.css" -o public/pell.min.css \
 && curl -sL "https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js" -o public/purify.min.js

RUN mkdir -p /data && chown -R node:node /app /data && chmod +x /entrypoint.sh

ENV PORT=3000
ENV CONFIG_PATH=/data/config.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server/index.js"]
