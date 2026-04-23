from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class DocumentResponse(BaseModel):
    doc_id: str
    filename: str
    chunk_count: int


class SessionStartRequest(BaseModel):
    doc_id: str
    query: str = "main topics concepts overview summary"


class SessionStartResponse(BaseModel):
    ephemeral_token: str
    session_id: str
    model: str
    student_name: str


class NotesMessage(BaseModel):
    role: str  # "student" | "tutor"
    text: str


class NotesRequest(BaseModel):
    messages: list[NotesMessage]
    doc_filename: str = ""


class NotesResponse(BaseModel):
    markdown: str
