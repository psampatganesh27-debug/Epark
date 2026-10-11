from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base
from routers import spots, bookings

import os

# Create tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="EPark API", version="0.1.0")

# Allow localhost dev server, Vercel deployments, and FRONTEND_URL env var if set
frontend_env = os.getenv("FRONTEND_URL")
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
]
if frontend_env:
    allowed_origins.append(frontend_env.strip().rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if frontend_env else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(spots.router)
app.include_router(bookings.router)


@app.get("/")
def root():
    return {"message": "EPark API running 🟢"}
