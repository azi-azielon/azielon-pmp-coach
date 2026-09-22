from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field

class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordIn(BaseModel):
    email: EmailStr

class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=20, max_length=500)
    new_password: str = Field(min_length=8, max_length=200)

class PracticeCreateIn(BaseModel):
    count: int = Field(default=5, ge=1, le=180)
    domain: Optional[str] = None
    delivery_approach: Optional[str] = None
    question_type: Optional[str] = None
    difficulty: Optional[str] = None
    diagram_only: bool = False
    previously_missed: bool = False
    bookmarked_only: bool = False
    review_focus: Optional[str] = None
    feedback_mode: str = 'immediate'
    question_id: Optional[str] = None
    timer_minutes: Optional[int] = Field(default=None, ge=1, le=240)

class AttemptIn(BaseModel):
    session_id: Optional[int] = None
    question_id: str
    selected_option_ids: List[str] = []
    matching_pairs: Optional[Any] = None
    numeric_value: Optional[float] = None
    confidence: Optional[int] = Field(default=None, ge=1, le=5)
    elapsed_seconds: Optional[float] = Field(default=None, ge=0)

class QuestionCreateIn(BaseModel):
    id: str
    stem: str
    type: str = 'single'
    options: Any = []
    answer: Any = {}
    explanation: Any = {}
    domain: Optional[str] = None
    eco_task: Optional[str] = None
    eco_enabler: Optional[str] = None
    delivery_approach: Optional[str] = None
    difficulty: Optional[str] = None
    primary_concept: Optional[str] = None
    curriculum_links: Any = []
    visual: Optional[Any] = None
    left_items: Optional[Any] = None
    review_status: str = 'Draft'
    lifecycle_state: str = 'Draft'
    instructor_approved: bool = False

class QuestionPatchIn(BaseModel):
    stem: Optional[str] = None
    options: Optional[Any] = None
    answer: Optional[Any] = None
    explanation: Optional[Any] = None
    domain: Optional[str] = None
    eco_task: Optional[str] = None
    eco_enabler: Optional[str] = None
    delivery_approach: Optional[str] = None
    difficulty: Optional[str] = None
    primary_concept: Optional[str] = None
    curriculum_links: Optional[Any] = None
    visual: Optional[Any] = None
    left_items: Optional[Any] = None
    review_status: Optional[str] = None
    lifecycle_state: Optional[str] = None
    instructor_approved: Optional[bool] = None

class CheckoutIn(BaseModel):
    plan_code: str

class ContentCreateIn(BaseModel):
    id: str
    domain: Optional[str] = None
    title: str
    body: Any

class DiagramCreateIn(BaseModel):
    id: str
    domain: Optional[str] = None
    title: str
    category: Optional[str] = None
    image_file: str
    metadata: Any = {}

class TrickyCreateIn(BaseModel):
    id: str
    left: str
    right: str
    tags: Any = []
    body: Any = {}


class ExamStartIn(BaseModel):
    mode: str = 'real_mock'
    feedback_mode: str = 'end'

class ExamAttemptIn(BaseModel):
    question_id: str
    selected_option_ids: List[str] = []
    matching_pairs: Optional[Any] = None
    elapsed_seconds: Optional[float] = Field(default=None, ge=0)

class ExamMarkIn(BaseModel):
    question_id: str
    marked: bool = True
