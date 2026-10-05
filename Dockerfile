FROM python:3.11-slim
WORKDIR /app
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update && apt-get install -y --no-install-recommends ffmpeg build-essential libsndfile1 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.lock ./
RUN pip install --no-cache-dir torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.lock \
    && python -m unidic download
COPY LICENSE NOTICE THIRD_PARTY_NOTICES.md ./
COPY app/ ./app/
COPY web/ ./web/
COPY scripts/download_model.py ./scripts/download_model.py
RUN useradd --create-home --uid 10001 sayloop && mkdir -p /app/data /models \
    && chown -R sayloop:sayloop /app/data /models
ENV LLH_DATA_DIR=/app/data HF_HOME=/models KOKORO_DEVICE=cpu KOKORO_THREADS=4
USER sayloop
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/health')"
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8765", "--workers", "1"]
