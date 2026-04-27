from pydantic import BaseModel, EmailStr


class ProfessorCreate(BaseModel):
    name: str
    email: EmailStr
    password: str
    department: str | None = None


class ProfessorResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    role: str
    department: str | None = None

    class Config:
        from_attributes = True