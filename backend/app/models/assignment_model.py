from datetime import datetime
from sqlalchemy import (
    Integer, String, Text, DateTime, Column, ForeignKey, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.cors.database import Base


class Assignment(Base):
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    professor_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    subject = Column(String, nullable=False)
    due_date = Column(DateTime, nullable=False)
    max_marks = Column(Integer, nullable=False, default=100)
    allowed_extensions = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    submissions = relationship(
        "Submission",
        back_populates="assignment",
        cascade="all, delete-orphan",
    )


class Submission(Base):
    __tablename__ = "submissions"
    __table_args__ = (
        UniqueConstraint("assignment_id", "student_id", name="uq_assignment_student"),
    )

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id", ondelete="CASCADE"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String, nullable=False)
    file_name = Column(String, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    marks_awarded = Column(Integer, nullable=True)
    feedback = Column(Text, nullable=True)
    graded_at = Column(DateTime, nullable=True)

    assignment = relationship("Assignment", back_populates="submissions")