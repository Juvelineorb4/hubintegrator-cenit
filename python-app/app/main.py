import os

from fastapi import FastAPI

# Load .env file if present (on-premise / local dev without Docker)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed — rely on OS environment variables

from app.core import cache
from app.routers import upload
from app.routers import tag_query
from app.routers import pressure_query
from app.routers import flow_query
from app.routers import volume_query
from app.routers import selector_query
app = FastAPI(
    title="PHD Hub Loader",
    version="1.0.0",
    description="API para carga masiva de systems, subsystems y tags desde Excel",
)

app.include_router(upload.router)
app.include_router(tag_query.router)
app.include_router(pressure_query.router)
app.include_router(flow_query.router)
app.include_router(volume_query.router)
app.include_router(selector_query.router)



@app.on_event("startup")
async def startup_event():
    await cache.connect()
    port = os.getenv("PORT", "8000")
    print(f"PHD Hub Loader corriendo en puerto {port}")


@app.on_event("shutdown")
async def shutdown_event():
    await cache.disconnect()


@app.get("/", tags=["health"])
def root():
    return {"status": "ok", "service": "phd-hub-loader"}