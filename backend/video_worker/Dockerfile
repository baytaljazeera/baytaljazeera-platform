# Dockerfile for BaytAlJazeera Video Worker
# Optimized for Render deployment with FFmpeg & Gunicorn

FROM python:3.11-slim

# Install system dependencies (fonts-dejavu-core supports Arabic)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    imagemagick \
    libmagickwand-dev \
    libsm6 \
    libxext6 \
    fonts-dejavu-core \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Configure ImageMagick policy for video processing
RUN sed -i 's/none/read,write/g' /etc/ImageMagick-6/policy.xml 2>/dev/null || \
    sed -i 's/none/read,write/g' /etc/ImageMagick-7/policy.xml 2>/dev/null || true

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies with verbose output
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt && \
    pip list && \
    python -c "from moviepy.editor import ImageClip; print('MoviePy OK')"

# Copy application code
COPY . .

# Create assets directory
RUN mkdir -p /app/assets

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV IMAGEMAGICK_BINARY=/usr/bin/convert
ENV FFMPEG_BINARY=/usr/bin/ffmpeg

# Health check using Flask endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Run Gunicorn Server (1 worker, 300s timeout for video processing)
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--timeout", "300", "server:app"]
