import random
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session
from sqlalchemy import update, or_

from models import Spot, Booking
import schemas

RESERVATION_EXPIRY_MINUTES = 15  # Auto-release if OTP not checked in within 15 mins of creation


def _get_now_ist() -> datetime:
    """Returns the current datetime in Indian Standard Time (Asia/Kolkata)."""
    try:
        return datetime.now(ZoneInfo("Asia/Kolkata"))
    except Exception:
        # Fallback if zoneinfo tzdata is unavailable
        return datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)


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

def get_spots(
    db: Session,
    status: Optional[str] = None,
    include_archived: bool = False,
    owner_id: Optional[int] = None,
    owner_phone: Optional[str] = None,
):
    _expire_stale_reservations(db)
    query = db.query(Spot)
    if not include_archived:
        query = query.filter(Spot.is_archived == False)
    if owner_id is not None or owner_phone is not None:
        filters = []
        if owner_id is not None:
            filters.append(Spot.owner_id == owner_id)
        if owner_phone is not None:
            filters.append((Spot.owner_phone == owner_phone) & (Spot.owner_phone != None))
        query = query.filter(or_(*filters))
    spots = query.order_by(Spot.created_at.desc()).all()
    
    now_ist = _get_now_ist()
    now_str = now_ist.strftime("%H:%M")
    now_mins = _time_to_minutes(now_str)

    # Enrich each spot with active booked slots
    result = []
    for s in spots:
        # Get active (PENDING or VERIFIED) bookings for today
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

    # 1b. Disallow booking intervals that have already ended in the past today (using local IST)
    now_ist = _get_now_ist()
    now_m = now_ist.hour * 60 + now_ist.minute
    if req_end_m <= now_m:
        return None, f"Selected time slot ({req_start} to {req_end}) has already passed for today."

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
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    
    # Calculate scheduled slot start datetime in UTC for expires_at
    start_h, start_m_part = [int(p) for p in req_start.split(":")]
    slot_start_ist = now_ist.replace(hour=start_h, minute=start_m_part, second=0, microsecond=0)
    slot_start_utc = (slot_start_ist - timedelta(hours=5, minutes=30)).replace(tzinfo=None)
    
    # Grace period: 15 minutes after the scheduled slot start time (or 15 mins from now if starting immediately)
    base_dt = max(now_utc, slot_start_utc)
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


def clear_all_test_data(db: Session, keep_sample_spots: bool = True):
    """Admin function: clears all test bookings and optionally deletes custom spots."""
    db.query(Booking).delete()
    if not keep_sample_spots:
        db.query(Spot).delete()
    else:
        # Reset all remaining spots to AVAILABLE
        db.query(Spot).update({"status": "AVAILABLE"})
    db.commit()


# ── Auto-expiry & Completion sweep for reservations ─────────────────────────

def _expire_stale_reservations(db: Session):
    """
    1. Release unverified bookings whose 15-min OTP hold has elapsed.
    2. Auto-complete past VERIFIED sessions whose end_time has passed today (or from previous days).
    """
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    now_ist = _get_now_ist()
    now_ist_date = now_ist.date()
    now_ist_mins = now_ist.hour * 60 + now_ist.minute

    # 1. Stale unverified holds
    stale_pending = (
        db.query(Booking)
        .filter(
            Booking.status == "PENDING",
            Booking.expires_at.isnot(None),
            Booking.expires_at < now_utc,
        )
        .all()
    )
    for booking in stale_pending:
        booking.status = "EXPIRED"

    # 2. Check active (PENDING or VERIFIED) bookings for past time completion
    active_bookings = (
        db.query(Booking)
        .filter(Booking.status.in_(["PENDING", "VERIFIED"]))
        .all()
    )
    for b in active_bookings:
        # Convert booked_at UTC to IST date
        b_ist_date = (b.booked_at + timedelta(hours=5, minutes=30)).date() if b.booked_at else now_ist_date
        if b_ist_date < now_ist_date:
            # Stale booking from a prior day
            b.status = "COMPLETED" if b.status == "VERIFIED" else "EXPIRED"
        elif b.end_time:
            b_end_mins = _time_to_minutes(b.end_time)
            if b_end_mins <= now_ist_mins:
                # Slot has passed for today
                b.status = "COMPLETED" if b.status == "VERIFIED" else "EXPIRED"

    db.commit()

