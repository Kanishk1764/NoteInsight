# ── Build stage ────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install dependencies into a prefix so we can copy just them in the final stage
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ── Final stage ────────────────────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

# Cloud Run injects PORT; default to 8080
ENV PORT=8080

# We read .env via python-dotenv in development; in Cloud Run, env vars are
# injected directly via the service configuration — no .env file needed.

EXPOSE 8080

# Use exec form so signals propagate correctly
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT --workers 1"]
