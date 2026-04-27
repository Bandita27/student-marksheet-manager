from pydantic import BaseModel

class ProfessorCreate(BaseModel):
    email: str
    password: str
    name: str

class ProfessorResponse(BaseModel):
    id: str
    email: str
    name: str

    class Config:
        orm_mode = True