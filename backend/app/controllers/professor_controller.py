from sqlalchemy.orm import Session
from passlib.context import CryptContext
from fastapi import HTTPException

from app.models import admin_model
from app.schemas.student_schemas import StudentCreate

from app.models import mark_model
from app.schemas.mark_schemas import MarkCreate, MarkUpdate

from sqlalchemy import func

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def get_password(password: str) -> str:
    return pwd_context.hash(password[:71])


def add_student(db: Session, payload: StudentCreate, professor_id: int):
    existing = db.query(admin_model.Admin).filter(
        admin_model.Admin.email == payload.email
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="email is already registered")

    new_student = admin_model.Admin(
        name=payload.name,
        email=payload.email,
        password=get_password(payload.password),
        role="student",
        created_by=professor_id,
    )
    try:
        db.add(new_student)
        db.commit()
        db.refresh(new_student)
        return new_student
    except Exception as e:
        db.rollback()
        print(f"Error:{e}")
        raise HTTPException(status_code=500, detail="Failed to add student")


def list_my_students(db: Session, professor_id: int):
    return db.query(admin_model.Admin).filter(
        admin_model.Admin.role == "student",
        admin_model.Admin.created_by == professor_id,
    ).order_by(admin_model.Admin.id).all()


def add_mark(db: Session, payload: MarkCreate, professor_id: int):
    student = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == payload.student_id,
        admin_model.Admin.role == "student",
        admin_model.Admin.created_by == professor_id,
    ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found or not in your class",
        )

    new_mark = mark_model.Mark(
        student_id=payload.student_id,
        subject=payload.subject,
        marks_obtained=payload.marks_obtained,
        recorded_by=professor_id,
    )
    try:
        db.add(new_mark)
        db.commit()
        db.refresh(new_mark)
        return new_mark
    except Exception as e:
        db.rollback()
        print(f"Error:{e}")
        raise HTTPException(status_code=500, detail="Failed to add mark")


def update_mark(db: Session, mark_id: int, payload: MarkUpdate, professor_id: int):
    mark = db.query(mark_model.Mark).filter(
        mark_model.Mark.id == mark_id,
        mark_model.Mark.recorded_by == professor_id,
    ).first()

    if not mark:
        raise HTTPException(
            status_code=404,
            detail="Mark not found or not recorded by you",
        )

    if payload.subject is not None:
        setattr(mark, "subject", payload.subject)
    if payload.marks_obtained is not None:
        setattr(mark, "marks_obtained", payload.marks_obtained)

    try:
        db.commit()
        db.refresh(mark)
        return mark
    except Exception as e:
        db.rollback()
        print(f"Error:{e}")
        raise HTTPException(status_code=500, detail="Failed to update mark")


def list_student_marks(db: Session, student_id: int, professor_id: int):
    # First verify the professor owns this student
    student = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == student_id,
        admin_model.Admin.role == "student",
        admin_model.Admin.created_by == professor_id,
    ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found or not in your class",
        )

    return db.query(mark_model.Mark).filter(
        mark_model.Mark.student_id == student_id
    ).order_by(mark_model.Mark.subject).all()


def class_toppers(db: Session, professor_id: int):
    # Sum marks per student, but only for students this professor created
    results = (
        db.query(
            admin_model.Admin.id.label("student_id"),
            admin_model.Admin.name.label("name"),
            func.sum(mark_model.Mark.marks_obtained).label("total"),
        )
        .join(mark_model.Mark, mark_model.Mark.student_id == admin_model.Admin.id)
        .filter(
            admin_model.Admin.role == "student",
            admin_model.Admin.created_by == professor_id,
        )
        .group_by(admin_model.Admin.id, admin_model.Admin.name)
        .order_by(func.sum(mark_model.Mark.marks_obtained).desc())
        .all()
    )

    if not results:
        return {"top_scorer": None, "bottom_scorer": None, "all_students": []}

    top = results[0]
    bottom = results[-1]

    return {
        "top_scorer": {
            "student_id": int(top.student_id),
            "name": str(top.name),
            "total": int(top.total),
        },
        "bottom_scorer": {
            "student_id": int(bottom.student_id),
            "name": str(bottom.name),
            "total": int(bottom.total),
        },
        "all_students": [
            {
                "student_id": int(r.student_id),
                "name": str(r.name),
                "total": int(r.total),
            }
            for r in results
        ],
    }