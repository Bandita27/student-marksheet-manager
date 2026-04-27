from sqlalchemy import Integer, String, Column, ForeignKey
from sqlalchemy.orm import relationship
from app.cors.database import Base
from app.models import admin_model, mark_model

class Mark(Base):
    __tablename__ = "marks"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    subject = Column(String, nullable=False)
    marks_obtained = Column(Integer, nullable=False)
    recorded_by = Column(Integer, ForeignKey("users.id"), nullable=False)