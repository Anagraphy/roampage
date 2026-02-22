FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production && apk add --no-cache curl su-exec

COPY server/ ./server/
COPY public/ ./public/
COPY entrypoint.sh /entrypoint.sh

# Download frontend dependencies at build time — not committed to git
# SHA256 hashes pin the exact content; build fails if CDN serves different bytes.
RUN curl -sL "https://unpkg.com/pell@1.0.6/dist/pell.min.js"                      -o public/pell.min.js \
 && curl -sL "https://unpkg.com/pell@1.0.6/dist/pell.min.css"                     -o public/pell.min.css \
 && curl -sL "https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js"    -o public/purify.min.js \
 && echo "e0c3c7785db014330cf6bcf04eccf943cc1fbde39366dee6b4f99778e9619a7d  public/pell.min.js" | sha256sum -c - \
 && echo "2ddda8dfeeb3af7dc04056cc6b99e69e3aef27e3a0744a986bbd965b72c972da  public/pell.min.css" | sha256sum -c - \
 && echo "8eb41b658831fab175fad9bcd00fcb2d84e0ed3a25a55053d4ecd4444b8b43a0  public/purify.min.js" | sha256sum -c -

RUN mkdir -p /data && chown -R node:node /app /data && chmod +x /entrypoint.sh

ENV PORT=3000
ENV CONFIG_PATH=/data/config.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD curl -f http://localhost:3000/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server/index.js"]
