FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.js ./

# Stdio MCP server: speaks JSON-RPC on stdin/stdout, logs to stderr.
# Starts and answers initialize + tools/list with no env vars;
# set NOVUMOS_TOKEN to enable tools/call forwarding.
CMD ["node", "index.js"]
