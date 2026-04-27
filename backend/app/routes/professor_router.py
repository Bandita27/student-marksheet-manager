from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.cors.database import get_db
from app.controllers import admin_controller, professor_controller
from app.controllers.admin_controller import get_current_professor
from app.schemas.auth_schemas import LoginRequest, LoginResponse
from app.schemas.student_schemas import StudentCreate, StudentResponse

from app.schemas.mark_schemas import MarkCreate, MarkUpdate, MarkResponse


router = APIRouter(prefix="/professor", tags=["Professor"])


# ---------- Public ----------
@router.post("/login", response_model=LoginResponse)
def login(credentials: LoginRequest, db: Session = Depends(get_db)):
    return admin_controller.login_user(db, credentials, "professor")


# ---------- Professor-only ----------
@router.post("/students", response_model=StudentResponse)
def add_student(
    payload: StudentCreate,
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    return professor_controller.add_student(db, payload, int(professor.id))


@router.get("/students", response_model=list[StudentResponse])
def list_students(
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    return professor_controller.list_my_students(db, int(professor.id))

@router.post("/marks", response_model=MarkResponse)
def add_mark(
    payload: MarkCreate,
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    return professor_controller.add_mark(db, payload, int(professor.id))


@router.put("/marks/{mark_id}", response_model=MarkResponse)
def update_mark(
    mark_id: int,
    payload: MarkUpdate,
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    return professor_controller.update_mark(db, mark_id, payload, int(professor.id))


@router.get("/marks/student/{student_id}", response_model=list[MarkResponse])
def list_student_marks(
    student_id: int,
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    return professor_controller.list_student_marks(db, student_id, int(professor.id))

@router.get("/analytics")
def class_analytics(
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    return professor_controller.class_toppers(db, int(professor.id))