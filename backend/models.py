from sqlalchemy import Column, Integer, Text, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from database import Base


class Spot(Base):
    __tablename__ = "spots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(Text, nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    price_inr = Column(Float, nullable=False)           # per hour
    vehicle_type = Column(Text, nullable=False)         # "2W" | "4W" | "Both"
    avail_start = Column(Text, nullable=False)          # "HH:MM"
    avail_end = Column(Text, nullable=False)
    owner_label = Column(Text, nullable=True)
    owner_name = Column(Text, nullable=True)
    owner_phone = Column(Text, nullable=True)
    amenities = Column(Text, nullable=True, default="") # comma-separated: "covered,ev,cctv,gated"
    status = Column(Text, nullable=False, default="AVAILABLE")  # Overall state indicator
    is_archived = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, server_default=func.now())


class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    spot_id = Column(Integer, ForeignKey("spots.id"), nullable=False)
    driver_name = Column(Text, nullable=False)
    driver_phone = Column(Text, nullable=True)
    vehicle_no = Column(Text, nullable=False)
    start_time = Column(Text, nullable=True)            # "HH:MM" chosen start slot
    end_time = Column(Text, nullable=True)              # "HH:MM" chosen end slot
    duration_hrs = Column(Float, nullable=True, default=1.0)
    otp = Column(Text, nullable=False)                  # 4-digit string
    status = Column(Text, nullable=False, default="PENDING")  # PENDING | VERIFIED | EXPIRED | CANCELLED
    booked_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=True)        # auto-release time for unverified hold
    verified_at = Column(DateTime, nullable=True)
