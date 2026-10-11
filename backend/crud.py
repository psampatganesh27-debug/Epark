import random
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from sqlalchemy.orm import Session
from sqlalchemy import update

from models import Spot, Booking
import schemas

RESERVATION_EXPIRY_MINUTES = 15  # Auto-release if OTP not checked in within 15 mins of creation


def _time_to_minutes(t_str: str) -> int:
    """Helper to convert HH:MM to minutes from midnight."""
    try:
        parts = t_str.strip().split(":")
        return int(parts[0]) * 60 + int(parts[1])
    except Exception:
        return 0


def _minutes_to_time(m: int) -> str:
    """Helper to convert minutes to HH:MM format."""
    h = (m // 60) % 24
    mins = m % 60
    return f"{h:02d}:{mins:02d}"


# ── Spot CRUD ────────────────────────────────────────────────────────────────

def get_spots(db: Session, status: Optional[str] = None, include_archived: bool = False):
    _expire_stale_reservations(db)
    query = db.query(Spot)
    if not include_archived:
        query = query.filter(Spot.is_archived == False)
    spots = query.order_by(Spot.created_at.desc()).all()
    
    # Enrich each spot with active booked slots
    result = []
    for s in spots:
        # Get active (PENDING or VERIFIED) bookings
        active_bookings = (
            db.query(Booking)
            .filter(
                Booking.spot_id == s.id,
                Booking.status.in_(["PENDING", "VERIFIED"])
            )
            .all()
        )
        
        booked_slots = [
            {
                "start_time": b.start_time or s.avail_start,
                "end_time": b.end_time or s.avail_end,
                "status": b.status,
                "driver_name": b.driver_name or "Driver",
            }
            for b in active_bookings
            if b.start_time and b.end_time
        ]
        booked_slots.sort(key=lambda x: _time_to_minutes(x["start_time"]))

        # Determine real-time spot status:
        # If currently occupying full window or active verified check-in right now
        now_str = datetime.now().strftime("%H:%M")
        now_mins = _time_to_minutes(now_str)

        # Check if right now is within any verified session
        currently_occupied = any(
            b.status == "VERIFIED" and
            _time_to_minutes(b.start_time or "00:00") <= now_mins < _time_to_minutes(b.end_time or "23:59")
            for b in active_bookings
        )

        currently_held = any(
            b.status == "PENDING" and
            _time_to_minutes(b.start_time or "00:00") <= now_mins < _time_to_minutes(b.end_time or "23:59")
            for b in active_bookings
        )

        computed_status = "AVAILABLE"
        if currently_occupied:
            computed_status = "OCCUPIED"
        elif currently_held:
            computed_status = "RESERVED"
        
        # Attach dynamic fields
        s_dict = schemas.SpotOut.model_validate(s).model_dump()
        s_dict["status"] = computed_status
        s_dict["is_archived"] = bool(s.is_archived)
        s_dict["booked_slots"] = booked_slots
        result.append(schemas.SpotOut(**s_dict))

    if status:
        result = [r for r in result if r.status == status]
    return result


def get_spot(db: Session, spot_id: int) -> Optional[Spot]:
    return db.query(Spot).filter(Spot.id == spot_id).first()


def create_spot(db: Session, data: schemas.SpotCreate) -> Spot:
    spot = Spot(**data.model_dump())
    db.add(spot)
    db.commit()
    db.refresh(spot)
    return spot


def delete_spot(db: Session, spot_id: int) -> bool:
    """Soft-archives spot listing so financial history and bookings are preserved."""
    spot = get_spot(db, spot_id)
    if not spot:
        return False
    spot.is_archived = True
    db.commit()
    return True


def unarchive_spot(db: Session, spot_id: int) -> Optional[Spot]:
    """Restores an archived spot back to active listings."""
    spot = get_spot(db, spot_id)
    if not spot:
        return None
    spot.is_archived = False
    db.commit()
    db.refresh(spot)
    return spot


# ── Booking CRUD with Interval Overlap Concurrency ───────────────────────────

def get_bookings_for_spot(db: Session, spot_id: int):
    return (
        db.query(Booking)
        .filter(Booking.spot_id == spot_id)
        .order_by(Booking.booked_at.desc())
        .all()
    )


def create_booking(db: Session, data: schemas.BookingCreate) -> tuple[Optional[Booking], Optional[str]]:
    """
    Time-Interval aware concurrency lock:
    Only checks for collision with active bookings (PENDING or VERIFIED)
    whose time intervals overlap: max(startA, startB) < min(endA, endB).
    """
    _expire_stale_reservations(db)

    spot = get_spot(db, data.spot_id)
    if not spot:
        return None, "Parking spot not found"

    # Default start and end times if not explicitly passed
    req_start = data.start_time or spot.avail_start
    if not data.end_time:
        duration = data.duration_hrs or 1.0
        start_m = _time_to_minutes(req_start)
        req_end = _minutes_to_time(int(start_m + duration * 60))
    else:
        req_end = data.end_time

    req_start_m = _time_to_minutes(req_start)
    req_end_m = _time_to_minutes(req_end)

    # 1. Validate that the requested window falls inside host's available bounds
    host_start_m = _time_to_minutes(spot.avail_start)
    host_end_m = _time_to_minutes(spot.avail_end)
    if req_start_m < host_start_m or req_end_m > host_end_m or req_start_m >= req_end_m:
        return None, f"Operating hours for this spot are {spot.avail_start} to {spot.avail_end}."

    # 1b. Disallow booking intervals that have already ended in the past today
    now_m = _time_to_minutes(datetime.now().strftime("%H:%M"))
    if req_end_m <= now_m:
        return None, "Selected time slot has already passed for today."

    # 2. Concurrency Conflict Check: Check for overlapping active bookings
    active_bookings = (
        db.query(Booking)
        .filter(
            Booking.spot_id == data.spot_id,
            Booking.status.in_(["PENDING", "VERIFIED"])
        )
        .all()
    )

    for b in active_bookings:
        b_start_m = _time_to_minutes(b.start_time or spot.avail_start)
        b_end_m = _time_to_minutes(b.end_time or spot.avail_end)
        # Overlap condition: max(start1, start2) < min(end1, end2)
        if max(req_start_m, b_start_m) < min(req_end_m, b_end_m):
            db.rollback()
            return None, f"Slot is already booked from {b.start_time} to {b.end_time} by another driver."

    # 3. Create booking with unique 4-digit OTP
    otp = str(random.randint(1000, 9999))
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    
    # Calculate scheduled slot start datetime for today
    start_h, start_m = [int(p) for p in req_start.split(":")]
    slot_start_dt = now.replace(hour=start_h, minute=start_m, second=0, microsecond=0)
    
    # Grace period: 15 minutes after the scheduled slot start time!
    # (If slot already started or starting right now, 15 minutes from now)
    base_dt = max(now, slot_start_dt)
    expires_at = base_dt + timedelta(minutes=RESERVATION_EXPIRY_MINUTES)
    duration_hrs = (req_end_m - req_start_m) / 60.0

    booking = Booking(
        spot_id=data.spot_id,
        driver_name=data.driver_name,
        driver_phone=data.driver_phone,
        vehicle_no=data.vehicle_no,
        start_time=req_start,
        end_time=req_end,
        duration_hrs=round(duration_hrs, 1),
        otp=otp,
        expires_at=expires_at,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking, None


def verify_booking(db: Session, booking_id: int, otp: str) -> Optional[Booking]:
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking or booking.status != "PENDING":
        return None
    if booking.otp != otp:
        return None

    booking.status = "VERIFIED"
    booking.verified_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(booking)
    return booking


def cancel_booking(db: Session, booking_id: int) -> bool:
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        return False

    booking.status = "CANCELLED"
    db.commit()
    return True


def reset_spot(db: Session, spot_id: int) -> Optional[Spot]:
    """Owner resets spot (cancels/completes any active sessions)."""
    spot = get_spot(db, spot_id)
    if not spot:
        return None
    # Expire any pending or active bookings for this spot
    db.query(Booking).filter(
        Booking.spot_id == spot_id,
        Booking.status.in_(["PENDING", "VERIFIED"])
    ).update({"status": "CANCELLED"}, synchronize_session=False)

    spot.status = "AVAILABLE"
    db.commit()
    db.refresh(spot)
    return spot


# ── Auto-expiry sweep for unverified holds ───────────────────────────────────

def _expire_stale_reservations(db: Session):
    """Release any unverified bookings whose 15-min OTP hold has elapsed."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    stale = (
        db.query(Booking)
        .filter(
            Booking.status == "PENDING",
            Booking.expires_at.isnot(None),
            Booking.expires_at < now,
        )
        .all()
    )
    for booking in stale:
        booking.status = "EXPIRED"

    if stale:
        db.commit()
