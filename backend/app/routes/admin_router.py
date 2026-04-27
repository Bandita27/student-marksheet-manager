from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.cors.database import get_db
from app.controllers import admin_controller
from app.controllers.admin_controller import get_current_admin
from app.schemas.auth_schemas import LoginRequest, LoginResponse
from app.schemas.professor_schemas import ProfessorCreate, ProfessorResponse


router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/login", response_model=LoginResponse)
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    return admin_controller.login_admin(db, credentials)


@router.post(
    "/professors",
    response_model=ProfessorResponse,
    dependencies=[Depends(get_current_admin)],
)
def add_professor(payload: ProfessorCreate, db: Session = Depends(get_db)):
    return admin_controller.add_professor(db, payload)


@router.get(
    "/professors",
    response_model=list[ProfessorResponse],
    dependencies=[Depends(get_current_admin)],
)
def list_professors(db: Session = Depends(get_db)):
    return admin_controller.list_professors(db)


@router.delete(
    "/professors/{professor_id}",
    dependencies=[Depends(get_current_admin)],
)
def remove_professor(professor_id: int, db: Session = Depends(get_db)):
    return admin_controller.remove_professor(db, professor_id)