from pydantic import BaseModel, Field


class MarkCreate(BaseModel):
    student_id: int
    subject: str
    marks_obtained: int = Field(ge=0, le=100)


class MarkUpdate(BaseModel):
    subject: str | None = None
    marks_obtained: int | None = Field(default=None, ge=0, le=100)


class MarkResponse(BaseModel):
    id: int
    student_id: int
    subject: str
    marks_obtained: int
    recorded_by: int

    class Config:
        from_attributes = True

