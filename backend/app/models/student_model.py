from sqlalchemy import Column, Integer, String
from app.cors.database import Base

class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    email = Column(String, unique=True, index=True)
    password = Column(String)  # This will store the HASHED password
    roll_number = Column(String, unique=True)