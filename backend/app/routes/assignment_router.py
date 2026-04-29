from fastapi import APIRouter, Depends, UploadFile, File
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from typing import cast

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
    
    # We use cast() or str() to satisfy Pylance that 'allowed_extensions' 
    # is being treated as its value, not the SQLAlchemy Column object itself.
    extensions_raw = cast(str, new_a.allowed_extensions)
    
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
        "allowed_extensions": assignment_controller._parse_extensions(extensions_raw),
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
# FILE DOWNLOAD / PREVIEW ENDPOINTS
# ====================================================================

@router.get("/submissions/{submission_id}/download")
def download_submission(
    submission_id: int, 
    db: Session = Depends(get_db), 
    professor=Depends(get_current_professor),
    preview: bool = False  # <--- This is the key
):
    disk_path, file_name = assignment_controller.get_submission_for_download(
        db, submission_id, int(professor.id)
    )
    
    # If the professor clicked 'Preview', we use 'inline'
    # Otherwise, we use 'attachment' to download
    disposition = "inline" if preview else "attachment"
    
    # Manually set the media type to PDF for testing if needed
    return FileResponse(
        path=disk_path, 
        filename=file_name, 
        content_disposition_type=disposition
    )


@router.get("/student/submissions/{submission_id}/download")
def student_download_submission(
    submission_id: int, 
    db: Session = Depends(get_db), 
    student=Depends(get_current_student)
):
    """
    Student endpoint to download their own submission.
    """
    disk_path, file_name = assignment_controller.get_submission_for_download(
        db, submission_id, int(student.id)
    )
    
    return FileResponse(
        path=disk_path, 
        filename=file_name, 
        media_type="application/octet-stream",
        content_disposition_type="attachment"
    )