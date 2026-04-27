import os
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import jwt, JWTError
from dotenv import load_dotenv
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.cors.database import Base
from app.cors.database import get_db
from app.schemas.auth_schemas import LoginRequest, LoginResponse
from app.models import admin_model

from app.controllers import admin_controller, professor_controller

load_dotenv()

# ---------- Config ----------
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-env")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


# ---------- Password helpers ----------
def get_password(password: str) -> str:
    truncate_password = password[:71]
    return pwd_context.hash(truncate_password)


def password_verify(hash_password: str, plain_password: str) -> bool:
    input = plain_password[:71]
    return pwd_context.verify(input, hash_password)


# ---------- JWT helpers ----------
def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ---------- Dependency ----------
def get_current_admin(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials   # extract the actual JWT string
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    admin_id = payload.get("sub")
    role = payload.get("role")

    if admin_id is None or role != "admin":
        raise credentials_exception

    admin = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == int(admin_id),
        admin_model.Admin.role == "admin",
    ).first()

    if admin is None:
        raise credentials_exception

    return admin

# ---------- Login logic ----------
def login_admin(db: Session, credentials: LoginRequest) -> LoginResponse:
    return login_user(db, credentials, "admin")

# ---------- list of professor----------

def get_current_professor(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id = payload.get("sub")
    role = payload.get("role")

    if user_id is None or role != "professor":
        raise credentials_exception

    professor = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == int(user_id),
        admin_model.Admin.role == "professor",
    ).first()

    if professor is None:
        raise credentials_exception

    return professor

def login_user(db: Session, credentials: LoginRequest, expected_role: str) -> LoginResponse:
    user = db.query(admin_model.Admin).filter(
        admin_model.Admin.email == credentials.email,
        admin_model.Admin.role == expected_role,
    ).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not password_verify(str(user.password), credentials.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({
        "sub": str(user.id),
        "email": str(user.email),
        "role": expected_role,
    })

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        role=expected_role,
        name=str(user.name),
    )

def get_current_student(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    user_id = payload.get("sub")
    role = payload.get("role")

    if user_id is None or role != "student":
        raise credentials_exception

    student = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == int(user_id),
        admin_model.Admin.role == "student",
    ).first()

    if student is None:
        raise credentials_exception

    return student

# ---------- Manage Professors (admin-only) ----------

from app.schemas.professor_schemas import ProfessorCreate


def add_professor(db: Session, payload: ProfessorCreate):
    existing = db.query(admin_model.Admin).filter(
        admin_model.Admin.email == payload.email
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="email is already registered")

    new_professor = admin_model.Admin(
        name=payload.name,
        email=payload.email,
        password=get_password(payload.password),
        role="professor",
        department=payload.department,
    )
    try:
        db.add(new_professor)
        db.commit()
        db.refresh(new_professor)
        return new_professor
    except Exception as e:
        db.rollback()
        print(f"Error:{e}")
        raise HTTPException(status_code=500, detail="Failed to add professor")


def list_professors(db: Session):
    return db.query(admin_model.Admin).filter(
        admin_model.Admin.role == "professor"
    ).order_by(admin_model.Admin.id).all()


def remove_professor(db: Session, professor_id: int):
    professor = db.query(admin_model.Admin).filter(
        admin_model.Admin.id == professor_id,
        admin_model.Admin.role == "professor",
    ).first()

    if not professor:
        raise HTTPException(status_code=404, detail="Professor not found")

    try:
        db.delete(professor)
        db.commit()
        return {"message": f"Professor with id {professor_id} removed"}
    except Exception as e:
        db.rollback()
        print(f"Error:{e}")
        raise HTTPException(status_code=500, detail="Failed to remove professor")
    
def login_any_user(db: Session, credentials: LoginRequest) -> LoginResponse:
    user = db.query(admin_model.Admin).filter(
        admin_model.Admin.email == credentials.email,
    ).first()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not password_verify(str(user.password), credentials.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    role = str(user.role)

    token = create_access_token({
        "sub": str(user.id),
        "email": str(user.email),
        "role": role,
    })

    return LoginResponse(
        access_token=token,
        token_type="bearer",
        role=role,
        name=str(user.name),
    )