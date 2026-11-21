# Commander Live room server (api/ws.js behind server/live-server.js).
# Build from the repository root:
#   docker build -f deploy/hostinger/Dockerfile -t commander-live .
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Dependencies first, so a change to the server alone reuses this layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY logic.js ./
COPY api/ws.js ./api/ws.js
COPY server ./server

# The room server never writes to its own disk and never needs root.
USER node
ENV PORT=8787 HOST=0.0.0.0
EXPOSE 8787

# Healthy means the server answers and reaches its room storage.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/ws').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["node", "server/live-server.js"]
