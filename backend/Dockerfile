# FastAPI backend image. Build context: ./backend
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies first so code edits don't invalidate the pip layer.
# uvicorn is the production server here only (Vercel brings its own), so it is
# pinned in the image rather than in the shared runtime requirements.
COPY requirements.txt .
RUN pip install -r requirements.txt "uvicorn[standard]==0.34.0"

# Same layout as the repo (app/ beside data/) so the snapshot path the
# data store resolves relative to its package works unchanged.
COPY app ./app
COPY data ./data

RUN useradd --system --uid 10001 --no-create-home appuser
USER appuser

ENV SNAPSHOT_PATH=/app/data/snapshot_jan2026.json.gz
EXPOSE 8000

# slim has no curl; use the interpreter that is already there.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status == 200 else 1)"]

# --proxy-headers + forwarded-allow-ips: trust X-Forwarded-* from the nginx
# container in front of us (compose network), so client scheme/IP are correct.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
