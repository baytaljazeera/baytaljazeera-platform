# Dockerfile for BaytAlJazeera Video Worker
# Optimized for Render deployment with FFmpeg & ImageMagick

FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    imagemagick \
    libmagickwand-dev \
    fonts-noto-color-emoji \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Configure ImageMagick policy for video processing
RUN sed -i 's/rights="none" pattern="PDF"/rights="read|write" pattern="PDF"/' /etc/ImageMagick-6/policy.xml || true

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create assets directory
RUN mkdir -p /app/assets

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV IMAGEMAGICK_BINARY=/usr/bin/convert
ENV FFMPEG_BINARY=/usr/bin/ffmpeg

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "from moviepy.editor import ImageClip; print('OK')" || exit 1

# Run the worker
CMD ["python", "video_engine.py"]
