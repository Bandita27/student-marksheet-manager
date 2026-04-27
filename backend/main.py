from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.routes import admin_router, auth_router, professor_router

from app.cors.database import Base, engine,get_db
from app.routes import  student_router
app = FastAPI()




Base.metadata.create_all(bind=engine)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Register routers
app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(professor_router.router)
app.include_router(student_router.router)


@app.get("/")
def root():
    return {
        "message": "server is running",
      
    }


