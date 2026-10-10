# =============================================================================
# AgiesAI Sentinel — Production Dockerfile
# Multi-stage build: Node (frontend) → Python (backend + frontend artefacts)
#
# Render deployment:
#   Root directory : . (repository root)
#   Dockerfile path: ./Dockerfile
#   Start command  : (leave blank — CMD in this file takes over)
#
# Required Render environment variables (set in dashboard, never here):
#   ENVIRONMENT, MONGODB_URI, SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD,
#   CSRF_TRUSTED_ORIGINS
#
# Optional:
#   TRUSTED_PROXIES, MONGODB_DB, PORT (Render injects this automatically)
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build the React/Vite frontend
# -----------------------------------------------------------------------------
FROM node:22-alpine AS frontend-builder

WORKDIR /build

# Install dependencies using the committed lockfile for a reproducible build.
# Copy only the manifest and lockfile first to maximise layer caching.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy the rest of the frontend source (excludes whatever is in .dockerignore)
COPY index.html vite.config.ts tsconfig*.json postcss.config.js tailwind.config.js ./
COPY src/ src/
COPY public/ public/

# Production build — outputs to /build/dist
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Python backend + built frontend
# -----------------------------------------------------------------------------
FROM python:3.13-slim AS runtime

# Non-root user for defence-in-depth
RUN groupadd --system appgroup && useradd --system --gid appgroup appuser

WORKDIR /app

# Install Python dependencies before copying application code so this layer
# is cached as long as requirements.txt has not changed.
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy only the backend application code (no venv, no .env, no data/)
COPY backend/app/ ./app/

# Copy the built frontend from Stage 1
COPY --from=frontend-builder /build/dist ./dist

# Change ownership to the non-root user
RUN chown -R appuser:appgroup /app

USER appuser

# Render injects $PORT at runtime. We expose 10000 as documentation only;
# the actual bound port is always read from $PORT by the CMD below.
EXPOSE 10000

# STATIC_DIR tells app/main.py where the built frontend lives.
# This is an absolute path matching the WORKDIR above.
ENV STATIC_DIR=/app/dist

# Production server: bind to all interfaces, read port from $PORT (Render),
# fall back to 10000 for local `docker run` testing without -e PORT=...
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-10000}"]
