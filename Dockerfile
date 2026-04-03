FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Create data directory for SQLite
RUN mkdir -p /data

# Set environment variable for DB path
ENV DB_PATH=/data/bible-bot.db

CMD ["node", "src/index.js"]
