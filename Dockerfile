# Single-file Node poller — no build step, prod deps only.
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY bot.js ./
CMD ["node", "bot.js"]
