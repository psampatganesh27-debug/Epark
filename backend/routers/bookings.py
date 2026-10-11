from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import crud
import schemas
from database import get_db

router = APIRouter(prefix="/api/bookings", tags=["bookings"])


@router.post("", response_model=schemas.BookingOut, status_code=201)
def create_booking(data: schemas.BookingCreate, db: Session = Depends(get_db)):
    booking, err_reason = crud.create_booking(db, data)
    if booking is None:
        raise HTTPException(
            status_code=400 if "Operating hours" in (err_reason or "") or "past" in (err_reason or "") else 409,
            detail=err_reason or "Spot is no longer available — someone else booked it first.",
        )
    return booking


@router.post("/{booking_id}/verify", response_model=schemas.BookingOut)
def verify_booking(
    booking_id: int,
    payload: schemas.OTPVerify,
    db: Session = Depends(get_db),
):
    booking = crud.verify_booking(db, booking_id, payload.otp)
    if booking is None:
        raise HTTPException(status_code=400, detail="Invalid OTP or booking not pending.")
    return booking


@router.delete("/{booking_id}", status_code=204)
def cancel_booking(booking_id: int, db: Session = Depends(get_db)):
    if not crud.cancel_booking(db, booking_id):
        raise HTTPException(status_code=404, detail="Booking not found")
