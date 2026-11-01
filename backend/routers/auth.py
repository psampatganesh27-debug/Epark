from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import User, Booking, Spot
import schemas
import auth_utils

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.AuthResponse, status_code=201)
def register(data: schemas.UserRegister, db: Session = Depends(get_db)):
    # Check if user with this phone already exists
    existing = db.query(User).filter(User.phone == data.phone).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this mobile number already exists. Please login with your PIN.",
        )

    # Hash the 4 or 6-digit PIN securely
    pin_hash = auth_utils.hash_pin(data.pin)

    new_user = User(
        phone=data.phone,
        name=data.name.strip(),
        pin_hash=pin_hash,
        default_vehicle_no=data.default_vehicle_no.strip().upper() if data.default_vehicle_no else None,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = auth_utils.create_access_token(new_user.id, new_user.phone, new_user.name)
    return schemas.AuthResponse(
        access_token=token,
        token_type="bearer",
        user=schemas.UserOut.model_validate(new_user),
    )


@router.post("/login", response_model=schemas.AuthResponse)
def login(data: schemas.UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.phone == data.phone).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Mobile number not registered. Please create an account first.",
        )

    if not auth_utils.verify_pin(data.pin, user.pin_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect Security PIN. Please try again.",
        )

    token = auth_utils.create_access_token(user.id, user.phone, user.name)
    return schemas.AuthResponse(
        access_token=token,
        token_type="bearer",
        user=schemas.UserOut.model_validate(user),
    )


@router.get("/me", response_model=schemas.UserOut)
def get_current_user_profile(
    user: User = Depends(auth_utils.get_current_user_required),
):
    return user


@router.get("/my-bookings", response_model=list[schemas.BookingOut])
def get_my_bookings(
    user: User = Depends(auth_utils.get_current_user_required),
    db: Session = Depends(get_db),
):
    """Returns all bookings created by or associated with the logged-in user's phone or ID."""
    bookings = (
        db.query(Booking)
        .filter(
            (Booking.driver_id == user.id) | (Booking.driver_phone == user.phone)
        )
        .order_by(Booking.booked_at.desc())
        .all()
    )
    return bookings
