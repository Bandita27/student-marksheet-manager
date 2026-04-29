# pyright: reportArgumentType=false, reportAttributeAccessIssue=false, reportOptionalMemberAccess=false, reportGeneralTypeIssues=false
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException, UploadFile

from app.models import admin_model, assignment_model
from app.schemas.assignment_schemas import (
    AssignmentCreate, GradeUpdate,
)


# ---------- File upload config ----------
UPLOAD_ROOT = Path("uploads/submissions")
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB

# Master whitelist — security ceiling. A professor's per-assignment list
# can only be a subset of this; never a superset.
GLOBAL_ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".md", ".txt",
    ".png", ".jpg", ".jpeg",
    ".py", ".js", ".java", ".cpp", ".c", ".ipynb",
    ".zip",
}
# Backwards-compat alias
ALLOWED_EXTENSIONS = GLOBAL_ALLOWED_EXTENSIONS


def _normalize_extensions(exts: list[str] | None) -> list[str] | None:
    """Validate + clean a professor-supplied list. None / empty -> None (use global)."""
    if not exts:
        return None
    cleaned: list[str] = []
    for raw in exts:
        e = raw.strip().lower()
        if not e.startswith("."):
            e = "." + e
        if e not in GLOBAL_ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Extension {e} is not in the allowed list.",
            )
        if e not in cleaned:
            cleaned.append(e)
    if not cleaned:
        return None
    return cleaned


def _parse_extensions(stored: str | None) -> list[str] | None:
    """DB string -> list of extensions. None -> 'no override; use global'."""
    if not stored:
        return None
    parts = [e.strip() for e in stored.split(",") if e.strip()]
    return parts or None


def _effective_allowed(assignment) -> set[str]:
    """Resolve the actual allowed-set for this assignment."""
    parsed = _parse_extensions(getattr(assignment, "allowed_extensions", None))
    if parsed is None:
        return GLOBAL_ALLOWED_EXTENSIONS
    return set(parsed)


def _save_upload(
    file: UploadFile,
    assignment_id: int,
    student_id: int,
    allowed: set[str],
) -> tuple[str, str]:
    """Save upload to disk; return (relative_url_path, original_filename)."""
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        nice = ", ".join(sorted(allowed)) if allowed else "(none)"
        raise HTTPException(
            status_code=400,
            detail=f"File type {ext or '(none)'} not allowed. Accepted: {nice}.",
        )

    data = file.file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")

    folder = UPLOAD_ROOT / str(assignment_id)
    folder.mkdir(parents=True, exist_ok=True)

    disk_name = f"{student_id}_{uuid.uuid4().hex}{ext}"
    disk_path = folder / disk_name
    disk_path.write_bytes(data)

    url_path = f"/uploads/submissions/{assignment_id}/{disk_name}"
    return url_path, file.filename or disk_name


def _delete_file(file_path: str) -> None:
    """Best-effort delete of a stored upload."""
    p = Path("." + file_path) if file_path.startswith("/") else Path(file_path)
    if p.exists():
        try:
            p.unlink()
        except OSError:
            pass


# ===================================================================
# PROFESSOR
# ===================================================================

def create_assignment(db: Session, payload: AssignmentCreate, professor_id: int):
    if payload.due_date <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Due date must be in the future.")

    normalized = _normalize_extensions(payload.allowed_extensions)
    stored = ",".join(normalized) if normalized else None

    new_assignment = assignment_model.Assignment(
        professor_id=professor_id,
        title=payload.title,
        description=payload.description,
        subject=payload.subject,
        due_date=payload.due_date,
        max_marks=payload.max_marks,
        allowed_extensions=stored,
    )
    try:
        db.add(new_assignment)
        db.commit()
        db.refresh(new_assignment)
        return new_assignment
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create assignment")


def list_my_assignments(db: Session, professor_id: int):
    rows = (
        db.query(
            assignment_model.Assignment,
            func.count(assignment_model.Submission.id).label("sub_count"),
        )
        .outerjoin(
            assignment_model.Submission,
            assignment_model.Submission.assignment_id == assignment_model.Assignment.id,
        )
        .filter(assignment_model.Assignment.professor_id == professor_id)
        .group_by(assignment_model.Assignment.id)
        .order_by(assignment_model.Assignment.due_date.desc())
        .all()
    )

    professor = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == professor_id
    ).first()
    prof_name = professor.name if professor else None

    return [
        {
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "subject": a.subject,
            "due_date": a.due_date,
            "max_marks": a.max_marks,
            "created_at": a.created_at,
            "submission_count": int(count),
            "professor_name": prof_name,
            "allowed_extensions": _parse_extensions(a.allowed_extensions),
        }
        for a, count in rows
    ]


def delete_assignment(db: Session, assignment_id: int, professor_id: int):
    a = db.query(assignment_model.Assignment).filter(
        assignment_model.Assignment.id == assignment_id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    if int(a.professor_id) != professor_id:
        raise HTTPException(status_code=403, detail="Not your assignment.")

    folder = UPLOAD_ROOT / str(assignment_id)
    if folder.exists():
        for f in folder.iterdir():
            try:
                f.unlink()
            except OSError:
                pass
        try:
            folder.rmdir()
        except OSError:
            pass

    try:
        db.delete(a)
        db.commit()
        return {"message": f"Assignment {assignment_id} deleted"}
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete assignment")


def list_submissions(db: Session, assignment_id: int, professor_id: int):
    a = db.query(assignment_model.Assignment).filter(
        assignment_model.Assignment.id == assignment_id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found.")
    if int(a.professor_id) != professor_id:
        raise HTTPException(status_code=403, detail="Not your assignment.")

    rows = (
        db.query(assignment_model.Submission, admin_model.Admin.name)
        .join(admin_model.Admin, admin_model.Admin.id == assignment_model.Submission.student_id)
        .filter(assignment_model.Submission.assignment_id == assignment_id)
        .order_by(assignment_model.Submission.submitted_at.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "assignment_id": s.assignment_id,
            "student_id": s.student_id,
            "student_name": str(name),
            "file_name": s.file_name,
            "file_path": s.file_path,
            "submitted_at": s.submitted_at,
            "marks_awarded": s.marks_awarded,
            "feedback": s.feedback,
            "graded_at": s.graded_at,
        }
        for s, name in rows
    ]


def grade_submission(db: Session, submission_id: int, payload: GradeUpdate, professor_id: int):
    sub = db.query(assignment_model.Submission).filter(
        assignment_model.Submission.id == submission_id
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found.")

    a = db.query(assignment_model.Assignment).filter(
        assignment_model.Assignment.id == sub.assignment_id
    ).first()
    if not a or int(a.professor_id) != professor_id:
        raise HTTPException(status_code=403, detail="Not your assignment.")

    if payload.marks_awarded > int(a.max_marks):
        raise HTTPException(
            status_code=400,
            detail=f"Marks cannot exceed max ({int(a.max_marks)}).",
        )

    setattr(sub, "marks_awarded", payload.marks_awarded)
    setattr(sub, "feedback", payload.feedback)
    setattr(sub, "graded_at", datetime.utcnow())

    try:
        db.commit()
        db.refresh(sub)
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save grade")

    student = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == sub.student_id
    ).first()
    return {
        "id": sub.id,
        "assignment_id": sub.assignment_id,
        "student_id": sub.student_id,
        "student_name": str(student.name) if student else "",
        "file_name": sub.file_name,
        "file_path": sub.file_path,
        "submitted_at": sub.submitted_at,
        "marks_awarded": sub.marks_awarded,
        "feedback": sub.feedback,
        "graded_at": sub.graded_at,
    }


# ===================================================================
# STUDENT
# ===================================================================

def list_assignments_for_student(db: Session, student_id: int):
    student = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == student_id
    ).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    rows = (
        db.query(
            assignment_model.Assignment,
            admin_model.Admin.name.label("prof_name"),
            assignment_model.Submission,
        )
        .join(
            admin_model.Admin,
            admin_model.Admin.id == assignment_model.Assignment.professor_id,
        )
        .outerjoin(
            assignment_model.Submission,
            (assignment_model.Submission.assignment_id == assignment_model.Assignment.id)
            & (assignment_model.Submission.student_id == student_id),
        )
        .filter(
            (assignment_model.Assignment.professor_id == student.created_by)
            if student.created_by is not None
            else (assignment_model.Assignment.id.isnot(None))
        )
        .order_by(assignment_model.Assignment.due_date.asc())
        .all()
    )

    out = []
    for a, prof_name, sub in rows:
        out.append({
            "id": a.id,
            "title": a.title,
            "description": a.description,
            "subject": a.subject,
            "due_date": a.due_date,
            "max_marks": a.max_marks,
            "professor_name": str(prof_name) if prof_name else None,
            "allowed_extensions": _parse_extensions(a.allowed_extensions),
            "submission_id": sub.id if sub else None,
            "submitted_at": sub.submitted_at if sub else None,
            "submission_file_name": sub.file_name if sub else None,
            "marks_awarded": sub.marks_awarded if sub else None,
            "feedback": sub.feedback if sub else None,
        })
    return out


def submit_assignment(
    db: Session,
    assignment_id: int,
    file: UploadFile,
    student_id: int,
):
    a = db.query(assignment_model.Assignment).filter(
        assignment_model.Assignment.id == assignment_id
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    due = a.due_date
    if hasattr(due, "tzinfo") and due.tzinfo is not None:
        due = due.replace(tzinfo=None)
    if datetime.utcnow() > due:
        raise HTTPException(status_code=400, detail="The deadline has passed.")

    allowed = _effective_allowed(a)
    file_path, file_name = _save_upload(file, assignment_id, student_id, allowed)

    existing = db.query(assignment_model.Submission).filter(
        assignment_model.Submission.assignment_id == assignment_id,
        assignment_model.Submission.student_id == student_id,
    ).first()

    try:
        if existing:
            _delete_file(str(existing.file_path))
            setattr(existing, "file_path", file_path)
            setattr(existing, "file_name", file_name)
            setattr(existing, "submitted_at", datetime.utcnow())
            setattr(existing, "marks_awarded", None)
            setattr(existing, "feedback", None)
            setattr(existing, "graded_at", None)
            db.commit()
            db.refresh(existing)
            sub = existing
        else:
            sub = assignment_model.Submission(
                assignment_id=assignment_id,
                student_id=student_id,
                file_path=file_path,
                file_name=file_name,
            )
            db.add(sub)
            db.commit()
            db.refresh(sub)
    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save submission")

    student = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == student_id
    ).first()
    return {
        "id": sub.id,
        "assignment_id": sub.assignment_id,
        "student_id": sub.student_id,
        "student_name": str(student.name) if student else "",
        "file_name": sub.file_name,
        "file_path": sub.file_path,
        "submitted_at": sub.submitted_at,
        "marks_awarded": sub.marks_awarded,
        "feedback": sub.feedback,
        "graded_at": sub.graded_at,
    }


# ===================================================================
# Auth-checked download (used by both student and professor)
# ===================================================================

def get_submission_for_download(db: Session, submission_id: int, user_id: int):
    """
    Returns (disk_path, file_name) if user (student owner OR assignment's professor)
    is allowed to download. Raises 403/404 otherwise.
    """
    sub = db.query(assignment_model.Submission).filter(
        assignment_model.Submission.id == submission_id
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found.")

    a = db.query(assignment_model.Assignment).filter(
        assignment_model.Assignment.id == sub.assignment_id
    ).first()

    is_owner_student = int(sub.student_id) == user_id
    is_owner_prof = a is not None and int(a.professor_id) == user_id
    if not (is_owner_student or is_owner_prof):
        raise HTTPException(status_code=403, detail="Forbidden.")

    file_path_str = str(sub.file_path)
    disk_path = (
        Path("." + file_path_str) if file_path_str.startswith("/") else Path(file_path_str)
    )
    if not disk_path.exists():
        raise HTTPException(status_code=404, detail="File missing on server.")

    return disk_path, str(sub.file_name)