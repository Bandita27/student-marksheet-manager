from sqlalchemy import Integer, String, Column, ForeignKey
from app.cors.database import Base


class Admin(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, nullable=False)
    department = Column(String, nullable=True)  
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)