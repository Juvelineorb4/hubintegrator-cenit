FROM python:3.12-slim

WORKDIR /app

# Install dependencies first for better layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy only application code
COPY app/ ./app/

EXPOSE 8000

# Production start — no --reload
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]