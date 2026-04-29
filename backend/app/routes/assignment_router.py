# pyright: reportArgumentType=false, reportAttributeAccessIssue=false, reportOptionalMemberAccess=false, reportGeneralTypeIssues=false
from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.cors.database import get_db
from app.controllers import assignment_controller
from app.controllers.admin_controller import (
    get_current_professor,
    get_current_student,
)
from app.schemas.assignment_schemas import (
    AssignmentCreate,
    AssignmentResponse,
    SubmissionResponse,
    GradeUpdate,
    StudentAssignmentView,
)


router = APIRouter(tags=["Assignments"])


# ====================================================================
# PROFESSOR ENDPOINTS
# ====================================================================

@router.post("/professor/assignments", response_model=AssignmentResponse)
def create_assignment(
    payload: AssignmentCreate,
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    new_a = assignment_controller.create_assignment(db, payload, int(professor.id))
    return {
        "id": new_a.id,
        "title": new_a.title,
        "description": new_a.description,
        "subject": new_a.subject,
        "due_date": new_a.due_date,
        "max_marks": new_a.max_marks,
        "created_at": new_a.created_at,
        "submission_count": 0,
        "professor_name": str(professor.name),
        "allowed_extensions": assignment_controller._parse_extensions(
            str(new_a.allowed_extensions) if new_a.allowed_extensions is not None else None
        ),
    }


@router.get("/professor/assignments", response_model=list[AssignmentResponse])
def list_my_assignments(
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    return assignment_controller.list_my_assignments(db, int(professor.id))


@router.delete("/professor/assignments/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    return assignment_controller.delete_assignment(db, assignment_id, int(professor.id))


@router.get(
    "/professor/assignments/{assignment_id}/submissions",
    response_model=list[SubmissionResponse],
)
def list_submissions(
    assignment_id: int,
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    return assignment_controller.list_submissions(db, assignment_id, int(professor.id))


@router.put(
    "/professor/submissions/{submission_id}/grade",
    response_model=SubmissionResponse,
)
def grade_submission(
    submission_id: int,
    payload: GradeUpdate,
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    return assignment_controller.grade_submission(
        db, submission_id, payload, int(professor.id)
    )


@router.post("/professor/submissions/{submission_id}/ai-evaluate")
def ai_evaluate_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    """Manually run AI evaluation on a submission. Result is saved to DB."""
    return assignment_controller.run_ai_for_submission(
        db, submission_id, int(professor.id)
    )


# ====================================================================
# STUDENT ENDPOINTS
# ====================================================================

@router.get("/student/assignments", response_model=list[StudentAssignmentView])
def student_list_assignments(
    db: Session = Depends(get_db),
    student=Depends(get_current_student),
):
    return assignment_controller.list_assignments_for_student(db, int(student.id))


@router.post(
    "/student/assignments/{assignment_id}/submit",
    response_model=SubmissionResponse,
)
def submit_assignment(
    assignment_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    student=Depends(get_current_student),
):
    return assignment_controller.submit_assignment(
        db, assignment_id, file, int(student.id)
    )


# ====================================================================
# Auth-protected file download (works for both roles)
# ====================================================================

@router.get("/submissions/{submission_id}/download")
def download_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    professor=Depends(get_current_professor),
):
    """Professor downloading a student's submission file."""
    disk_path, file_name = assignment_controller.get_submission_for_download(
        db, submission_id, int(professor.id)
    )
    return FileResponse(
        path=disk_path, filename=file_name, media_type="application/octet-stream"
    )


@router.get("/student/submissions/{submission_id}/download")
def student_download_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    student=Depends(get_current_student),
):
    """Student downloading their own submission."""
    disk_path, file_name = assignment_controller.get_submission_for_download(
        db, submission_id, int(student.id)
    )
    return FileResponse(
        path=disk_path, filename=file_name, media_type="application/octet-stream"
    )