from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.cors.database import get_db
from app.controllers import admin_controller, student_controller
from app.controllers.admin_controller import get_current_student
from app.schemas.auth_schemas import LoginRequest, LoginResponse
from app.schemas.marksheet_schemas import MarksheetResponse


router = APIRouter(prefix="/student", tags=["Student"])


@router.post("/login", response_model=LoginResponse)
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    return admin_controller.login_user(db, credentials, "student")


@router.get("/me/marks", response_model=MarksheetResponse)
def get_my_marks(
    db: Session = Depends(get_db),
    student=Depends(get_current_student),
):
    return student_controller.get_my_marks(db, int(student.id))