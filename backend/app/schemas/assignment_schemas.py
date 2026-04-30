from datetime import datetime
from typing import Any
from pydantic import BaseModel, Field


# ── Rubric ──────────────────────────────────────────────
class RubricItem(BaseModel):
    criteria:  str
    max_marks: int = Field(..., ge=1)


# ── Assignment ──────────────────────────────────────────
class AssignmentCreate(BaseModel):
    title:       str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    subject:     str = Field(..., min_length=1, max_length=100)
    due_date:    datetime
    max_marks:   int = Field(default=100, ge=1, le=1000)
    allowed_extensions: list[str] | None = None

    # AI evaluation config
    grading_mode:         str            = "balanced"   # strict | balanced | lenient
    grading_instructions: str | None     = None
    rubric:               list[RubricItem] | None = None


class AssignmentResponse(BaseModel):
    id:               int
    title:            str
    description:      str | None = None
    subject:          str
    due_date:         datetime
    max_marks:        int
    created_at:       datetime
    submission_count: int = 0
    professor_name:   str | None = None
    allowed_extensions: list[str] | None = None

    grading_mode:         str | None = None
    grading_instructions: str | None = None
    rubric:               list[Any] | None = None   # parsed JSON

    class Config:
        from_attributes = True


# ── Submission ──────────────────────────────────────────
class SubmissionResponse(BaseModel):
    id:            int
    assignment_id: int
    student_id:    int
    student_name:  str
    file_name:     str
    file_path:     str
    submitted_at:  datetime

    ai_suggested_marks: int | None = None
    ai_feedback:        str | None = None
    ai_breakdown:       list[Any] | None = None   # [{criteria, marks, reason}]

    marks_awarded: int | None = None
    feedback:      str | None = None
    graded_at:     datetime | None = None
    grade_status:  str = "pending"

    class Config:
        from_attributes = True


class GradeUpdate(BaseModel):
    marks_awarded: int = Field(..., ge=0)
    feedback:      str | None = None


# ── Student view ────────────────────────────────────────
class StudentAssignmentView(BaseModel):
    id:          int
    title:       str
    description: str | None = None
    subject:     str
    due_date:    datetime
    max_marks:   int
    professor_name:     str | None = None
    allowed_extensions: list[str] | None = None

    submission_id:        int | None = None
    submitted_at:         datetime | None = None
    submission_file_name: str | None = None
    grade_status:         str | None = None
    marks_awarded:        int | None = None
    feedback:             str | None = None