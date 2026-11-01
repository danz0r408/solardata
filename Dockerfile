FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SOLARDATA_DATA_DIR=/data

WORKDIR /app

COPY api/requirements.txt api/requirements.txt
RUN pip install --no-cache-dir -r api/requirements.txt

COPY api/ api/
COPY app/ app/

# Roda sem root; /data e o volume persistente (usuarios, segredo JWT, snapshot atualizado)
RUN useradd --create-home --uid 10001 solardata && mkdir -p /data && chown solardata /data
USER solardata

EXPOSE 8080
CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8080} --proxy-headers --forwarded-allow-ips='*'"]
