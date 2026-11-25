FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/* && pip install --no-cache-dir nvidia-riva-client
COPY server.py /app/server.py
EXPOSE 8090
CMD ["python", "/app/server.py"]
