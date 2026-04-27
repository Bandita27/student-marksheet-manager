from pydantic import BaseModel, EmailStr


class StudentInfo(BaseModel):
    id: int
    name: str
    email: EmailStr


class MarkEntry(BaseModel):
    subject: str
    marks_obtained: int


class MarksheetResponse(BaseModel):
    student: StudentInfo
    marks: list[MarkEntry]
    total: int
    max_total: int