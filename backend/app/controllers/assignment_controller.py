# pyright: reportArgumentType=false, reportAttributeAccessIssue=false, reportOptionalMemberAccess=false, reportGeneralTypeIssues=false, reportPrivateImportUsage=false
import json
import re
import time
import uuid
from datetime import datetime
from pathlib import Path

from google import genai
from google.genai import types as genai_types
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException, UploadFile

from app.models import admin_model, assignment_model
from app.schemas.assignment_schemas import AssignmentCreate, GradeUpdate


# ── Hardcoded API key ────────────────────────────────────────────────
GEMINI_API_KEY = "AIzaSyBnJflrFy27dYeHngEgxR8no22dv-d94Z8"  

print("[AI] key prefix=" + GEMINI_API_KEY[:8] + " len=" + str(len(GEMINI_API_KEY)))

_gemini_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    return _gemini_client


# ── Model priority ───────────────────────────────────────────────────
GEMINI_MODEL_PRIORITY = [
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
]

# ── File config ──────────────────────────────────────────────────────
UPLOAD_ROOT = Path("uploads/submissions")
UPLOAD_ROOT.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = 10 * 1024 * 1024

GLOBAL_ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".md", ".txt",
    ".png", ".jpg", ".jpeg",
    ".py", ".js", ".java", ".cpp", ".c", ".ipynb",
    ".zip",
}
ALLOWED_EXTENSIONS = GLOBAL_ALLOWED_EXTENSIONS

TEXT_EXTENSIONS  = {".txt", ".md", ".py", ".js", ".java", ".cpp", ".c", ".ipynb"}
PDF_EXTENSIONS   = {".pdf"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg"}

_EXT_MIME: dict[str, str] = {
    ".pdf":  "application/pdf",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
}

GRADING_MODES: dict[str, str] = {
    "strict":   "Be very strict. Penalize every mistake, poor naming, and missing edge cases.",
    "balanced": "Grade fairly. Reward correct logic even if syntax has minor issues.",
    "lenient":  "Be encouraging. Reward effort and partial correctness generously.",
}


# ===================================================================
# Prompt builder — uses professor's rubric + mode + instructions
# ===================================================================

def _build_prompt(assignment, student_name: str) -> str:
    mode_text = GRADING_MODES.get(
        str(assignment.grading_mode or "balanced"),
        GRADING_MODES["balanced"],
    )

    # Parse rubric JSON stored by professor
    rubric_items: list[dict] = []
    if assignment.rubric:
        try:
            rubric_items = json.loads(str(assignment.rubric))
        except Exception:
            rubric_items = []

    custom_instructions = str(assignment.grading_instructions or "").strip()

    # ── Build rubric block ──────────────────────────────────────────
    if rubric_items:
        rubric_lines = "\n".join(
            "  - " + item["criteria"] + ": " + str(item["max_marks"]) + " marks"
            for item in rubric_items
        )
        rubric_section = "PROFESSOR RUBRIC (evaluate EACH criterion separately):\n" + rubric_lines

        format_lines = "\n".join(
            "CRITERIA: " + item["criteria"]
            + " | MARKS: <0-" + str(item["max_marks"]) + ">"
            + " | REASON: <one sentence>"
            for item in rubric_items
        )
    else:
        # Default rubric — split max_marks across three areas
        total = int(assignment.max_marks)
        c1 = round(total * 0.5)
        c2 = round(total * 0.3)
        c3 = total - c1 - c2

        rubric_section = (
            "RUBRIC (default — evaluate each):\n"
            "  - Correctness: "    + str(c1) + " marks\n"
            "  - Code Quality: "   + str(c2) + " marks\n"
            "  - Documentation: "  + str(c3) + " marks"
        )
        format_lines = (
            "CRITERIA: Correctness | MARKS: <0-"    + str(c1) + "> | REASON: <one sentence>\n"
            "CRITERIA: Code Quality | MARKS: <0-"   + str(c2) + "> | REASON: <one sentence>\n"
            "CRITERIA: Documentation | MARKS: <0-"  + str(c3) + "> | REASON: <one sentence>"
        )

    # ── Build full prompt ───────────────────────────────────────────
    prompt = (
        "You are an experienced professor grading a student assignment.\n\n"
        "ASSIGNMENT : " + str(assignment.title) + "\n"
        "SUBJECT    : " + str(assignment.subject) + "\n"
        "DESCRIPTION: " + str(assignment.description or "(none)") + "\n"
        "MAX MARKS  : " + str(assignment.max_marks) + "\n"
        "STUDENT    : " + student_name + "\n\n"
        "GRADING MODE: " + mode_text + "\n\n"
        + rubric_section + "\n\n"
    )

    if custom_instructions:
        prompt += "PROFESSOR'S CUSTOM INSTRUCTIONS:\n" + custom_instructions + "\n\n"

    prompt += (
        "Respond in EXACTLY this format — no extra lines, no markdown:\n\n"
        + format_lines + "\n"
        "TOTAL: <integer 0-" + str(assignment.max_marks) + ">\n"
        "SUMMARY: <2-3 sentences of overall feedback for the student>\n"
    )

    return prompt


# ===================================================================
# Response parser — handles the CRITERIA / TOTAL / SUMMARY format
# ===================================================================

def _parse_ai_response(raw: str, max_marks: int) -> dict:
    breakdown: list[dict] = []
    total: int | None = None
    summary = ""

    for line in raw.splitlines():
        stripped = line.strip()

        if stripped.upper().startswith("CRITERIA:"):
            try:
                parts = [p.strip() for p in stripped.split("|")]
                criteria  = parts[0].split(":", 1)[1].strip()
                marks_raw = parts[1].split(":", 1)[1].strip()
                marks_val = int(marks_raw.split("/")[0].strip())
                reason    = parts[2].split(":", 1)[1].strip() if len(parts) > 2 else ""
                breakdown.append({
                    "criteria": criteria,
                    "marks":    marks_val,
                    "reason":   reason,
                })
            except Exception:
                pass

        elif stripped.upper().startswith("TOTAL:"):
            digits = "".join(c for c in stripped.split(":", 1)[1] if c.isdigit())
            if digits:
                total = max(0, min(max_marks, int(digits)))

        elif stripped.upper().startswith("SUMMARY:"):
            summary = stripped.split(":", 1)[1].strip()

    # Fallback total — sum the breakdown
    if total is None and breakdown:
        total = max(0, min(max_marks, sum(item["marks"] for item in breakdown)))

    return {
        "suggested_marks": total,
        "feedback":        summary,
        "breakdown":       breakdown,
    }


# ===================================================================
# Gemini call with model fallback
# ===================================================================

def _call_gemini_with_fallback(contents: list, max_marks: int) -> dict | None:
    client = _get_client()
    gen_config = genai_types.GenerateContentConfig(  # type: ignore[call-arg]
        temperature=0.2
    )

    for model_name in GEMINI_MODEL_PRIORITY:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=gen_config,
            )
            raw = (response.text or "").strip()
            if not raw:
                print("[AI] " + model_name + " empty response — trying next.")
                continue

            print("[AI] Success: " + model_name)
            return _parse_ai_response(raw, max_marks)

        except Exception as e:
            err_str = str(e)
            is_quota = (
                "429" in err_str
                or "quota" in err_str.lower()
                or "RESOURCE_EXHAUSTED" in err_str
                or "rate" in err_str.lower()
            )
            if is_quota:
                wait = 5
                m = re.search(r"seconds:\s*(\d+)", err_str)
                if m:
                    wait = min(int(m.group(1)), 15)
                print("[AI] " + model_name + " quota hit — waiting " + str(wait) + "s.")
                time.sleep(wait)
                continue
            print("[AI] " + model_name + " error: " + str(e))
            continue

    return None


# ===================================================================
# Core AI eval
# ===================================================================

def _run_ai_eval(assignment, submission, db) -> dict | None:
    disk_path = _resolve_disk_path(str(submission.file_path))
    if not disk_path.exists():
        print("[AI] File not found: " + str(disk_path))
        return None

    ext = disk_path.suffix.lower()
    if ext not in (TEXT_EXTENSIONS | PDF_EXTENSIONS | IMAGE_EXTENSIONS):
        print("[AI] Unsupported ext: " + ext)
        return None

    student = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == submission.student_id
    ).first()
    student_name = str(student.name) if student else "Student"
    instruction  = _build_prompt(assignment, student_name)
    client       = _get_client()

    try:
        if ext in PDF_EXTENSIONS or ext in IMAGE_EXTENSIONS:
            mime     = _EXT_MIME.get(ext, "application/octet-stream")
            uploaded = client.files.upload(
                file=str(disk_path),
                config=genai_types.UploadFileConfig(mime_type=mime),
            )
            contents: list = [
                instruction,
                genai_types.Part.from_uri(
                    file_uri=uploaded.uri,
                    mime_type=uploaded.mime_type or mime,
                ),
            ]
        else:
            text = disk_path.read_text(encoding="utf-8", errors="replace")
            if len(text) > 150_000:
                text = text[:150_000] + "\n[...truncated...]"
            contents = [instruction + "\n\nSTUDENT SUBMISSION:\n```\n" + text + "\n```"]

    except Exception as e:
        print("[AI] Prompt preparation failed: " + str(e))
        return None

    return _call_gemini_with_fallback(contents, int(assignment.max_marks))


def _persist_ai_result(sub, ai_result: dict, db: Session) -> None:
    setattr(sub, "ai_suggested_marks", ai_result.get("suggested_marks"))
    setattr(sub, "ai_feedback",        ai_result.get("feedback"))
    breakdown = ai_result.get("breakdown", [])
    setattr(sub, "ai_breakdown", json.dumps(breakdown) if breakdown else None)
    try:
        db.commit()
        db.refresh(sub)
    except Exception as e:
        db.rollback()
        print("[AI] Persist failed: " + str(e))


# ===================================================================
# Misc helpers
# ===================================================================

def _resolve_disk_path(file_path_str: str) -> Path:
    fp = str(file_path_str)
    return Path("." + fp) if fp.startswith("/") else Path(fp)


def _normalize_extensions(exts: list[str] | None) -> list[str] | None:
    if not exts:
        return None
    cleaned: list[str] = []
    for raw in exts:
        e = raw.strip().lower()
        if not e.startswith("."):
            e = "." + e
        if e not in GLOBAL_ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail="Extension " + e + " is not allowed.")
        if e not in cleaned:
            cleaned.append(e)
    return cleaned or None


def _parse_extensions(stored: str | None) -> list[str] | None:
    if not stored:
        return None
    parts = [e.strip() for e in stored.split(",") if e.strip()]
    return parts or None


def _effective_allowed(assignment) -> set[str]:
    parsed = _parse_extensions(getattr(assignment, "allowed_extensions", None))
    return set(parsed) if parsed else GLOBAL_ALLOWED_EXTENSIONS


def _save_upload(
    file: UploadFile,
    assignment_id: int,
    student_id: int,
    allowed: set[str],
) -> tuple[str, str]:
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        nice = ", ".join(sorted(allowed)) if allowed else "(none)"
        raise HTTPException(
            status_code=400,
            detail="File type " + (ext or "(none)") + " not allowed. Accepted: " + nice + ".",
        )
    data = file.file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB limit.")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="Empty file.")

    folder    = UPLOAD_ROOT / str(assignment_id)
    folder.mkdir(parents=True, exist_ok=True)
    disk_name = str(student_id) + "_" + uuid.uuid4().hex + ext
    (folder / disk_name).write_bytes(data)
    return (
        "/uploads/submissions/" + str(assignment_id) + "/" + disk_name,
        file.filename or disk_name,
    )


def _delete_file(file_path: str) -> None:
    p = _resolve_disk_path(file_path)
    if p.exists():
        try:
            p.unlink()
        except OSError:
            pass


def _serialize_submission(s, name: str) -> dict:
    """Convert a Submission ORM row to a dict, parsing ai_breakdown JSON."""
    breakdown: list = []
    if s.ai_breakdown:
        try:
            breakdown = json.loads(str(s.ai_breakdown))
        except Exception:
            breakdown = []
    return {
        "id": s.id, "assignment_id": s.assignment_id, "student_id": s.student_id,
        "student_name": str(name), "file_name": s.file_name, "file_path": s.file_path,
        "submitted_at": s.submitted_at, "ai_suggested_marks": s.ai_suggested_marks,
        "ai_feedback": s.ai_feedback, "ai_breakdown": breakdown,
        "marks_awarded": s.marks_awarded, "feedback": s.feedback,
        "graded_at": s.graded_at, "grade_status": s.grade_status,
    }


# ===================================================================
# PROFESSOR endpoints
# ===================================================================

def create_assignment(db: Session, payload: AssignmentCreate, professor_id: int):
    if payload.due_date <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Due date must be in the future.")

    normalized = _normalize_extensions(payload.allowed_extensions)
    stored_ext = ",".join(normalized) if normalized else None

    # Serialize rubric as JSON
    stored_rubric = None
    if payload.rubric:
        stored_rubric = json.dumps([r.model_dump() for r in payload.rubric])

    new_a = assignment_model.Assignment(
        professor_id         = professor_id,
        title                = payload.title,
        description          = payload.description,
        subject              = payload.subject,
        due_date             = payload.due_date,
        max_marks            = payload.max_marks,
        allowed_extensions   = stored_ext,
        grading_mode         = payload.grading_mode,
        grading_instructions = payload.grading_instructions,
        rubric               = stored_rubric,
    )
    try:
        db.add(new_a)
        db.commit()
        db.refresh(new_a)
        return new_a
    except Exception as e:
        db.rollback()
        print("Error: " + str(e))
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

    result = []
    for a, count in rows:
        rubric_parsed = []
        if a.rubric:
            try:
                rubric_parsed = json.loads(str(a.rubric))
            except Exception:
                rubric_parsed = []
        result.append({
            "id": a.id, "title": a.title, "description": a.description,
            "subject": a.subject, "due_date": a.due_date, "max_marks": a.max_marks,
            "created_at": a.created_at, "submission_count": int(count),
            "professor_name": prof_name,
            "allowed_extensions":   _parse_extensions(a.allowed_extensions),
            "grading_mode":         a.grading_mode,
            "grading_instructions": a.grading_instructions,
            "rubric":               rubric_parsed,
        })
    return result


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
            try: f.unlink()
            except OSError: pass
        try: folder.rmdir()
        except OSError: pass

    try:
        db.delete(a)
        db.commit()
        return {"message": "Assignment " + str(assignment_id) + " deleted"}
    except Exception as e:
        db.rollback()
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
    return [_serialize_submission(s, name) for s, name in rows]


def grade_submission(
    db: Session, submission_id: int, payload: GradeUpdate, professor_id: int
):
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
            detail="Marks cannot exceed max (" + str(int(a.max_marks)) + ").",
        )

    setattr(sub, "marks_awarded", payload.marks_awarded)
    setattr(sub, "feedback",      payload.feedback)
    setattr(sub, "graded_at",     datetime.utcnow())
    setattr(sub, "grade_status",  "approved")

    try:
        db.commit()
        db.refresh(sub)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save grade")

    student = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == sub.student_id
    ).first()
    return _serialize_submission(sub, student.name if student else "")


# ===================================================================
# PUBLIC: Manual AI Evaluation
# ===================================================================

def run_ai_for_submission(db: Session, submission_id: int, professor_id: int) -> dict:
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

    disk_path = _resolve_disk_path(str(sub.file_path))
    if not disk_path.exists():
        raise HTTPException(status_code=404, detail="Submission file not found on server.")

    ext = disk_path.suffix.lower()
    if ext not in (TEXT_EXTENSIONS | PDF_EXTENSIONS | IMAGE_EXTENSIONS):
        raise HTTPException(
            status_code=422,
            detail=(
                "File type '" + ext + "' is not supported for AI evaluation. "
                "Supported: PDF, images, and text/code files."
            ),
        )

    ai_result = _run_ai_eval(a, sub, db)
    if ai_result is None:
        raise HTTPException(
            status_code=502,
            detail=(
                "Gemini quota exceeded on all models. "
                "Wait a minute and retry, or enable billing at https://aistudio.google.com"
            ),
        )

    _persist_ai_result(sub, ai_result, db)

    student = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == sub.student_id
    ).first()
    return _serialize_submission(sub, student.name if student else "")


# ===================================================================
# STUDENT endpoints
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
        .join(admin_model.Admin, admin_model.Admin.id == assignment_model.Assignment.professor_id)
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

    return [
        {
            "id": a.id, "title": a.title, "description": a.description,
            "subject": a.subject, "due_date": a.due_date, "max_marks": a.max_marks,
            "professor_name": str(prof_name) if prof_name else None,
            "allowed_extensions": _parse_extensions(a.allowed_extensions),
            "submission_id":        sub.id if sub else None,
            "submitted_at":         sub.submitted_at if sub else None,
            "submission_file_name": sub.file_name if sub else None,
            "grade_status":         sub.grade_status if sub else None,
            "marks_awarded": (sub.marks_awarded if sub and sub.grade_status == "approved" else None),
            "feedback":      (sub.feedback      if sub and sub.grade_status == "approved" else None),
        }
        for a, prof_name, sub in rows
    ]


def submit_assignment(
    db: Session, assignment_id: int, file: UploadFile, student_id: int
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
        assignment_model.Submission.student_id    == student_id,
    ).first()

    try:
        if existing:
            _delete_file(str(existing.file_path))
            for attr, val in [
                ("file_path", file_path), ("file_name", file_name),
                ("submitted_at", datetime.utcnow()), ("marks_awarded", None),
                ("feedback", None), ("graded_at", None), ("ai_suggested_marks", None),
                ("ai_feedback", None), ("ai_breakdown", None), ("grade_status", "pending"),
            ]:
                setattr(existing, attr, val)
            db.commit()
            db.refresh(existing)
            sub = existing
        else:
            sub = assignment_model.Submission(
                assignment_id=assignment_id, student_id=student_id,
                file_path=file_path, file_name=file_name, grade_status="pending",
            )
            db.add(sub)
            db.commit()
            db.refresh(sub)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save submission")

    # Auto AI eval — non-fatal
    try:
        ai_result = _run_ai_eval(a, sub, db)
        if ai_result:
            _persist_ai_result(sub, ai_result, db)
    except Exception as e:
        print("[AI] Auto eval failed (non-fatal): " + str(e))

    student = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == student_id
    ).first()
    return _serialize_submission(sub, student.name if student else "")


# ===================================================================
# Auth-checked download
# ===================================================================

def get_submission_for_download(db: Session, submission_id: int, user_id: int):
    sub = db.query(assignment_model.Submission).filter(
        assignment_model.Submission.id == submission_id
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Submission not found.")

    a = db.query(assignment_model.Assignment).filter(
        assignment_model.Assignment.id == sub.assignment_id
    ).first()

    if not (int(sub.student_id) == user_id or (a and int(a.professor_id) == user_id)):
        raise HTTPException(status_code=403, detail="Forbidden.")

    disk_path = _resolve_disk_path(str(sub.file_path))
    if not disk_path.exists():
        raise HTTPException(status_code=404, detail="File missing on server.")

    return disk_path, str(sub.file_name)