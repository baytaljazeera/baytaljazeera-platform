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
# Migrations are idempotent (knex_migrations table tracks what ran). We log
# a warning if migration fails but still start the app — the routes have
# defensive fallbacks for the only currently-pending column ("priority"),
# and blocking boot on migration failure caused Render to keep serving an
# even older container, making things worse not better.
CMD ["sh", "-c", "node backend/scripts/migrate.js latest || echo '[boot] migration step failed — continuing with app start; check Render logs'; node index.js"]
