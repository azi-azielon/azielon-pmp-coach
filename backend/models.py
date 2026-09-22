from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float, UniqueConstraint
from sqlalchemy.orm import relationship
from .db import Base

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)
    password_hash = Column(String(512), nullable=False)
    role = Column(String(32), default='learner', nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class PasswordResetToken(Base):
    __tablename__ = 'password_reset_tokens'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True, nullable=False)
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    request_ip = Column(String(128))
    user = relationship('User')

class Question(Base):
    __tablename__ = 'questions'
    id = Column(String(64), primary_key=True)
    stem = Column(Text, nullable=False)
    options_json = Column(Text, nullable=False)
    answer_json = Column(Text, nullable=False)
    explanation_json = Column(Text, nullable=False)
    type = Column(String(32), default='single')
    domain = Column(String(64), index=True)
    eco_task = Column(String(64), index=True)
    eco_enabler = Column(String(255))
    delivery_approach = Column(String(64), index=True)
    difficulty = Column(String(32), index=True)
    primary_concept = Column(String(255), index=True)
    curriculum_links_json = Column(Text, default='[]')
    visual_json = Column(Text, default='null')
    review_status = Column(String(64), default='Instructor Approved')
    lifecycle_state = Column(String(64), default='Published')
    instructor_approved = Column(Boolean, default=True)
    source_metadata_json = Column(Text, default='{}')
    version = Column(Integer, default=1)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class TopicNote(Base):
    __tablename__ = 'topic_notes'
    id = Column(String(64), primary_key=True)
    domain = Column(String(64), index=True)
    title = Column(String(255), index=True)
    body_json = Column(Text, nullable=False)

class Diagram(Base):
    __tablename__ = 'diagrams'
    id = Column(String(64), primary_key=True)
    domain = Column(String(64), index=True)
    title = Column(String(255), index=True)
    category = Column(String(128))
    image_file = Column(String(512), nullable=False)
    metadata_json = Column(Text, nullable=False)

class TrickyWord(Base):
    __tablename__ = 'tricky_words'
    id = Column(String(64), primary_key=True)
    left_term = Column(String(255), index=True)
    right_term = Column(String(255), index=True)
    tags_json = Column(Text, default='[]')
    body_json = Column(Text, nullable=False)

class PracticeSession(Base):
    __tablename__ = 'practice_sessions'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True, nullable=False)
    filters_json = Column(Text, default='{}')
    question_ids_json = Column(Text, default='[]')
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    user = relationship('User')

class Attempt(Base):
    __tablename__ = 'attempts'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True, nullable=False)
    session_id = Column(Integer, ForeignKey('practice_sessions.id'), index=True)
    question_id = Column(String(64), ForeignKey('questions.id'), index=True, nullable=False)
    selected_json = Column(Text, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    confidence = Column(Integer)
    elapsed_seconds = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    user = relationship('User')
    question = relationship('Question')

class Bookmark(Base):
    __tablename__ = 'bookmarks'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True, nullable=False)
    question_id = Column(String(64), ForeignKey('questions.id'), index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint('user_id','question_id', name='uq_bookmark_user_question'),)


class StudyItemState(Base):
    __tablename__ = 'study_item_states'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True, nullable=False)
    content_type = Column(String(32), index=True, nullable=False)
    content_id = Column(String(128), index=True, nullable=False)
    status = Column(String(32), default='not_started', index=True, nullable=False)
    review_count = Column(Integer, default=0, nullable=False)
    last_rating = Column(String(32))
    last_reviewed_at = Column(DateTime)
    next_due_at = Column(DateTime)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    __table_args__ = (UniqueConstraint('user_id','content_type','content_id', name='uq_study_state_user_item'),)

class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id = Column(Integer, primary_key=True)
    actor_user_id = Column(Integer, ForeignKey('users.id'), index=True)
    action = Column(String(128), nullable=False)
    entity_type = Column(String(64), nullable=False)
    entity_id = Column(String(128))
    before_json = Column(Text)
    after_json = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class BillingPlan(Base):
    __tablename__ = 'billing_plans'
    code = Column(String(64), primary_key=True)
    tier_code = Column(String(32), index=True, nullable=False)
    name = Column(String(255), nullable=False)
    cadence = Column(String(32), nullable=False)
    duration_days = Column(Integer, nullable=False)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(8), default='USD', nullable=False)
    features_json = Column(Text, default='[]')
    active = Column(Boolean, default=True, nullable=False)

class CheckoutOrder(Base):
    __tablename__ = 'checkout_orders'
    id = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True, nullable=False)
    plan_code = Column(String(64), ForeignKey('billing_plans.code'), index=True, nullable=False)
    provider = Column(String(32), index=True, nullable=False)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(8), default='USD', nullable=False)
    status = Column(String(32), index=True, default='created', nullable=False)
    provider_order_id = Column(String(255), index=True)
    provider_capture_id = Column(String(255), index=True)
    entitlement_granted = Column(Boolean, default=False, nullable=False)
    raw_json = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    paid_at = Column(DateTime)

class Entitlement(Base):
    __tablename__ = 'entitlements'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True, nullable=False)
    tier_code = Column(String(32), index=True, nullable=False)
    plan_code = Column(String(64), index=True, nullable=False)
    source_order_id = Column(String(64), ForeignKey('checkout_orders.id'), unique=True, nullable=False)
    provider = Column(String(32), nullable=False)
    status = Column(String(32), index=True, default='active', nullable=False)
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class PmpClassRegistrationLead(Base):
    __tablename__ = "pmp_class_registration_leads"
    id = Column(Integer, primary_key=True)
    name = Column(String(160), nullable=False)
    email = Column(String(320), nullable=False, index=True)
    preferred_date = Column(DateTime, nullable=False)
    source = Column(String(80), nullable=False, default="landing")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class PmpClassRegistrationPayment(Base):
    __tablename__ = "pmp_class_registration_payments"
    id = Column(Integer, primary_key=True)
    registration_id = Column(Integer, ForeignKey("pmp_class_registration_leads.id"), unique=True, index=True, nullable=False)
    status = Column(String(32), default="pending", nullable=False, index=True)
    paid_at = Column(DateTime)
    notification_sent_at = Column(DateTime)
    marked_by_user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)

class PaymentWebhookEvent(Base):
    __tablename__ = 'payment_webhook_events'
    id = Column(Integer, primary_key=True)
    provider = Column(String(32), index=True, nullable=False)
    event_id = Column(String(255), index=True, nullable=False)
    event_type = Column(String(128))
    payload_json = Column(Text)
    status = Column(String(32), default='received')
    received_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    processed_at = Column(DateTime)
    __table_args__ = (UniqueConstraint('provider','event_id', name='uq_payment_webhook_provider_event'),)

class ExamSession(Base):
    __tablename__ = 'exam_sessions'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True, nullable=False)
    exam_code = Column(String(32), index=True, nullable=False)
    mode = Column(String(32), default='real_mock', nullable=False)
    feedback_mode = Column(String(32), default='end', nullable=False)
    question_ids_json = Column(Text, default='[]', nullable=False)
    duration_seconds = Column(Integer, default=14400, nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    completed_at = Column(DateTime)
    status = Column(String(32), default='active', index=True, nullable=False)
    current_index = Column(Integer, default=0, nullable=False)
    marked_json = Column(Text, default='[]', nullable=False)
    rules_viewed_json = Column(Text, default='[]', nullable=False)
    break_seconds_used = Column(Integer, default=0, nullable=False)
    break_started_at = Column(DateTime)
    break_number = Column(Integer, default=0, nullable=False)
    user = relationship('User')

class ExamAttempt(Base):
    __tablename__ = 'exam_attempts'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), index=True, nullable=False)
    exam_session_id = Column(Integer, ForeignKey('exam_sessions.id'), index=True, nullable=False)
    question_id = Column(String(64), index=True, nullable=False)
    selected_json = Column(Text, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    elapsed_seconds = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    __table_args__ = (UniqueConstraint('exam_session_id','question_id', name='uq_exam_attempt_session_question'),)
