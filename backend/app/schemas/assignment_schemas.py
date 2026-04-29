from datetime import datetime
from pydantic import BaseModel, Field


# ---------- Assignment ----------
class AssignmentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    subject: str = Field(..., min_length=1, max_length=100)
    due_date: datetime
    max_marks: int = Field(default=100, ge=1, le=1000)


class AssignmentResponse(BaseModel):
    id: int
    title: str
    description: str | None = None
    subject: str
    due_date: datetime
    max_marks: int
    created_at: datetime
    submission_count: int = 0
    professor_name: str | None = None

    class Config:
        from_attributes = True


# ---------- Submission ----------
class SubmissionResponse(BaseModel):
    id: int
    assignment_id: int
    student_id: int
    student_name: str
    file_name: str
    file_path: str
    submitted_at: datetime
    marks_awarded: int | None = None
    feedback: str | None = None
    graded_at: datetime | None = None

    class Config:
        from_attributes = True


class GradeUpdate(BaseModel):
    marks_awarded: int = Field(..., ge=0)
    feedback: str | None = None


# ---------- Student-facing flattened view ----------
class StudentAssignmentView(BaseModel):
    id: int
    title: str
    description: str | None = None
    subject: str
    due_date: datetime
    max_marks: int
    professor_name: str | None = None

    submission_id: int | None = None
    submitted_at: datetime | None = None
    submission_file_name: str | None = None
    marks_awarded: int | None = None
    feedback: str | None = None