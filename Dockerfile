FROM node:20-slim

# Install FFmpeg and other dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Try npm ci first (faster and more reliable), fallback to npm install if it fails
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev || npm install --production; \
    else \
      npm install --production; \
    fi

# Copy application files
COPY backend/ ./backend/
COPY index.js ./

# Expose port (Render uses PORT env var)
EXPOSE ${PORT:-8080}

# Start the application
CMD ["node", "index.js"]
