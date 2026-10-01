# ── STEG Internal API (Dockerfile) ──────────────────────────────────────────
# Serves the full operational SCADA API on port 8000.
# Entry point: app.main (main.py)

FROM python:3.12-slim

# System deps for psycopg2-binary
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (cached layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Run Alembic migrations then start the server
CMD ["sh", "-c", "python -m alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
