FROM node:20-slim

RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci --only=production

COPY backend/ .

EXPOSE 8080

CMD ["node", "index.js"]
