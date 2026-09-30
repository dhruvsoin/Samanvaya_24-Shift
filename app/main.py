"""
Samanvaya - Flood Emergency Response Coordination System
Main FastAPI Application Entrypoint
"""

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("samanvaya.main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan management for startup and shutdown events."""
    logger.info("Starting up Samanvaya Emergency Coordination Backend...")
    yield
    logger.info("Shutting down Samanvaya Backend...")


app = FastAPI(
    title="Samanvaya Emergency Coordination API",
    description="Backend API and WebSocket engine for Samanvaya flood emergency response coordination system.",
    version="0.1.0",
    lifespan=lifespan,
)

# Enable CORS for frontend/dashboard development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, str]:
    """Health check endpoint to verify backend operational status."""
    return {
        "status": "ok",
        "system": "Samanvaya Backend",
    }


@app.websocket("/ws")
async def websocket_echo_endpoint(websocket: WebSocket) -> None:
    """Basic WebSocket echo endpoint for real-time connection and telemetry testing."""
    await websocket.accept()
    client_host = websocket.client.host if websocket.client else "unknown"
    logger.info(f"WebSocket client connected from {client_host}")

    try:
        while True:
            data = await websocket.receive_text()
            logger.debug(f"Received message: {data}")
            await websocket.send_text(f"Echo: {data}")
    except WebSocketDisconnect:
        logger.info(f"WebSocket client disconnected: {client_host}")
    except Exception as exc:
        logger.error(f"WebSocket connection error: {exc}", exc_info=True)
        await websocket.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
