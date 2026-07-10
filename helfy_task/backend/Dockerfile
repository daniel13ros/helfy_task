FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY . .

ENV NODE_ENV=production
EXPOSE 3000

USER node

HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "bootstrap.js"]
