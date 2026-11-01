from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import crud
import schemas
import auth_utils
from database import get_db
from models import User

router = APIRouter(prefix="/api/spots", tags=["spots"])


@router.get("", response_model=List[schemas.SpotOut])
def list_spots(
    status: Optional[str] = Query(default=None, description="Filter by status"),
    include_archived: bool = Query(default=False, description="Include archived spots (for hosts)"),
    db: Session = Depends(get_db),
):
    return crud.get_spots(db, status=status, include_archived=include_archived)


@router.get("/my", response_model=List[schemas.SpotOut])
def list_my_spots(
    include_archived: bool = Query(default=True, description="Include archived spots"),
    user: User = Depends(auth_utils.get_current_user_required),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in.")
    return crud.get_spots(db, include_archived=include_archived, owner_id=user.id, owner_phone=user.phone)


@router.post("", response_model=schemas.SpotOut, status_code=201)
def create_spot(
    data: schemas.SpotCreate,
    user: User = Depends(auth_utils.get_current_user_required),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required. Please sign in with your PIN.")
    data.owner_id = user.id
    data.owner_name = data.owner_name or user.name
    data.owner_phone = data.owner_phone or user.phone
    return crud.create_spot(db, data)


@router.delete("/{spot_id}", status_code=204)
def delete_spot(
    spot_id: int,
    user: User = Depends(auth_utils.get_current_user_required),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    spot = crud.get_spot(db, spot_id)
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")
    if spot.owner_id and spot.owner_id != user.id and spot.owner_phone != user.phone:
        raise HTTPException(status_code=403, detail="Not authorized to modify this spot.")
    crud.delete_spot(db, spot_id)


@router.post("/{spot_id}/unarchive", response_model=schemas.SpotOut)
def unarchive_spot(
    spot_id: int,
    user: User = Depends(auth_utils.get_current_user_required),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    spot = crud.get_spot(db, spot_id)
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")
    if spot.owner_id and spot.owner_id != user.id and spot.owner_phone != user.phone:
        raise HTTPException(status_code=403, detail="Not authorized to modify this spot.")
    return crud.unarchive_spot(db, spot_id)


@router.get("/{spot_id}/bookings", response_model=List[schemas.BookingOut])
def spot_bookings(
    spot_id: int,
    user: User = Depends(auth_utils.get_current_user_required),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    spot = crud.get_spot(db, spot_id)
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")
    if spot.owner_id and spot.owner_id != user.id and spot.owner_phone != user.phone:
        raise HTTPException(status_code=403, detail="Not authorized to view bookings for this spot.")
    return crud.get_bookings_for_spot(db, spot_id)


@router.post("/{spot_id}/reset", response_model=schemas.SpotOut)
def reset_spot(
    spot_id: int,
    user: User = Depends(auth_utils.get_current_user_required),
    db: Session = Depends(get_db),
):
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required.")
    spot = crud.get_spot(db, spot_id)
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")
    if spot.owner_id and spot.owner_id != user.id and spot.owner_phone != user.phone:
        raise HTTPException(status_code=403, detail="Not authorized to reset this spot.")
    spot = crud.reset_spot(db, spot_id)
    if not spot:
        raise HTTPException(status_code=404, detail="Spot not found")
    return spot


@router.post("/admin/clear-data")
def clear_all_data(
    clear_spots: bool = Query(default=False, description="Whether to also clear spots"),
    db: Session = Depends(get_db),
):
    crud.clear_all_test_data(db, keep_sample_spots=not clear_spots)
    return {"message": "All test bookings successfully cleared."}

