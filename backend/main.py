from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import engine, Base, SessionLocal
from routers import spots, bookings, auth
from models import Spot

import os

from sqlalchemy import text

# Create tables on startup
Base.metadata.create_all(bind=engine)


def run_migrations():
    """Non-destructive column migrations for SQLite/Postgres."""
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE spots ADD COLUMN owner_id INTEGER"))
            conn.commit()
        except Exception:
            pass
        try:
            conn.execute(text("ALTER TABLE bookings ADD COLUMN driver_id INTEGER"))
            conn.commit()
        except Exception:
            pass


run_migrations()


def seed_sample_data_if_empty():
    db = SessionLocal()
    try:
        if db.query(Spot).count() == 0:
            sample_spots = [
                Spot(
                    title="BIT Mesra, Ranchi, Kanke",
                    latitude=23.428758,
                    longitude=85.423614,
                    price_inr=30.0,
                    vehicle_type="Both",
                    avail_start="08:00",
                    avail_end="20:00",
                    owner_label="Easily accessible, secure and safe to park",
                    owner_name="Abhi",
                    owner_phone="8969370338",
                    amenities="gated,cctv",
                    status="AVAILABLE",
                    is_archived=False,
                ),
                Spot(
                    title="D.A.V Bistupur, Inner Circle Road, Jamshedpur",
                    latitude=22.797576,
                    longitude=86.177847,
                    price_inr=20.0,
                    vehicle_type="2W",
                    avail_start="08:00",
                    avail_end="22:00",
                    owner_label="Easily accessible, shade available",
                    owner_name="Pratik",
                    owner_phone="9234562145",
                    amenities="covered,ev",
                    status="AVAILABLE",
                    is_archived=False,
                ),
                Spot(
                    title="Jubilee Park, Jamshedpur, Golmuri",
                    latitude=22.811150,
                    longitude=86.203374,
                    price_inr=20.0,
                    vehicle_type="Both",
                    avail_start="09:00",
                    avail_end="23:00",
                    owner_label="Spacious driveway near park gate",
                    owner_name="Kshitij",
                    owner_phone="9876567895",
                    amenities="covered,cctv",
                    status="AVAILABLE",
                    is_archived=False,
                ),
            ]
            db.add_all(sample_spots)
            db.commit()
    except Exception as e:
        print(f"Error seeding initial data: {e}")
    finally:
        db.close()


seed_sample_data_if_empty()

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

app.include_router(auth.router)
app.include_router(spots.router)
app.include_router(bookings.router)


@app.get("/")
def root():
    return {"message": "EPark API running 🟢"}


@app.post("/api/admin/purge-data")
def purge_all_data():
    """Safety endpoint to permanently purge all user accounts, personal data, and bookings."""
    db = SessionLocal()
    try:
        from models import User, Booking
        db.query(Booking).delete()
        db.query(User).delete()
        db.query(Spot).filter(Spot.id > 3).delete()
        for s in db.query(Spot).all():
            s.owner_id = None
        db.commit()
        return {"status": "success", "message": "All user accounts, test data, and personal records permanently deleted."}
    except Exception as e:
        db.rollback()
        return {"status": "error", "message": str(e)}
    finally:
        db.close()
