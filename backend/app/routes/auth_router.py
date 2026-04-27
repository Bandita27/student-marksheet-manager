from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.cors.database import get_db
from app.controllers import admin_controller
from app.schemas.auth_schemas import LoginRequest, LoginResponse


router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login", response_model=LoginResponse)
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    return admin_controller.login_any_user(db, credentials)