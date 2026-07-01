FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy ETL source
COPY src/ ./src/

# Make etl.* importable from src/main.py
ENV PYTHONPATH=/app/src

CMD ["python", "-m", "src.main"]
