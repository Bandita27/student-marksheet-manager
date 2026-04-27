from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException

from app.models import admin_model, mark_model


def get_my_marks(db: Session, student_id: int):
    student = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == student_id
    ).first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    marks = db.query(mark_model.Mark).filter(
        mark_model.Mark.student_id == student_id
    ).order_by(mark_model.Mark.subject).all()

    total = (
        db.query(func.sum(mark_model.Mark.marks_obtained))
        .filter(mark_model.Mark.student_id == student_id)
        .scalar()
        or 0
    )

    return {
        "student": {
            "id": int(str(student.id)),
            "name": str(student.name),
            "email": str(student.email),
        },
        "marks": [
            {
                "subject": str(m.subject),
                "marks_obtained": int(str(m.marks_obtained)),
            }
            for m in marks
        ],
        "total": int(total),
        "max_total": len(marks) * 100,
    }