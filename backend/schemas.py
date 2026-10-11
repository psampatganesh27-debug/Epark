from typing import Optional, List
from pydantic import BaseModel, Field, field_serializer
from datetime import datetime, timezone


# ── Spot Schemas ────────────────────────────────────────────────────────────

class SpotCreate(BaseModel):
    title: str
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    price_inr: float = Field(..., gt=0)
    vehicle_type: str       # "2W" | "4W" | "Both"
    avail_start: str        # "HH:MM"
    avail_end: str
    owner_label: Optional[str] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    amenities: Optional[str] = ""   # comma-separated: "covered,ev,cctv,gated"


class TimeSlot(BaseModel):
    start_time: str
    end_time: str
    status: str             # "AVAILABLE" | "RESERVED" | "OCCUPIED"


class SpotOut(BaseModel):
    id: int
    title: str
    latitude: float
    longitude: float
    price_inr: float
    vehicle_type: str
    avail_start: str
    avail_end: str
    owner_label: Optional[str]
    owner_name: Optional[str]
    owner_phone: Optional[str]
    amenities: Optional[str]
    status: str
    is_archived: bool = False
    created_at: Optional[datetime]
    booked_slots: Optional[List[dict]] = []

    model_config = {"from_attributes": True}


# ── Booking Schemas ──────────────────────────────────────────────────────────

class BookingCreate(BaseModel):
    spot_id: int
    driver_name: str
    driver_phone: Optional[str] = None
    vehicle_no: str
    start_time: Optional[str] = None   # "HH:MM"
    end_time: Optional[str] = None     # "HH:MM"
    duration_hrs: Optional[float] = Field(default=1.0, gt=0)


class OTPVerify(BaseModel):
    otp: str


class BookingOut(BaseModel):
    id: int
    spot_id: int
    driver_name: str
    driver_phone: Optional[str]
    vehicle_no: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_hrs: Optional[float]
    otp: str
    status: str
    booked_at: Optional[datetime]
    expires_at: Optional[datetime]
    verified_at: Optional[datetime]

    model_config = {"from_attributes": True}

    @field_serializer("booked_at", "expires_at", "verified_at")
    def serialize_dt(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        # Guarantee ISO string with trailing Z indicating UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()
