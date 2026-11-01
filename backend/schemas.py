from typing import Optional, List
from pydantic import BaseModel, Field, field_serializer, field_validator
from datetime import datetime, timezone


# ── Auth & User Schemas ──────────────────────────────────────────────────────

class UserRegister(BaseModel):
    phone: str = Field(..., description="Mobile number (10 digits)")
    name: str = Field(..., min_length=2, max_length=50, description="Full Name")
    pin: str = Field(..., min_length=4, max_length=6, description="4 or 6-digit numeric login PIN")
    default_vehicle_no: Optional[str] = Field(default=None, description="Default vehicle plate (e.g. JH05A1211)")

    @field_validator("pin")
    @classmethod
    def validate_pin(cls, v: str) -> str:
        clean = v.strip()
        if not clean.isdigit() or len(clean) not in (4, 6):
            raise ValueError("PIN must be exactly 4 or 6 numeric digits (e.g. 1234 or 123456).")
        return clean

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        digits = "".join(filter(str.isdigit, v))
        if len(digits) < 10:
            raise ValueError("Please provide a valid 10-digit mobile number.")
        return digits[-10:]  # Standardize to 10-digit format


class UserLogin(BaseModel):
    phone: str
    pin: str

    @field_validator("phone")
    @classmethod
    def sanitize_phone(cls, v: str) -> str:
        digits = "".join(filter(str.isdigit, v))
        return digits[-10:] if len(digits) >= 10 else digits


class UserOut(BaseModel):
    id: int
    phone: str
    name: str
    default_vehicle_no: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ── Spot Schemas ────────────────────────────────────────────────────────────

class SpotCreate(BaseModel):
    title: str
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    price_inr: float = Field(..., gt=0)
    vehicle_type: str       # "2W" | "4W" | "Both"
    avail_start: str        # "HH:MM"
    avail_end: str
    owner_id: Optional[int] = None
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
    owner_id: Optional[int] = None
    title: str
    latitude: float
    longitude: float
    price_inr: float
    vehicle_type: str
    avail_start: str
    avail_end: str
    owner_label: Optional[str] = None
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    amenities: Optional[str] = None
    status: str
    is_archived: bool = False
    created_at: Optional[datetime] = None
    booked_slots: Optional[List[dict]] = []

    model_config = {"from_attributes": True}


# ── Booking Schemas ──────────────────────────────────────────────────────────

class BookingCreate(BaseModel):
    spot_id: int
    driver_id: Optional[int] = None
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
    driver_id: Optional[int] = None
    driver_name: str
    driver_phone: Optional[str] = None
    vehicle_no: str
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    duration_hrs: Optional[float] = None
    otp: str
    status: str
    booked_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

    @field_serializer("booked_at", "expires_at", "verified_at")
    def serialize_dt(self, dt: Optional[datetime], _info):
        if dt is None:
            return None
        # Guarantee ISO string with trailing Z indicating UTC
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

