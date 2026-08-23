"""Note Insight – FastAPI application entry point."""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import analyses, notes


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: initialise Firebase on startup."""
    import db

    db.get_db()  # guarantees Firebase Admin SDK is initialized on startup
    yield


app = FastAPI(
    title="Note Insight API",
    version="1.0.0",
    lifespan=lifespan,
)

_raw_origins = os.getenv("CORS_ORIGINS", "*")
if _raw_origins.strip() == "*":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_origin_regex=r"https://.*\.onrender\.com|https://.*\.web\.app|https://.*\.firebaseapp\.com|http://localhost:\d+",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

app.include_router(notes.router, prefix="/api")
app.include_router(analyses.router, prefix="/api")


@app.get("/healthz")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
