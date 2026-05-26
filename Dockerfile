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

# Run pending Knex migrations on boot, THEN start the app.
# Migrations are idempotent (knex_migrations table tracks what ran), and the
# script reads DATABASE_URL from process.env which Render injects. If a
# migration fails the container will not start — that's intentional, so we
# don't silently boot against a half-migrated schema.
CMD ["sh", "-c", "node backend/scripts/migrate.js latest && node index.js"]
