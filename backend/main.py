from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import admin_router, auth_router, professor_router, assignment_router, student_router
from app.cors.database import Base, engine
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
import os

load_dotenv()

key = os.getenv("GEMINI_API_KEY", "NOT FOUND")
print("[DEBUG] key starts with: '" + key[:8] + "' len=" + str(len(key)))

app = FastAPI()

Base.metadata.create_all(bind=engine)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(professor_router.router)
app.include_router(student_router.router)
app.include_router(assignment_router.router)


@app.get("/")
def root():
    return {"message": "server is running"}