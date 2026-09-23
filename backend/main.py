import os, json, random
from pathlib import Path
from datetime import datetime, timedelta, date
from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func
import httpx

from .db import Base, engine, get_db, SessionLocal
from .models import User, PasswordResetToken, Question, TopicNote, Diagram, TrickyWord, PracticeSession, Attempt, Bookmark, AuditLog, BillingPlan, CheckoutOrder, Entitlement, PaymentWebhookEvent, PmpClassRegistrationLead, PmpClassRegistrationPayment, ExamSession, ExamAttempt, StudyItemState
from .schemas import RegisterIn, LoginIn, ForgotPasswordIn, ResetPasswordIn, PracticeCreateIn, AttemptIn, QuestionPatchIn, QuestionCreateIn, ContentCreateIn, DiagramCreateIn, TrickyCreateIn, CheckoutIn, ExamStartIn, ExamAttemptIn, ExamMarkIn
from .security import hash_password, verify_password, create_token, current_user, require_roles, create_password_reset_token, hash_reset_token
from .seed import seed_all
from .billing import seed_billing_plans, catalog as billing_catalog, current_entitlement, entitlement_payload, stripe_checkout, confirm_stripe_session, process_stripe_webhook, paypal_create_order, paypal_capture_order, process_paypal_webhook, require_paid_access, payment_mode, test_checkout, require_feature, has_feature, access_payload

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / 'static'
PROTECTED_DIAGRAMS = ROOT / 'protected_assets' / 'diagrams'


def _password_reset_mode():
    return os.getenv('PASSWORD_RESET_MODE', 'test').strip().lower()

def _send_password_reset_email(to_email: str, reset_url: str):
    import smtplib
    from email.message import EmailMessage
    host = os.getenv('SMTP_HOST', '').strip()
    port = int(os.getenv('SMTP_PORT', '587'))
    username = os.getenv('SMTP_USERNAME', '').strip()
    password = os.getenv('SMTP_PASSWORD', '')
    sender = os.getenv('SMTP_FROM', username or 'no-reply@azielon.com').strip()
    use_tls = os.getenv('SMTP_USE_TLS', 'true').strip().lower() not in {'0','false','no'}
    if not host:
        raise RuntimeError('SMTP_HOST is not configured')
    msg = EmailMessage()
    msg['Subject'] = 'Reset your Azielon PMP Practice Coach password'
    msg['From'] = sender
    msg['To'] = to_email
    msg.set_content(
        'A password reset was requested for your Azielon PMP Practice Coach account.\n\n'
        f'Reset your password here:\n{reset_url}\n\n'
        'This link expires in 30 minutes. If you did not request this reset, you can ignore this email.'
    )
    with smtplib.SMTP(host, port, timeout=20) as server:
        if use_tls:
            server.starttls()
        if username:
            server.login(username, password)
        server.send_message(msg)



def _smtp_status():
    host=os.getenv('SMTP_HOST','').strip()
    username=os.getenv('SMTP_USERNAME','').strip()
    sender=os.getenv('SMTP_FROM', username or '').strip()
    return {
        'configured': bool(host and sender),
        'host_configured': bool(host),
        'username_configured': bool(username),
        'from_configured': bool(sender),
        'notify_email': os.getenv('PROGRAM_REGISTRATION_NOTIFY_EMAIL','azi@azielon.com').strip()
    }

def _send_registration_pending_email(registration):
    import smtplib
    from email.message import EmailMessage
    host=os.getenv('SMTP_HOST','').strip()
    port=int(os.getenv('SMTP_PORT','587'))
    username=os.getenv('SMTP_USERNAME','').strip()
    password=os.getenv('SMTP_PASSWORD','')
    sender=os.getenv('SMTP_FROM',username or 'no-reply@azielon.com').strip()
    recipient=os.getenv('PROGRAM_REGISTRATION_NOTIFY_EMAIL','azi@azielon.com').strip()
    use_tls=os.getenv('SMTP_USE_TLS','true').strip().lower() not in {'0','false','no'}
    if not host:
        raise RuntimeError('SMTP_HOST is not configured')
    dt=registration.preferred_date
    date_text=dt.strftime('%A, %B %d, %Y') if dt else 'Not selected'
    msg=EmailMessage()
    msg['Subject']=f'PMP Class Registration Started — {registration.name}'
    msg['From']=sender
    msg['To']=recipient
    msg.set_content(
        'A learner selected a PMP Online Class date and was sent to secure payment.\\n\\n'
        f'Learner: {registration.name}\\n'
        f'Email: {registration.email}\\n'
        f'Class start date: {date_text}\\n'
        'Schedule: Tuesday–Friday, 8:00 AM–5:00 PM ET\\n'
        'Program: PMP Certification Prep\\n'
        'Price: $999\\n'
        'Payment status: PENDING\\n'
        f'Registration ID: {registration.id}\\n\\n'
        'When Autobooks confirms payment, open Instructor Studio → Program Registrations and click Mark paid + email.'
    )
    with smtplib.SMTP(host,port,timeout=20) as server:
        if use_tls:
            server.starttls()
        if username:
            server.login(username,password)
        server.send_message(msg)

def _send_program_registration_email(registration, payment_status: str = 'paid'):
    import smtplib
    from email.message import EmailMessage
    host = os.getenv('SMTP_HOST', '').strip()
    port = int(os.getenv('SMTP_PORT', '587'))
    username = os.getenv('SMTP_USERNAME', '').strip()
    password = os.getenv('SMTP_PASSWORD', '')
    sender = os.getenv('SMTP_FROM', username or 'no-reply@azielon.com').strip()
    recipient = os.getenv('PROGRAM_REGISTRATION_NOTIFY_EMAIL', 'azi@azielon.com').strip()
    use_tls = os.getenv('SMTP_USE_TLS', 'true').strip().lower() not in {'0','false','no'}
    if not host:
        raise RuntimeError('SMTP_HOST is not configured')
    dt = registration.preferred_date
    date_text = dt.strftime('%A, %B %d, %Y') if dt else 'Not selected'
    msg = EmailMessage()
    msg['Subject'] = f'PMP Online Class Registration — {registration.name}'
    msg['From'] = sender
    msg['To'] = recipient
    msg.set_content(
        'A learner has registered for the Azielon PMP Certification Prep program.\n\n'
        f'Learner: {registration.name}\n'
        f'Email: {registration.email}\n'
        f'Preferred class date: {date_text}\n'
        'Schedule: Starts Tuesday; classes run Tuesday–Friday, 8:00 AM–5:00 PM ET\n'
        'Program length: 35 hours live online instruction\n'
        'Program price: $999\n'
        f'Payment status: {payment_status.upper()}\n'
        f'Registration ID: {registration.id}\n\n'
        'View the registration in Instructor Studio → Program Registrations.'
    )
    with smtplib.SMTP(host, port, timeout=20) as server:
        if use_tls:
            server.starttls()
        if username:
            server.login(username, password)
        server.send_message(msg)


def _send_program_registration_confirmation_to_learner(registration):
    import smtplib
    from email.message import EmailMessage
    host = os.getenv('SMTP_HOST', '').strip()
    port = int(os.getenv('SMTP_PORT', '587'))
    username = os.getenv('SMTP_USERNAME', '').strip()
    password = os.getenv('SMTP_PASSWORD', '')
    sender = os.getenv('SMTP_FROM', username or 'no-reply@azielon.com').strip()
    use_tls = os.getenv('SMTP_USE_TLS', 'true').strip().lower() not in {'0','false','no'}
    if not host:
        raise RuntimeError('SMTP_HOST is not configured')
    dt = registration.preferred_date
    date_text = dt.strftime('%A, %B %d, %Y') if dt else 'Not selected'
    msg = EmailMessage()
    msg['Subject'] = 'Azielon PMP Online Class — Registration Confirmed'
    msg['From'] = sender
    msg['To'] = registration.email
    msg.set_content(
        f'Hello {registration.name},\n\n'
        'Your payment has been confirmed and your Azielon PMP Certification Prep registration is complete.\n\n'
        f'Class start date: {date_text}\n'
        'Class schedule: Tuesday–Friday, 8:00 AM–5:00 PM ET\n'
        'Live instruction: 35 hours\n'
        'Program price: $999\n\n'
        'We will send your class access details separately.\n\n'
        'Azielon PMP Coach'
    )
    with smtplib.SMTP(host, port, timeout=20) as server:
        if use_tls:
            server.starttls()
        if username:
            server.login(username, password)
        server.send_message(msg)


def _load_source_question_map():
    try:
        src=json.loads((ROOT/'data'/'questions_source.json').read_text(encoding='utf-8'))
        return {q.get('id'):q for q in src.get('items',[]) if q.get('id')}
    except Exception:
        return {}
SOURCE_QUESTION_MAP=_load_source_question_map()

def _load_exam_content():
    try:
        return json.loads((ROOT/'data'/'exams_content.json').read_text(encoding='utf-8'))
    except Exception:
        return {'exams': [], 'questions': [], 'rules': []}
EXAM_CONTENT=_load_exam_content()
EXAM_DEFS={e['code']:e for e in EXAM_CONTENT.get('exams',[])}
EXAM_QUESTIONS={q['id']:q for q in EXAM_CONTENT.get('questions',[])}
EXAM_RULES={r['rule_id']:r for r in EXAM_CONTENT.get('rules',[])}
EXAM_QUESTION_IDS={}
for _q in EXAM_CONTENT.get('questions',[]):
    EXAM_QUESTION_IDS.setdefault(_q['exam_code'],[]).append(_q['id'])
for _code in EXAM_QUESTION_IDS:
    EXAM_QUESTION_IDS[_code].sort(key=lambda qid: EXAM_QUESTIONS[qid].get('index',0))

def _exam_question_payload(q, include_answer=False):
    p={k:q.get(k) for k in ('id','exam_code','index','domain','topic','approach','difficulty','type','stem','options','matching_left','matching_right','rule_id','block','block_title')}
    if include_answer:
        p['answer']=q.get('answer')
        p['explanation']=q.get('explanation')
    return p
app = FastAPI(title='Azielon PMP Practice Coach', version='4.2.1')
app.mount('/static', StaticFiles(directory=STATIC), name='static')

def _ensure_admin_from_env(db: Session):
    """Create or update the production admin account from Render env vars.

    This is intentionally idempotent so it is safe to run on every deploy.
    Keep ADMIN_PASSWORD only in Render Environment variables, never in GitHub.
    """
    email = os.getenv('ADMIN_EMAIL', '').strip().lower()
    password = os.getenv('ADMIN_PASSWORD', '')
    if not email or not password:
        print('[startup] ADMIN_EMAIL/ADMIN_PASSWORD not set; admin bootstrap skipped', flush=True)
        return

    user = db.query(User).filter(User.email == email).first()
    if user:
        user.role = 'admin'
        user.is_active = True
        user.password_hash = hash_password(password)
        print(f'[startup] Admin account updated: {email}', flush=True)
    else:
        user = User(
            email=email,
            name='Azielon Admin',
            password_hash=hash_password(password),
            role='admin',
            is_active=True,
        )
        db.add(user)
        print(f'[startup] Admin account created: {email}', flush=True)
    db.commit()


@app.on_event('startup')
def startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_all(db)
        seed_billing_plans(db)
        _ensure_admin_from_env(db)
    finally:
        db.close()

@app.get('/api/health')
def health(db: Session = Depends(get_db)):
    return {
        'ok': True,
        'questions': db.query(Question).count(),
        'notes': db.query(TopicNote).count(),
        'diagrams': db.query(Diagram).count(),
        'tricky_words': db.query(TrickyWord).count(),
    }


def _us_thanksgiving(year: int):
    # Fourth Thursday in November.
    d=date(year,11,1)
    offset=(3-d.weekday())%7
    return d+timedelta(days=offset+21)

def _week_monday(d: date):
    return d-timedelta(days=d.weekday())

def _blocked_class_tuesdays(year: int):
    thanksgiving=_us_thanksgiving(year)
    thanksgiving_tuesday=thanksgiving-timedelta(days=2)
    christmas=date(year,12,25)
    christmas_tuesday=_week_monday(christmas)+timedelta(days=1)
    return {thanksgiving_tuesday, christmas_tuesday}

@app.post('/api/public/pmp-class/register')
async def register_pmp_class_interest(request: Request, db: Session = Depends(get_db)):
    payload=await request.json()
    name=str(payload.get('name') or '').strip()
    email=str(payload.get('email') or '').strip().lower()
    raw_date=str(payload.get('preferred_date') or '').strip()
    if not name or not email or not raw_date:
        raise HTTPException(400,'Name, email, and preferred class date are required')
    if '@' not in email or '.' not in email.split('@')[-1]:
        raise HTTPException(400,'Enter a valid email address')
    try:
        chosen=date.fromisoformat(raw_date)
    except Exception:
        raise HTTPException(400,'Choose a valid class date')
    if chosen < date.today():
        raise HTTPException(400,'Choose a future class date')
    # Class cohorts always start on Tuesday and run Tuesday through Friday.
    if chosen.weekday() != 1:
        raise HTTPException(400,'PMP live classes can only start on Tuesday')
    if chosen in _blocked_class_tuesdays(chosen.year):
        raise HTTPException(400,'That Tuesday is unavailable because it falls in Thanksgiving or Christmas week')
    lead=PmpClassRegistrationLead(
        name=name,
        email=email,
        preferred_date=datetime.combine(chosen, datetime.min.time()),
        source='landing'
    )
    db.add(lead)
    db.flush()
    db.add(PmpClassRegistrationPayment(
        registration_id=lead.id,
        status='pending',
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    ))
    db.commit()
    db.refresh(lead)
    pending_email_sent=False
    pending_email_error=None
    try:
        _send_registration_pending_email(lead)
        pending_email_sent=True
    except Exception as exc:
        pending_email_error=str(exc)[:300]
    return {
        'ok':True,
        'registration_id':lead.id,
        'preferred_date':chosen.isoformat(),
        'payment_url':'https://app.autobooks.co/pay/azie',
        'pending_email_sent':pending_email_sent,
        'pending_email_error':pending_email_error,
        'smtp':_smtp_status()
    }

@app.post('/api/auth/register')
def register(data: RegisterIn, db: Session = Depends(get_db)):
    email = data.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, 'Email already registered')
    user = User(email=email, name=data.name.strip(), password_hash=hash_password(data.password), role='learner')
    db.add(user); db.commit(); db.refresh(user)
    return {'token': create_token(user), 'user': {'id': user.id, 'email': user.email, 'name': user.name, 'role': user.role}}

@app.post('/api/auth/login')
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email.lower().strip()).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, 'Invalid email or password')
    return {'token': create_token(user), 'user': {'id': user.id, 'email': user.email, 'name': user.name, 'role': user.role}}

@app.get('/api/me')
def me(user: User = Depends(current_user)):
    return {'id': user.id, 'email': user.email, 'name': user.name, 'role': user.role}


@app.post('/api/auth/forgot-password')
def forgot_password(data: ForgotPasswordIn, request: Request, db: Session = Depends(get_db)):
    # Generic response prevents account enumeration.
    response = {
        'ok': True,
        'message': 'If an account exists for that email, password-reset instructions are ready.'
    }
    email = data.email.lower().strip()
    user = db.query(User).filter(User.email == email, User.is_active == True).first()
    if not user:
        return response

    now = datetime.utcnow()
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None)
    ).update({'used_at': now}, synchronize_session=False)

    raw_token, token_hash = create_password_reset_token()
    row = PasswordResetToken(
        user_id=user.id, token_hash=token_hash,
        expires_at=now + timedelta(minutes=30),
        request_ip=(request.client.host if request.client else None)
    )
    db.add(row)
    db.commit()

    base = os.getenv('APP_BASE_URL', 'http://localhost:8000').rstrip('/')
    reset_url = f'{base}/?reset_token={raw_token}'
    mode = _password_reset_mode()
    if mode == 'test':
        response['test_reset_url'] = reset_url
        response['test_token'] = raw_token
    else:
        try:
            _send_password_reset_email(user.email, reset_url)
            print(f'[password-reset] Reset email sent to {user.email}', flush=True)
        except Exception as exc:
            # Keep the public response generic to prevent account enumeration,
            # but expose the real SMTP failure in Render logs for diagnosis.
            print(
                f'[password-reset] Email send FAILED for {user.email}: '
                f'{type(exc).__name__}: {exc}',
                flush=True,
            )
    return response

@app.post('/api/auth/reset-password')
def reset_password(data: ResetPasswordIn, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    token_hash = hash_reset_token(data.token)
    row = db.query(PasswordResetToken).filter(
        PasswordResetToken.token_hash == token_hash,
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.expires_at > now
    ).first()
    if not row:
        raise HTTPException(400, 'This reset link is invalid or has expired')
    user = db.get(User, row.user_id)
    if not user or not user.is_active:
        raise HTTPException(400, 'This reset link is invalid or has expired')
    user.password_hash = hash_password(data.new_password)
    row.used_at = now
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used_at.is_(None),
        PasswordResetToken.id != row.id
    ).update({'used_at': now}, synchronize_session=False)
    db.commit()
    return {'ok': True, 'message': 'Password updated. You can now sign in.'}

def question_payload(q: Question, include_answer=False):
    source = SOURCE_QUESTION_MAP.get(q.id, {})
    source_meta = json.loads(q.source_metadata_json or '{}')
    left_items = source_meta.get('leftItems') or source.get('leftItems') or []
    payload = {
        'id': q.id, 'stem': q.stem, 'options': json.loads(q.options_json), 'type': q.type,
        'domain': q.domain, 'eco_task': q.eco_task, 'eco_enabler': q.eco_enabler,
        'delivery_approach': q.delivery_approach, 'difficulty': q.difficulty,
        'primary_concept': q.primary_concept, 'curriculum_links': json.loads(q.curriculum_links_json or '[]'),
        'visual': json.loads(q.visual_json or 'null'), 'left_items': left_items,
        'review_status': q.review_status, 'lifecycle_state': q.lifecycle_state,
        'instructor_approved': q.instructor_approved, 'version': q.version,
    }
    if include_answer:
        payload['answer'] = json.loads(q.answer_json)
        payload['explanation'] = json.loads(q.explanation_json)
        payload['source_metadata'] = source_meta
    return payload


def _public_trial_items(db: Session):
    """Return a small, fixed authenticated starter set without exposing the paid bank."""
    base = db.query(Question).filter(
        Question.instructor_approved == True,
        Question.lifecycle_state.in_(['Published','published','Instructor-Approved','Instructor Approved','instructor_approved']),
        Question.type.in_(['single','single_select','single-answer','single_answer']),
        Question.visual_json.in_(['null','',None])
    ).order_by(Question.id.asc()).all()
    if not base:
        return []
    # Prefer domain variety, then fill to five.
    chosen=[]; seen=set()
    for domain in ['People','Process','Business Environment']:
        q=next((x for x in base if x.domain==domain and x.id not in seen),None)
        if q:
            chosen.append(q); seen.add(q.id)
    for q in base:
        if len(chosen)>=5: break
        if q.id not in seen:
            chosen.append(q); seen.add(q.id)
    return chosen[:5]

@app.get('/api/public/trial/question/{index}')
def public_trial_question(index: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    items=_public_trial_items(db)
    if len(items)<5:
        raise HTTPException(503,'Free preview is not available yet')
    if index<0 or index>=5:
        raise HTTPException(404,'Preview question not found')
    q=items[index]
    return {'index':index,'total':5,'question':question_payload(q, include_answer=False)}

@app.post('/api/public/trial/answer')
async def public_trial_answer(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    body=await request.json()
    qid=str(body.get('question_id') or '')
    selected=body.get('selected_option_ids') or []
    items=_public_trial_items(db)
    allowed={q.id:q for q in items}
    q=allowed.get(qid)
    if not q:
        raise HTTPException(403,'That item is not part of the free preview')
    answer=json.loads(q.answer_json or '{}')
    correct=set(answer.get('correctOptionIds',[]))
    is_correct=set(selected)==correct
    return {
        'is_correct':is_correct,
        'correct_option_ids':list(correct),
        'explanation':json.loads(q.explanation_json or '{}'),
    }


def _practice_review_sets(user_id: int, db: Session):
    attempts=db.query(Attempt).filter(Attempt.user_id==user_id).order_by(Attempt.id.desc()).all()
    latest={}
    ever_missed=set()
    for a in attempts:
        if not a.is_correct: ever_missed.add(a.question_id)
        if a.question_id not in latest: latest[a.question_id]=a
    incorrect_now={qid for qid,a in latest.items() if not a.is_correct}
    last_session_id=next((a.session_id for a in attempts if a.session_id is not None),None)
    last_session_incorrect=set()
    if last_session_id is not None:
        last_session_incorrect={qid for (qid,) in db.query(Attempt.question_id).filter(Attempt.user_id==user_id,Attempt.session_id==last_session_id,Attempt.is_correct==False).distinct().all()}
    bookmarked={qid for (qid,) in db.query(Bookmark.question_id).filter(Bookmark.user_id==user_id).all()}
    return {'incorrect_now':incorrect_now,'last_session_incorrect':last_session_incorrect,'ever_missed':ever_missed,'bookmarked':bookmarked,'last_session_id':last_session_id}

@app.get('/api/practice/availability')
def practice_availability(domain: str|None=None,delivery_approach: str|None=None,question_type: str|None=None,diagram_only: bool=False,review_focus: str|None=None,previously_missed: bool=False,bookmarked_only: bool=False,user: User = Depends(current_user),db: Session = Depends(get_db)):
    require_feature(user, db, 'practice', 'Your plan does not include practice access')
    rows=db.query(Question).filter(Question.lifecycle_state.in_(['Published','published','Instructor-Approved','Instructor Approved','instructor_approved']),Question.instructor_approved==True).all()
    def is_visual(item):
        raw=item.visual_json
        if raw is None:return False
        return str(raw).strip().lower() not in {'','null','none','{}','[]'}
    visual_enabled=has_feature(user,db,'visual_questions')
    if not visual_enabled: rows=[r for r in rows if not is_visual(r)]
    sets=_practice_review_sets(user.id,db)
    focus=(review_focus or '').strip().lower()
    if not focus and previously_missed: focus='ever_missed'
    if not focus and bookmarked_only: focus='bookmarked'
    if focus not in {'','incorrect_now','last_session_incorrect','ever_missed','bookmarked'}: focus=''
    selected={'domain':domain or None,'delivery_approach':delivery_approach or None,'question_type':question_type or None,'diagram_only':bool(diagram_only),'review_focus':focus}
    def matches(item,ignore=frozenset()):
        if 'domain' not in ignore and selected['domain'] and item.domain!=selected['domain']:return False
        if 'delivery_approach' not in ignore and selected['delivery_approach'] and item.delivery_approach!=selected['delivery_approach']:return False
        if 'question_type' not in ignore and selected['question_type'] and item.type!=selected['question_type']:return False
        if 'diagram_only' not in ignore and selected['diagram_only'] and not is_visual(item):return False
        if 'review_focus' not in ignore and selected['review_focus'] and item.id not in sets[selected['review_focus']]:return False
        return True
    def facet(attr,key):
        out={}
        for item in rows:
            if matches(item,{key}):
                value=getattr(item,attr,None) or 'Unspecified'; out[value]=out.get(value,0)+1
        return out
    total=sum(1 for item in rows if matches(item))
    visual_count=sum(1 for item in rows if matches(item,{'diagram_only'}) and is_visual(item)) if visual_enabled else 0
    focus_counts={k:sum(1 for item in rows if matches(item,{'review_focus'}) and item.id in sets[k]) for k in ('incorrect_now','last_session_incorrect','ever_missed','bookmarked')}
    return {'total':total,'base_total':len(rows),'by_type':facet('type','question_type'),'by_domain':facet('domain','domain'),'by_approach':facet('delivery_approach','delivery_approach'),'visual_questions_enabled':visual_enabled,'visual_count':visual_count,'review_focus_counts':focus_counts,'missed_count':focus_counts['ever_missed'],'bookmarked_count':focus_counts['bookmarked'],'selected':selected}

@app.post('/api/practice/sessions')
def create_practice(data: PracticeCreateIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_feature(user, db, 'practice', 'Your plan does not include practice access')
    _guard_no_active_real_mock(user, db)
    feedback_mode = (data.feedback_mode or 'immediate').strip().lower()
    if feedback_mode not in {'immediate', 'end'}:
        raise HTTPException(400, 'feedback_mode must be immediate or end')
    query = db.query(Question).filter(Question.lifecycle_state.in_(['Published','published','Instructor-Approved','Instructor Approved','instructor_approved']), Question.instructor_approved == True)
    if not has_feature(user, db, 'visual_questions'):
        query = query.filter(Question.visual_json.in_(['null','',None]))
    if data.question_id:
        query = query.filter(Question.id == data.question_id)
    if data.domain: query = query.filter(Question.domain == data.domain)
    if data.delivery_approach: query = query.filter(Question.delivery_approach == data.delivery_approach)
    if data.question_type: query = query.filter(Question.type == data.question_type)
    if data.difficulty: query = query.filter(Question.difficulty == data.difficulty)
    if data.diagram_only:
        require_feature(user, db, 'visual_questions', 'Visual questions are available with Premium / Full Access')
        query = query.filter(Question.visual_json != 'null')
    review_sets=_practice_review_sets(user.id,db)
    focus=(data.review_focus or '').strip().lower()
    if not focus and data.previously_missed: focus='ever_missed'
    if not focus and data.bookmarked_only: focus='bookmarked'
    if focus:
        labels={'incorrect_now':'incorrect questions','last_session_incorrect':'incorrect questions from your last session','ever_missed':'previously missed questions','bookmarked':'bookmarked questions'}
        if focus not in labels: raise HTTPException(400,'Unknown review focus')
        ids=review_sets[focus]
        if not ids: raise HTTPException(404,f'No {labels[focus]} are available yet')
        query=query.filter(Question.id.in_(ids))
    items = query.all()
    if not items:
        raise HTTPException(404, 'No verified questions match those filters')
    if not data.question_id:
        random.shuffle(items)
    chosen = items[:data.count]
    filters = data.model_dump()
    filters['feedback_mode'] = feedback_mode
    session = PracticeSession(user_id=user.id, filters_json=json.dumps(filters), question_ids_json=json.dumps([q.id for q in chosen]))
    db.add(session); db.commit(); db.refresh(session)
    # Deliberately return only one question. Future items are fetched sequentially,
    # which avoids sending an entire practice set to the browser at once.
    return {
        'session_id': session.id,
        'total': len(chosen),
        'feedback_mode': feedback_mode,
        'timer_minutes': data.timer_minutes,
        'started_at': session.started_at.isoformat(),
        'question': question_payload(chosen[0], include_answer=False),
        'current_index': 0,
    }

def _practice_time_state(session):
    filters=json.loads(session.filters_json or '{}')
    mins=filters.get('timer_minutes')
    if not mins:
        return {'timed':False,'expired':False,'remaining_seconds':None}
    duration=int(mins)*60
    elapsed=max(0,int((datetime.utcnow()-session.started_at).total_seconds()))
    remaining=max(0,duration-elapsed)
    expired=remaining<=0
    if expired and not session.completed_at:
        session.completed_at=datetime.utcnow()
    return {'timed':True,'expired':expired,'remaining_seconds':remaining}

def _owned_practice_session(session_id: int, user: User, db: Session):
    session = db.get(PracticeSession, session_id)
    if not session or session.user_id != user.id:
        raise HTTPException(404, 'Practice session not found')
    return session

@app.get('/api/practice/sessions/{session_id}/questions/{index}')
def practice_question(session_id: int, index: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_paid_access(user, db)
    session = _owned_practice_session(session_id, user, db)
    ts=_practice_time_state(session)
    if ts['expired']:
        db.commit()
        raise HTTPException(409, 'Practice timer expired')
    ids = json.loads(session.question_ids_json or '[]')
    if index < 0 or index >= len(ids):
        raise HTTPException(404, 'Question index is outside this session')
    # Enforce sequential viewing: a learner cannot request later questions until
    # every prior question has been submitted.
    prior = ids[:index]
    if prior:
        attempted = {qid for (qid,) in db.query(Attempt.question_id).filter(
            Attempt.user_id == user.id,
            Attempt.session_id == session.id,
            Attempt.question_id.in_(prior)
        ).distinct().all()}
        if any(qid not in attempted for qid in prior):
            raise HTTPException(403, 'Submit the current question before continuing')
    q = db.get(Question, ids[index])
    if not q: raise HTTPException(404, 'Question not found')
    return {'session_id': session.id, 'total': len(ids), 'current_index': index, 'question': question_payload(q, include_answer=False)}

@app.post('/api/practice/attempts')
def submit_attempt(data: AttemptIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_paid_access(user, db)
    if not data.session_id:
        raise HTTPException(400, 'A practice session is required')
    session = _owned_practice_session(data.session_id, user, db)
    ts=_practice_time_state(session)
    if ts['expired']:
        db.commit()
        raise HTTPException(409, 'Practice timer expired')
    ids = json.loads(session.question_ids_json or '[]')
    if data.question_id not in ids:
        raise HTTPException(403, 'Question does not belong to this practice session')
    existing = db.query(Attempt).filter(Attempt.user_id == user.id, Attempt.session_id == session.id, Attempt.question_id == data.question_id).first()
    if existing:
        raise HTTPException(409, 'This question has already been submitted in this session')
    q = db.get(Question, data.question_id)
    if not q: raise HTTPException(404, 'Question not found')
    answer = json.loads(q.answer_json or '{}')
    response_payload = {'selected_option_ids': data.selected_option_ids, 'matching_pairs': data.matching_pairs, 'numeric_value': data.numeric_value}
    result_extra = {}
    if q.type == 'matching':
        expected = {p.get('leftId'):p.get('rightId') for p in answer.get('pairs', [])}
        submitted = data.matching_pairs or {}
        if isinstance(submitted, list): submitted = {p.get('leftId'):p.get('rightId') for p in submitted}
        is_correct = bool(expected) and submitted == expected
        result_extra['correct_pairs'] = expected
    elif q.type == 'numeric':
        expected = answer.get('value')
        tol = answer.get('absoluteTolerance', 0)
        try: is_correct = expected is not None and data.numeric_value is not None and abs(float(data.numeric_value)-float(expected)) <= float(tol or 0)
        except Exception: is_correct = False
        result_extra['correct_numeric_value'] = expected
        result_extra['numeric_unit'] = answer.get('unit')
    else:
        correct = set(answer.get('correctOptionIds', []))
        selected = set(data.selected_option_ids)
        is_correct = selected == correct
        result_extra['correct_option_ids'] = list(correct)
    att = Attempt(user_id=user.id, session_id=session.id, question_id=q.id,
                  selected_json=json.dumps(response_payload), is_correct=is_correct,
                  confidence=data.confidence, elapsed_seconds=data.elapsed_seconds)
    db.add(att); db.flush()
    answered_count = db.query(Attempt).filter(Attempt.user_id == user.id, Attempt.session_id == session.id).count()
    session_complete = answered_count >= len(ids)
    if session_complete and not session.completed_at:
        session.completed_at = datetime.utcnow()
    db.commit()
    filters = json.loads(session.filters_json or '{}')
    feedback_mode = (filters.get('feedback_mode') or 'immediate').lower()
    if feedback_mode == 'end':
        # Do not return correctness, keys, or explanations until the entire
        # session has been submitted.
        return {'recorded': True, 'session_complete': session_complete, 'answered_count': answered_count, 'total': len(ids), 'feedback_mode': 'end'}
    return {'recorded': True, 'session_complete': session_complete, 'answered_count': answered_count, 'total': len(ids), 'feedback_mode': 'immediate', 'is_correct': is_correct, 'explanation': json.loads(q.explanation_json or '{}'), **result_extra}

@app.post('/api/practice/sessions/{session_id}/end')
def end_practice_session(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_paid_access(user, db)
    session=_owned_practice_session(session_id,user,db)
    session.completed_at=session.completed_at or datetime.utcnow()
    db.commit()
    return {'ended':True}

@app.get('/api/practice/sessions/{session_id}/results')
def practice_results(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_paid_access(user, db)
    session = _owned_practice_session(session_id, user, db)
    ids = json.loads(session.question_ids_json or '[]')
    attempts = db.query(Attempt).filter(Attempt.user_id == user.id, Attempt.session_id == session.id).all()
    by_q = {a.question_id: a for a in attempts}
    ts=_practice_time_state(session)
    complete=all(qid in by_q for qid in ids)
    if not complete and not ts['expired'] and not session.completed_at:
        raise HTTPException(403, 'Answers are available after all questions are submitted or the session ends')
    results = []
    for qid in ids:
        q = db.get(Question, qid)
        a = by_q.get(qid)
        results.append({
            'question': question_payload(q, include_answer=False),
            'selected': json.loads(a.selected_json or '{}') if a else None,
            'is_correct': bool(a.is_correct) if a else False,
            'unanswered': a is None,
            'answer': json.loads(q.answer_json or '{}'),
            'explanation': json.loads(q.explanation_json or '{}'),
        })
    correct = sum(1 for r in results if r['is_correct'])
    return {'session_id': session.id, 'total': len(results), 'answered':len(attempts), 'correct': correct, 'accuracy': round(correct/len(results)*100, 1) if results else None, 'expired':ts['expired'], 'results': results}

@app.post('/api/bookmarks/{question_id}')
def toggle_bookmark(question_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_paid_access(user, db)
    existing = db.query(Bookmark).filter(Bookmark.user_id==user.id, Bookmark.question_id==question_id).first()
    if existing:
        db.delete(existing); db.commit(); return {'bookmarked': False}
    if not db.get(Question, question_id): raise HTTPException(404, 'Question not found')
    db.add(Bookmark(user_id=user.id, question_id=question_id)); db.commit(); return {'bookmarked': True}

@app.get('/api/bookmarks')
def bookmarks(user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_paid_access(user, db)
    ids=[qid for (qid,) in db.query(Bookmark.question_id).filter(Bookmark.user_id==user.id).all()]
    return {'question_ids': ids}

@app.get('/api/progress')
def progress(user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_paid_access(user, db)

    # Standard practice attempts.
    attempts = db.query(Attempt).filter(Attempt.user_id == user.id).all()
    practice_total=len(attempts)
    practice_correct=sum(1 for a in attempts if a.is_correct)
    practice_incorrect=practice_total-practice_correct
    practice_unique_attempted=len({a.question_id for a in attempts})
    practice_unique_missed=len({a.question_id for a in attempts if not a.is_correct})
    review_sets=_practice_review_sets(user.id,db)
    practice_currently_incorrect=len(review_sets['incorrect_now'])
    practice_last_session_incorrect=len(review_sets['last_session_incorrect'])

    bank_rows=db.query(Question).filter(
        Question.lifecycle_state.in_(['Published','published','Instructor-Approved','Instructor Approved','instructor_approved']),
        Question.instructor_approved == True
    ).all()
    def _progress_is_visual(item):
        raw=item.visual_json
        if raw is None: return False
        text=str(raw).strip().lower()
        return text not in {'','null','none','{}','[]'}
    if not has_feature(user,db,'visual_questions'):
        bank_rows=[r for r in bank_rows if not _progress_is_visual(r)]
    practice_bank_total=len(bank_rows)
    practice_coverage=round(practice_unique_attempted/practice_bank_total*100,1) if practice_bank_total else None

    domains={}
    def add_domain(domain: str, is_correct: bool):
        d=domain or 'Other'
        domains.setdefault(d, {'answered':0,'correct':0})
        domains[d]['answered'] += 1
        if is_correct:
            domains[d]['correct'] += 1

    for a in attempts:
        add_domain(a.question.domain if a.question else 'Other', bool(a.is_correct))

    # Submitted / auto-expired full and mastery exam attempts also count toward progress.
    completed_sessions = db.query(ExamSession).filter(
        ExamSession.user_id==user.id,
        ExamSession.status.in_(['submitted','expired'])
    ).order_by(ExamSession.completed_at.desc(), ExamSession.id.desc()).all()

    completed_ids=[s.id for s in completed_sessions]
    exam_attempts=[]
    if completed_ids:
        exam_attempts=db.query(ExamAttempt).filter(
            ExamAttempt.user_id==user.id,
            ExamAttempt.exam_session_id.in_(completed_ids)
        ).all()

    exam_total=len(exam_attempts)
    exam_correct=sum(1 for a in exam_attempts if a.is_correct)
    for a in exam_attempts:
        q=EXAM_QUESTIONS.get(a.question_id) or {}
        add_domain(q.get('domain') or 'Other', bool(a.is_correct))

    # Review Queue contains questions whose latest answer is still incorrect.
    incorrect_ids=review_sets['incorrect_now']
    missed=[]
    if incorrect_ids:
        missed=db.query(Attempt.question_id,func.count(Attempt.id)).filter(Attempt.user_id==user.id,Attempt.is_correct==False,Attempt.question_id.in_(incorrect_ids)).group_by(Attempt.question_id).order_by(func.count(Attempt.id).desc()).limit(10).all()

    exam_history=[]
    for s in completed_sessions[:10]:
        rows=[a for a in exam_attempts if a.exam_session_id==s.id]
        answered=len(rows); correct=sum(1 for a in rows if a.is_correct)
        try:
            edef=_exam_def(s.exam_code)
            exam_name=edef.get('name') or s.exam_code
        except Exception:
            exam_name=s.exam_code
        exam_history.append({
            'session_id':s.id,
            'exam_code':s.exam_code,
            'exam_name':exam_name,
            'mode':s.mode,
            'status':s.status,
            'answered':answered,
            'correct':correct,
            'total':len(json.loads(s.question_ids_json or '[]')),
            'accuracy':round(correct/answered*100,1) if answered else None,
            'started_at':s.started_at.isoformat() if s.started_at else None,
            'completed_at':s.completed_at.isoformat() if s.completed_at else None,
        })

    accessible=set(access_payload(user,db).get('features') or [])
    exam_cards=[]
    for e in EXAM_CONTENT.get('exams',[]):
        if e.get('code') not in accessible: continue
        sessions=db.query(ExamSession).filter(ExamSession.user_id==user.id,ExamSession.exam_code==e.get('code')).order_by(ExamSession.id.desc()).all()
        latest=sessions[0] if sessions else None
        completed=next((x for x in sessions if x.status in ('submitted','expired')),None)
        src=completed or latest
        answered=correct=0; total_q=180; accuracy=None
        if src:
            rows=db.query(ExamAttempt).filter(ExamAttempt.exam_session_id==src.id).all()
            answered=len(rows); correct=sum(1 for a in rows if a.is_correct)
            total_q=len(json.loads(src.question_ids_json or '[]')) or 180
            accuracy=round(correct/total_q*100,1) if src.status in ('submitted','expired') and total_q else None
        status=src.status if src else 'not_started'; result=None
        if src and src.status in ('submitted','expired') and accuracy is not None:
            result='PASS' if accuracy>=AZIELON_PASS_BENCHMARK else 'BELOW BENCHMARK'
        exam_cards.append({'exam_code':e.get('code'),'exam_name':e.get('name'),'kind':e.get('kind'),'status':status,
                           'session_id':src.id if src else None,'answered':answered,'correct':correct,'total':total_q,
                           'accuracy':accuracy,'result':result,'completed':bool(src and src.status in ('submitted','expired')),
                           'benchmark':AZIELON_PASS_BENCHMARK})

    total=practice_total+exam_total
    correct=practice_correct+exam_correct
    return {
        'answered': total,
        'correct': correct,
        'accuracy': round(correct/total*100,1) if total else None,
        'practice_answered': practice_total,
        'practice_correct': practice_correct,
        'practice_incorrect': practice_incorrect,
        'practice_unique_attempted': practice_unique_attempted,
        'practice_unique_missed': practice_unique_missed,
        'practice_currently_incorrect': practice_currently_incorrect,
        'practice_last_session_incorrect': practice_last_session_incorrect,
        'practice_bank_total': practice_bank_total,
        'practice_coverage': practice_coverage,
        'practice_accuracy': round(practice_correct/practice_total*100,1) if practice_total else None,
        'exam_answered': exam_total,
        'exam_correct': exam_correct,
        'completed_exams': len(completed_sessions),
        'bookmarks': db.query(Bookmark).filter(Bookmark.user_id==user.id).count(),
        'domains': domains,
        'exam_history': exam_history,
        'exam_cards': exam_cards,
        'benchmark': AZIELON_PASS_BENCHMARK,
        'benchmark_note':'Azielon practice benchmark only; PMI does not publish a fixed percentage passing score.',
        'review_queue': [{'question_id': qid, 'misses': count} for qid,count in missed],
        'study_summary': study_summary(user,db)
    }



def _concept_key(value: str):
    import re as _re
    return _re.sub(r'[^a-z0-9]+','-',(value or '').strip().lower()).strip('-')[:120] or 'general'

def _concept_review_payload(user: User, db: Session):
    """Build one deduplicated review card per concept across practice, exams, marks, and study content."""
    items={}
    def add(concept, source, *, domain=None, incorrect=0, marked=0, needs_review=0, ref_type=None, ref_id=None, exam_code=None, signal_at=None):
        concept=(concept or '').strip() or 'General PMP reasoning'
        key=_concept_key(concept)
        x=items.setdefault(key,{'concept_id':key,'concept':concept,'domain':domain,'incorrect_count':0,'marked_count':0,'needs_review_count':0,'sources':set(),'action_type':None,'action_id':None,'exam_code':None,'last_signal_at':None})
        x['incorrect_count']+=int(incorrect or 0); x['marked_count']+=int(marked or 0); x['needs_review_count']+=int(needs_review or 0)
        if source: x['sources'].add(source)
        if domain and not x.get('domain'): x['domain']=domain
        # Prefer direct study content, then targeted practice, then exam.
        priority={'note':4,'diagram':4,'tricky':4,'practice':3,'exam':2}.get(ref_type,0)
        existing={'note':4,'diagram':4,'tricky':4,'practice':3,'exam':2}.get(x.get('action_type'),0)
        if ref_type and priority>existing:
            x['action_type']=ref_type; x['action_id']=ref_id; x['exam_code']=exam_code
        if signal_at and (x['last_signal_at'] is None or signal_at>x['last_signal_at']): x['last_signal_at']=signal_at

    # Practice: only questions whose latest practice answer remains incorrect.
    review_sets=_practice_review_sets(user.id,db)
    incorrect_ids=review_sets.get('incorrect_now',set())
    if incorrect_ids:
        for q in db.query(Question).filter(Question.id.in_(incorrect_ids)).all():
            last=db.query(Attempt).filter(Attempt.user_id==user.id,Attempt.question_id==q.id).order_by(Attempt.created_at.desc(),Attempt.id.desc()).first()
            add(q.primary_concept or q.domain or 'Practice concept','Practice',domain=q.domain,incorrect=1,ref_type='practice',ref_id=q.id,signal_at=last.created_at if last else None)

    # Exams: aggregate incorrect answers and learner marks by concept, never duplicate cards.
    sessions=db.query(ExamSession).filter(ExamSession.user_id==user.id).order_by(ExamSession.id.desc()).all()
    for s in sessions:
        exam_name=EXAM_DEFS.get(s.exam_code,{}).get('name') or s.exam_code
        if s.status in ('submitted','expired'):
            for a in db.query(ExamAttempt).filter(ExamAttempt.exam_session_id==s.id,ExamAttempt.is_correct==False).all():
                q=EXAM_QUESTIONS.get(a.question_id) or {}
                add(q.get('topic') or q.get('domain') or 'Exam concept',exam_name,domain=q.get('domain'),incorrect=1,ref_type='exam',ref_id=a.question_id,exam_code=s.exam_code,signal_at=a.updated_at or a.created_at)
        try: marked=set(json.loads(s.marked_json or '[]'))
        except Exception: marked=set()
        for qid in marked:
            q=EXAM_QUESTIONS.get(qid) or {}
            add(q.get('topic') or q.get('domain') or 'Exam concept',exam_name,domain=q.get('domain'),marked=1,ref_type='exam',ref_id=qid,exam_code=s.exam_code,signal_at=s.updated_at or s.started_at)

    # Explicit Needs Review from learning content.
    needs=db.query(StudyItemState).filter(StudyItemState.user_id==user.id,StudyItemState.status=='needs_review').all()
    for st in needs:
        if st.content_type=='note':
            obj=db.get(TopicNote,st.content_id)
            if obj: add(obj.title,'Topic Notes',domain=obj.domain,needs_review=1,ref_type='note',ref_id=obj.id,signal_at=st.updated_at)
        elif st.content_type=='diagram':
            obj=db.get(Diagram,st.content_id)
            if obj: add(obj.title,'Diagrams',domain=obj.domain,needs_review=1,ref_type='diagram',ref_id=obj.id,signal_at=st.updated_at)
        elif st.content_type=='tricky':
            obj=db.get(TrickyWord,st.content_id)
            if obj: add(f'{obj.left_term} vs. {obj.right_term}','Tricky Words',needs_review=1,ref_type='tricky',ref_id=obj.id,signal_at=st.updated_at)

    # A concept can be marked reviewed once. It stays hidden until a newer signal occurs.
    concept_states={x.content_id:x for x in db.query(StudyItemState).filter(StudyItemState.user_id==user.id,StudyItemState.content_type=='concept').all()}
    rows=[]
    for key,x in items.items():
        st=concept_states.get(key)
        if st and st.status in {'reviewed','mastered'} and x.get('last_signal_at') and st.updated_at and st.updated_at>=x['last_signal_at']:
            continue
        x['sources']=sorted(x['sources'])
        x['reason_total']=x['incorrect_count']+x['marked_count']+x['needs_review_count']
        x['last_signal_at']=x['last_signal_at'].isoformat() if x.get('last_signal_at') else None
        rows.append(x)
    rows.sort(key=lambda x:(-x['incorrect_count'],-x['marked_count'],-x['needs_review_count'],x['concept'].lower()))
    return rows

@app.get('/api/review/concepts')
def concepts_to_review(user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_paid_access(user,db)
    rows=_concept_review_payload(user,db)
    return {'count':len(rows),'items':rows}

STUDY_STATUSES={'not_started','reviewed','needs_review','mastered'}

def _study_state_map(db: Session, user_id: int, content_type: str|None=None):
    q=db.query(StudyItemState).filter(StudyItemState.user_id==user_id)
    if content_type: q=q.filter(StudyItemState.content_type==content_type)
    return {(x.content_type,x.content_id):x for x in q.all()}

def _upsert_study_state(db: Session, user_id:int, content_type:str, content_id:str, status:str|None=None, rating:str|None=None):
    row=db.query(StudyItemState).filter(StudyItemState.user_id==user_id,StudyItemState.content_type==content_type,StudyItemState.content_id==content_id).first()
    if not row:
        row=StudyItemState(user_id=user_id,content_type=content_type,content_id=content_id,status='not_started')
        db.add(row)
    now=datetime.utcnow()
    if status:
        if status not in STUDY_STATUSES: raise HTTPException(400,'Invalid study status')
        row.status=status
    if rating:
        if rating not in {'again','hard','got_it'}: raise HTTPException(400,'Invalid flashcard rating')
        row.review_count=(row.review_count or 0)+1
        row.last_rating=rating
        row.last_reviewed_at=now
        if rating=='again':
            row.status='needs_review'; row.next_due_at=now+timedelta(minutes=10)
        elif rating=='hard':
            row.status='needs_review'; row.next_due_at=now+timedelta(days=1)
        else:
            row.status='mastered' if row.review_count>=3 else 'reviewed'; row.next_due_at=now+timedelta(days=4 if row.review_count<3 else 10)
    elif status in {'reviewed','needs_review','mastered'}:
        row.last_reviewed_at=now
    row.updated_at=now
    db.commit(); db.refresh(row)
    return row

def _state_payload(row):
    return {'content_type':row.content_type,'content_id':row.content_id,'status':row.status,'review_count':row.review_count or 0,'last_rating':row.last_rating,'last_reviewed_at':row.last_reviewed_at.isoformat() if row.last_reviewed_at else None,'next_due_at':row.next_due_at.isoformat() if row.next_due_at else None}

@app.get('/api/study/states')
def study_states(user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_paid_access(user,db)
    return [_state_payload(x) for x in db.query(StudyItemState).filter(StudyItemState.user_id==user.id).all()]

@app.put('/api/study/items/{content_type}/{content_id}')
def study_item_update(content_type:str,content_id:str,payload:dict,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db)
    if content_type not in {'note','diagram','tricky','rule','concept'}: raise HTTPException(400,'Invalid content type')
    row=_upsert_study_state(db,user.id,content_type,content_id,status=str(payload.get('status') or 'not_started'))
    return _state_payload(row)

@app.post('/api/study/flashcards/{content_id}/review')
def flashcard_review(content_id:str,payload:dict,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_feature(user,db,'tricky','Tricky Words are included with Concept + Exam or Premium')
    if not db.get(TrickyWord,content_id): raise HTTPException(404,'Flashcard not found')
    row=_upsert_study_state(db,user.id,'tricky',content_id,rating=str(payload.get('rating') or ''))
    return _state_payload(row)

@app.get('/api/study/summary')
def study_summary(user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db)
    states=_study_state_map(db,user.id)
    counts={}
    def count_group(kind,ids):
        vals=[states.get((kind,i)) for i in ids]
        c={'total':len(ids),'not_started':0,'reviewed':0,'needs_review':0,'mastered':0,'complete':0}
        for x in vals:
            st=x.status if x else 'not_started'; c[st]=c.get(st,0)+1
            if st in {'reviewed','mastered'}: c['complete']+=1
        c['pct']=round(c['complete']/c['total']*100) if c['total'] else 0
        return c
    counts['notes']=count_group('note',[x.id for x in db.query(TopicNote.id).all()]) if has_feature(user,db,'notes') else {'total':0,'complete':0,'pct':0}
    counts['diagrams']=count_group('diagram',[x.id for x in db.query(Diagram.id).all()]) if has_feature(user,db,'diagrams') else {'total':0,'complete':0,'pct':0}
    counts['tricky']=count_group('tricky',[x.id for x in db.query(TrickyWord.id).all()]) if has_feature(user,db,'tricky') else {'total':0,'complete':0,'pct':0}
    completed_exams=db.query(ExamSession).filter(ExamSession.user_id==user.id,ExamSession.status.in_(['submitted','expired'])).count()
    available_exams=len([e for e in EXAM_CONTENT.get('exams',[]) if has_feature(user,db,e.get('code',''))])
    counts['exams']={'total':available_exams,'complete':completed_exams,'pct':round(min(completed_exams,available_exams)/available_exams*100) if available_exams else 0}
    enabled=[v for k,v in counts.items() if v.get('total',0)>0]
    overall=round(sum(v['pct'] for v in enabled)/len(enabled)) if enabled else 0
    next_item=None
    if has_feature(user,db,'diagrams'):
        for d in db.query(Diagram).order_by(Diagram.domain,Diagram.id).all():
            st=states.get(('diagram',d.id))
            if not st or st.status in {'not_started','needs_review'}:
                next_item={'content_type':'diagram','content_id':d.id,'title':d.title,'status':st.status if st else 'not_started'}; break
    if not next_item and has_feature(user,db,'tricky'):
        for t in db.query(TrickyWord).order_by(TrickyWord.id).all():
            st=states.get(('tricky',t.id))
            if not st or st.status in {'not_started','needs_review'}:
                next_item={'content_type':'tricky','content_id':t.id,'title':f'{t.left_term} vs. {t.right_term}','status':st.status if st else 'not_started'}; break
    return {'overall_pct':overall,'groups':counts,'next_item':next_item}

@app.get('/api/notes')
def notes(domain: str|None=None, q: str|None=None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_feature(user, db, 'notes', 'Topic Notes are included with Concept + Exam or Premium')
    _guard_no_active_real_mock(user, db)
    query=db.query(TopicNote)
    if domain: query=query.filter(TopicNote.domain==domain)
    rows=query.order_by(TopicNote.domain, TopicNote.id).all()
    out=[]
    for n in rows:
        body=json.loads(n.body_json); body['studyStatus']=(_study_state_map(db,user.id,'note').get(('note',n.id)).status if _study_state_map(db,user.id,'note').get(('note',n.id)) else 'not_started')
        if q and q.lower() not in json.dumps(body).lower(): continue
        out.append(body)
    return out

@app.get('/api/diagrams')
def diagrams(domain: str|None=None, q: str|None=None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_feature(user, db, 'diagrams', 'Diagrams & Models are Premium-only')
    _guard_no_active_real_mock(user, db)
    query=db.query(Diagram)
    if domain: query=query.filter(Diagram.domain==domain)
    rows=query.order_by(Diagram.domain, Diagram.id).all()
    out=[]
    for d in rows:
        body=json.loads(d.metadata_json); body['imageFile']=d.image_file; _st=_study_state_map(db,user.id,'diagram').get(('diagram',d.id)); body['studyStatus']=_st.status if _st else 'not_started'
        if q and q.lower() not in json.dumps(body).lower(): continue
        out.append(body)
    return out

@app.get('/api/tricky-words')
def tricky_words(q: str|None=None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_feature(user, db, 'tricky', 'Tricky Words are included with Concept + Exam or Premium')
    _guard_no_active_real_mock(user, db)
    rows=db.query(TrickyWord).order_by(TrickyWord.id).all(); out=[]
    for t in rows:
        body=json.loads(t.body_json); _st=_study_state_map(db,user.id,'tricky').get(('tricky',t.id)); body['studyStatus']=_st.status if _st else 'not_started'; body['reviewCount']=_st.review_count if _st else 0; body['nextDueAt']=_st.next_due_at.isoformat() if _st and _st.next_due_at else None
        if q and q.lower() not in json.dumps(body).lower(): continue
        out.append(body)
    return out


@app.get('/api/billing/catalog')
def get_billing_catalog(db: Session = Depends(get_db)):
    return billing_catalog(db)

@app.get('/api/billing/me')
def billing_me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    e=current_entitlement(db,user.id)
    ep=entitlement_payload(e)
    if ep and e:
        plan=db.get(BillingPlan,e.plan_code)
        ep.update({
            'plan_name': plan.name if plan else e.plan_code,
            'cadence': plan.cadence if plan else None,
            'duration_days': plan.duration_days if plan else None,
            'amount_cents': plan.amount_cents if plan else None,
            'currency': plan.currency if plan else None,
        })
    return {'entitlement':ep,'has_access': bool(e) or user.role in ('admin','instructor','content_editor','reviewer'), **access_payload(user,db), 'payment_mode': payment_mode(), 'providers':{'stripe':bool(os.getenv('STRIPE_SECRET_KEY')),'paypal':bool(os.getenv('PAYPAL_CLIENT_ID') and os.getenv('PAYPAL_CLIENT_SECRET'))}}

@app.post('/api/billing/test/checkout')
def billing_test_checkout(payload: dict, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return test_checkout(db,user,str(payload.get('plan_code','')),str(payload.get('method','')),payload.get('details') or {})

@app.post('/api/billing/stripe/checkout-session')
def billing_stripe_checkout(data: CheckoutIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return stripe_checkout(db,user,data.plan_code)

@app.get('/api/billing/stripe/confirm')
def billing_stripe_confirm(session_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return confirm_stripe_session(db,user,session_id)

@app.post('/api/billing/stripe/webhook')
async def billing_stripe_webhook(request: Request, db: Session = Depends(get_db)):
    payload=await request.body()
    sig=request.headers.get('stripe-signature','')
    return process_stripe_webhook(db,payload,sig)

@app.post('/api/billing/paypal/orders')
async def billing_paypal_create(data: CheckoutIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return await paypal_create_order(db,user,data.plan_code)

@app.post('/api/billing/paypal/orders/{provider_order_id}/capture')
async def billing_paypal_capture(provider_order_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return await paypal_capture_order(db,user,provider_order_id)

@app.post('/api/billing/paypal/webhook')
async def billing_paypal_webhook(request: Request, db: Session = Depends(get_db)):
    body=await request.json()
    return await process_paypal_webhook(db,request,body)

@app.get('/api/assets/diagrams/{filename}')
def protected_diagram(filename: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_feature(user, db, 'diagrams', 'Images and diagrams are Premium-only')
    _guard_no_active_real_mock(user, db)
    safe=Path(filename).name
    target=PROTECTED_DIAGRAMS / safe
    if not target.is_file():
        raise HTTPException(404,'Diagram image not found')
    return FileResponse(target, headers={'Cache-Control':'private, no-store, max-age=0','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Content-Disposition':'inline'})



@app.get('/api/admin/email-status')
def admin_email_status(
    user: User = Depends(require_roles('admin','instructor'))
):
    return _smtp_status()

@app.post('/api/admin/email-test')
def admin_email_test(
    user: User = Depends(require_roles('admin','instructor'))
):
    import smtplib
    from email.message import EmailMessage
    status=_smtp_status()
    if not status['configured']:
        raise HTTPException(400,'SMTP is not configured. Set SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, and SMTP_FROM in .env.')
    host=os.getenv('SMTP_HOST','').strip()
    port=int(os.getenv('SMTP_PORT','587'))
    username=os.getenv('SMTP_USERNAME','').strip()
    password=os.getenv('SMTP_PASSWORD','')
    sender=os.getenv('SMTP_FROM',username or 'no-reply@azielon.com').strip()
    recipient=status['notify_email']
    use_tls=os.getenv('SMTP_USE_TLS','true').strip().lower() not in {'0','false','no'}
    msg=EmailMessage()
    msg['Subject']='Azielon PMP Coach — Email Test'
    msg['From']=sender
    msg['To']=recipient
    msg.set_content('This is a test email from Azielon PMP Coach. SMTP email is configured correctly.')
    try:
        with smtplib.SMTP(host,port,timeout=20) as server:
            if use_tls:
                server.starttls()
            if username:
                server.login(username,password)
            server.send_message(msg)
    except Exception as exc:
        raise HTTPException(500,f'Email test failed: {str(exc)[:300]}')
    return {'ok':True,'sent_to':recipient}

@app.get('/api/admin/program-registrations')
def admin_program_registrations(
    q: str|None=None,
    status: str|None=None,
    user: User = Depends(require_roles('admin','instructor')),
    db: Session = Depends(get_db)
):
    query=db.query(PmpClassRegistrationLead, PmpClassRegistrationPayment).outerjoin(
        PmpClassRegistrationPayment,
        PmpClassRegistrationPayment.registration_id==PmpClassRegistrationLead.id
    ).order_by(PmpClassRegistrationLead.created_at.desc())
    if q:
        like=f'%{q.strip()}%'
        query=query.filter(
            (PmpClassRegistrationLead.name.ilike(like)) |
            (PmpClassRegistrationLead.email.ilike(like))
        )
    if status:
        query=query.filter(PmpClassRegistrationPayment.status==status)
    rows=query.limit(250).all()
    result=[]
    for reg,pay in rows:
        result.append({
            'id':reg.id,
            'name':reg.name,
            'email':reg.email,
            'preferred_date':reg.preferred_date.isoformat() if reg.preferred_date else None,
            'source':reg.source,
            'created_at':reg.created_at.isoformat() if reg.created_at else None,
            'payment_status':pay.status if pay else 'pending',
            'paid_at':pay.paid_at.isoformat() if pay and pay.paid_at else None,
            'notification_sent_at':pay.notification_sent_at.isoformat() if pay and pay.notification_sent_at else None,
            'price':999,
            'schedule':'Starts Tuesday · Tue–Fri · 8:00 AM–5:00 PM ET',
            'hours':35
        })
    return result

@app.post('/api/admin/program-registrations/{registration_id}/mark-paid')
def admin_mark_program_registration_paid(
    registration_id: int,
    user: User = Depends(require_roles('admin','instructor')),
    db: Session = Depends(get_db)
):
    reg=db.get(PmpClassRegistrationLead,registration_id)
    if not reg:
        raise HTTPException(404,'Registration not found')
    pay=db.query(PmpClassRegistrationPayment).filter(
        PmpClassRegistrationPayment.registration_id==registration_id
    ).first()
    if not pay:
        pay=PmpClassRegistrationPayment(
            registration_id=registration_id,
            status='pending',
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(pay)
    pay.status='paid'
    pay.paid_at=pay.paid_at or datetime.utcnow()
    pay.marked_by_user_id=user.id
    pay.updated_at=datetime.utcnow()

    email_sent=False
    learner_email_sent=False
    errors=[]
    try:
        _send_program_registration_email(reg,'paid')
        pay.notification_sent_at=datetime.utcnow()
        email_sent=True
    except Exception as exc:
        errors.append('Admin email: '+str(exc)[:220])
    try:
        _send_program_registration_confirmation_to_learner(reg)
        learner_email_sent=True
    except Exception as exc:
        errors.append('Learner email: '+str(exc)[:220])
    email_error=' | '.join(errors) if errors else None

    db.add(AuditLog(
        actor_user_id=user.id,
        action='program_registration.mark_paid',
        entity_type='program_registration',
        entity_id=str(registration_id),
        after_json=json.dumps({
            'payment_status':'paid',
            'email_sent':email_sent,
            'learner_email_sent':learner_email_sent,
            'notify_email':os.getenv('PROGRAM_REGISTRATION_NOTIFY_EMAIL','azi@azielon.com')
        })
    ))
    db.commit()
    return {
        'ok':True,
        'payment_status':'paid',
        'paid_at':pay.paid_at.isoformat(),
        'email_sent':email_sent,
        'learner_email_sent':learner_email_sent,
        'email_error':email_error
    }

@app.post('/api/admin/program-registrations/{registration_id}/send-email')
def admin_send_program_registration_email(
    registration_id: int,
    user: User = Depends(require_roles('admin','instructor')),
    db: Session = Depends(get_db)
):
    reg=db.get(PmpClassRegistrationLead,registration_id)
    if not reg:
        raise HTTPException(404,'Registration not found')
    pay=db.query(PmpClassRegistrationPayment).filter(
        PmpClassRegistrationPayment.registration_id==registration_id
    ).first()
    status=pay.status if pay else 'pending'
    try:
        _send_program_registration_email(reg,status)
    except Exception as exc:
        raise HTTPException(500,f'Email could not be sent: {str(exc)[:250]}')
    if pay:
        pay.notification_sent_at=datetime.utcnow()
        pay.updated_at=datetime.utcnow()
    db.add(AuditLog(
        actor_user_id=user.id,
        action='program_registration.email',
        entity_type='program_registration',
        entity_id=str(registration_id)
    ))
    db.commit()
    return {'ok':True,'sent_to':os.getenv('PROGRAM_REGISTRATION_NOTIFY_EMAIL','azi@azielon.com')}

@app.get('/api/admin/billing/orders')
def admin_billing_orders(user: User = Depends(require_roles('admin','instructor')), db: Session = Depends(get_db)):
    rows=db.query(CheckoutOrder).order_by(CheckoutOrder.created_at.desc()).limit(100).all()
    return [{'id':x.id,'user_id':x.user_id,'plan_code':x.plan_code,'provider':x.provider,'amount_cents':x.amount_cents,'currency':x.currency,'status':x.status,'provider_order_id':x.provider_order_id,'created_at':x.created_at.isoformat(),'paid_at':x.paid_at.isoformat() if x.paid_at else None} for x in rows]

@app.get('/api/admin/billing/entitlements')
def admin_billing_entitlements(user: User = Depends(require_roles('admin','instructor')), db: Session = Depends(get_db)):
    rows=db.query(Entitlement).order_by(Entitlement.created_at.desc()).limit(100).all()
    return [{'id':x.id,'user_id':x.user_id,'tier_code':x.tier_code,'plan_code':x.plan_code,'provider':x.provider,'status':x.status,'starts_at':x.starts_at.isoformat(),'ends_at':x.ends_at.isoformat()} for x in rows]

@app.post('/api/admin/questions')
def admin_create_question(data: QuestionCreateIn, user: User = Depends(require_roles('admin','instructor','content_editor')), db: Session = Depends(get_db)):
    if db.get(Question, data.id): raise HTTPException(409, 'Question ID already exists')
    meta={'leftItems': data.left_items or []}
    q=Question(id=data.id.strip(), stem=data.stem.strip(), options_json=json.dumps(data.options or []), answer_json=json.dumps(data.answer or {}),
               explanation_json=json.dumps(data.explanation or {}), type=data.type or 'single', domain=data.domain, eco_task=data.eco_task,
               eco_enabler=data.eco_enabler, delivery_approach=data.delivery_approach, difficulty=data.difficulty,
               primary_concept=data.primary_concept, curriculum_links_json=json.dumps(data.curriculum_links or []), visual_json=json.dumps(data.visual),
               review_status=data.review_status, lifecycle_state=data.lifecycle_state, instructor_approved=data.instructor_approved,
               source_metadata_json=json.dumps(meta), version=1)
    db.add(q); db.flush()
    db.add(AuditLog(actor_user_id=user.id, action='question.create', entity_type='question', entity_id=q.id, after_json=json.dumps(question_payload(q,True))))
    db.commit(); return question_payload(q,True)

@app.get('/api/admin/questions')
def admin_questions(q: str|None=None, domain: str|None=None, user: User = Depends(require_roles('admin','instructor','content_editor','reviewer')), db: Session = Depends(get_db)):
    query=db.query(Question)
    if q: query=query.filter((Question.id.ilike(f'%{q}%')) | (Question.primary_concept.ilike(f'%{q}%')))
    if domain: query=query.filter(Question.domain==domain)
    return [question_payload(x, include_answer=True) for x in query.limit(100).all()]

@app.patch('/api/admin/questions/{question_id}')
def admin_patch_question(question_id: str, data: QuestionPatchIn, user: User = Depends(require_roles('admin','instructor','content_editor')), db: Session = Depends(get_db)):
    q=db.get(Question, question_id)
    if not q: raise HTTPException(404, 'Question not found')
    before=question_payload(q, include_answer=True)
    patch=data.model_dump(exclude_unset=True)
    simple_fields=['stem','domain','eco_task','eco_enabler','delivery_approach','difficulty','primary_concept','review_status','lifecycle_state','instructor_approved']
    for f in simple_fields:
        if f in patch: setattr(q,f,patch[f])
    mappings={'options':'options_json','answer':'answer_json','explanation':'explanation_json','curriculum_links':'curriculum_links_json','visual':'visual_json'}
    for k,col in mappings.items():
        if k in patch: setattr(q,col,json.dumps(patch[k]))
    if 'left_items' in patch:
        meta=json.loads(q.source_metadata_json or '{}'); meta['leftItems']=patch['left_items'] or []; q.source_metadata_json=json.dumps(meta)
    q.version=(q.version or 1)+1; q.updated_at=datetime.utcnow()
    after=question_payload(q, include_answer=True)
    db.add(AuditLog(actor_user_id=user.id, action='question.update', entity_type='question', entity_id=q.id, before_json=json.dumps(before), after_json=json.dumps(after)))
    db.commit()
    return after

@app.get('/api/admin/notes')
def admin_notes(user: User = Depends(require_roles('admin','instructor','content_editor','reviewer')), db: Session = Depends(get_db)):
    return [json.loads(x.body_json) for x in db.query(TopicNote).order_by(TopicNote.id).all()]

@app.post('/api/admin/notes')
def admin_create_note(data: ContentCreateIn, user: User = Depends(require_roles('admin','instructor','content_editor')), db: Session = Depends(get_db)):
    if db.get(TopicNote,data.id): raise HTTPException(409,'Note ID already exists')
    body=dict(data.body or {}); body.update({'id':data.id,'domain':data.domain,'title':data.title})
    row=TopicNote(id=data.id,domain=data.domain,title=data.title,body_json=json.dumps(body)); db.add(row)
    db.add(AuditLog(actor_user_id=user.id,action='note.create',entity_type='note',entity_id=data.id,after_json=json.dumps(body))); db.commit(); return body

@app.patch('/api/admin/notes/{item_id}')
def admin_patch_note(item_id:str, data:ContentCreateIn, user: User = Depends(require_roles('admin','instructor','content_editor')), db: Session = Depends(get_db)):
    row=db.get(TopicNote,item_id)
    if not row: raise HTTPException(404,'Note not found')
    before=json.loads(row.body_json); body=dict(data.body or {}); body.update({'id':item_id,'domain':data.domain,'title':data.title})
    row.domain=data.domain; row.title=data.title; row.body_json=json.dumps(body)
    db.add(AuditLog(actor_user_id=user.id,action='note.update',entity_type='note',entity_id=item_id,before_json=json.dumps(before),after_json=json.dumps(body))); db.commit(); return body

@app.get('/api/admin/diagrams')
def admin_diagrams(user: User = Depends(require_roles('admin','instructor','content_editor','reviewer')), db: Session = Depends(get_db)):
    return [{'id':x.id,'domain':x.domain,'title':x.title,'category':x.category,'image_file':x.image_file,'metadata':json.loads(x.metadata_json)} for x in db.query(Diagram).order_by(Diagram.id).all()]

@app.post('/api/admin/diagrams')
def admin_create_diagram(data:DiagramCreateIn,user:User=Depends(require_roles('admin','instructor','content_editor')),db:Session=Depends(get_db)):
    if db.get(Diagram,data.id): raise HTTPException(409,'Diagram ID already exists')
    meta=dict(data.metadata or {}); meta.update({'id':data.id,'domain':data.domain,'title':data.title,'category':data.category})
    row=Diagram(id=data.id,domain=data.domain,title=data.title,category=data.category,image_file=data.image_file,metadata_json=json.dumps(meta)); db.add(row)
    db.add(AuditLog(actor_user_id=user.id,action='diagram.create',entity_type='diagram',entity_id=data.id,after_json=json.dumps(meta))); db.commit(); return {'id':data.id,**meta,'imageFile':data.image_file}

@app.patch('/api/admin/diagrams/{item_id}')
def admin_patch_diagram(item_id:str,data:DiagramCreateIn,user:User=Depends(require_roles('admin','instructor','content_editor')),db:Session=Depends(get_db)):
    row=db.get(Diagram,item_id)
    if not row: raise HTTPException(404,'Diagram not found')
    before=json.loads(row.metadata_json); meta=dict(data.metadata or {}); meta.update({'id':item_id,'domain':data.domain,'title':data.title,'category':data.category})
    row.domain=data.domain;row.title=data.title;row.category=data.category;row.image_file=data.image_file;row.metadata_json=json.dumps(meta)
    db.add(AuditLog(actor_user_id=user.id,action='diagram.update',entity_type='diagram',entity_id=item_id,before_json=json.dumps(before),after_json=json.dumps(meta)));db.commit();return {'id':item_id,**meta,'imageFile':data.image_file}

@app.get('/api/admin/tricky')
def admin_tricky(user: User = Depends(require_roles('admin','instructor','content_editor','reviewer')), db: Session = Depends(get_db)):
    return [{'id':x.id,'left':x.left_term,'right':x.right_term,'tags':json.loads(x.tags_json),'body':json.loads(x.body_json)} for x in db.query(TrickyWord).order_by(TrickyWord.id).all()]

@app.post('/api/admin/tricky')
def admin_create_tricky(data:TrickyCreateIn,user:User=Depends(require_roles('admin','instructor','content_editor')),db:Session=Depends(get_db)):
    if db.get(TrickyWord,data.id): raise HTTPException(409,'Tricky-word ID already exists')
    body=dict(data.body or {}); body.update({'id':data.id,'left':data.left,'right':data.right,'tags':data.tags})
    row=TrickyWord(id=data.id,left_term=data.left,right_term=data.right,tags_json=json.dumps(data.tags or []),body_json=json.dumps(body));db.add(row)
    db.add(AuditLog(actor_user_id=user.id,action='tricky.create',entity_type='tricky',entity_id=data.id,after_json=json.dumps(body)));db.commit();return body

@app.patch('/api/admin/tricky/{item_id}')
def admin_patch_tricky(item_id:str,data:TrickyCreateIn,user:User=Depends(require_roles('admin','instructor','content_editor')),db:Session=Depends(get_db)):
    row=db.get(TrickyWord,item_id)
    if not row: raise HTTPException(404,'Tricky-word item not found')
    before=json.loads(row.body_json); body=dict(data.body or {});body.update({'id':item_id,'left':data.left,'right':data.right,'tags':data.tags})
    row.left_term=data.left;row.right_term=data.right;row.tags_json=json.dumps(data.tags or []);row.body_json=json.dumps(body)
    db.add(AuditLog(actor_user_id=user.id,action='tricky.update',entity_type='tricky',entity_id=item_id,before_json=json.dumps(before),after_json=json.dumps(body)));db.commit();return body

@app.get('/api/admin/audit')
def admin_audit(user: User = Depends(require_roles('admin','instructor')), db: Session = Depends(get_db)):
    rows=db.query(AuditLog).order_by(AuditLog.id.desc()).limit(100).all()
    return [{'id':x.id,'actor_user_id':x.actor_user_id,'action':x.action,'entity_type':x.entity_type,'entity_id':x.entity_id,'created_at':x.created_at.isoformat()} for x in rows]


_STOPWORDS = {
    'give','show','tell','what','when','where','which','with','from','into','about','this','that',
    'have','does','can','could','would','should','please','flow','process','steps','explain','example',
    'for','the','and','you','your','are','how','why','pmp','project','manager'
}

def _coach_tokens(text: str):
    import re as _re
    return [x for x in _re.findall(r"[a-z0-9][a-z0-9_-]*", (text or '').lower()) if len(x) > 2 and x not in _STOPWORDS]

def _note_search_fields(body: dict):
    title=str(body.get('title') or '')
    triggers=' '.join(str(x) for x in (body.get('triggerWords') or []))
    distinctions=' '.join(str(x) for x in (body.get('trickyDistinctions') or []))
    rules=' '.join(str(x) for x in (body.get('keyRules') or []))
    summary=str(body.get('summary') or '')
    memory=str(body.get('flowOrMemory') or '')
    return title, triggers, distinctions, rules, summary, memory

def _rank_coach_notes(message: str, db: Session):
    tokens=_coach_tokens(message)
    phrase=(message or '').lower().strip()
    rows=[]
    for n in db.query(TopicNote).all():
        body=json.loads(n.body_json)
        title,triggers,distinctions,rules,summary,memory=_note_search_fields(body)
        tl=title.lower(); tr=triggers.lower(); dl=distinctions.lower(); rl=rules.lower(); sl=summary.lower(); ml=memory.lower()
        score=0
        # High value: query token is explicitly in title or trigger words.
        for t in tokens:
            if t in tl: score += 18
            if t in tr: score += 12
            if t in dl: score += 8
            if t in rl: score += 4
            if t in sl: score += 2
            if t in ml: score += 3
        # Strong boost for exact concept phrases.
        for concept in ('kanban','scrum','critical path','earned value','evm','tuckman',
                        'stakeholder','risk','issue','change control','procurement','conflict',
                        'raci','pareto','control chart','decision tree','tornado','hybrid',
                        'agile','servant leadership','communication','quality'):
            if concept in phrase and concept in (tl+' '+tr+' '+dl):
                score += 30
        if score:
            rows.append((score,body))
    rows.sort(key=lambda x:x[0], reverse=True)
    return rows

def _local_coach_answer(message: str, body: dict):
    lower=(message or '').lower()
    title=body.get('title') or 'PMP concept'
    summary=body.get('summary') or ''
    rules=(body.get('keyRules') or [])[:4]
    flow=body.get('flowOrMemory')
    do_first=body.get('doFirst')
    traps=(body.get('examTraps') or [])[:2]

    # If learner specifically asks for a flow/steps, lead with the flow.
    wants_flow=any(x in lower for x in ('flow','steps','sequence','workflow','process'))
    parts=[]
    if wants_flow and flow:
        parts.append(f"{title} flow:\n{flow}")
        if rules:
            parts.append("What to remember:\n" + "\n".join('• '+str(x) for x in rules[:3]))
    else:
        parts.append(f"{title}\n{summary}")
        if rules:
            parts.append("Key points:\n" + "\n".join('• '+str(x) for x in rules))
    if do_first:
        parts.append("Exam mindset:\n"+str(do_first))
    if traps and not wants_flow:
        parts.append("Common traps:\n" + "\n".join('• '+str(x) for x in traps))
    return "\n\n".join(p for p in parts if p).strip()


@app.post('/api/ai/coach')
async def ai_coach(payload: dict, user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_feature(user, db, 'ai_coach', 'AI Coach is Premium-only')
    _guard_no_active_real_mock(user, db)
    message=str(payload.get('message','')).strip()[:8000]
    if not message:
        raise HTTPException(400,'Message required')

    ranked=_rank_coach_notes(message,db)
    if not ranked:
        return {
            'mode':'local',
            'text':'I could not find a close Azielon match for that question. Try naming the concept directly—for example: Kanban, Scrum, risk, EVM, change control, stakeholder engagement, or conflict resolution.'
        }

    # Refuse a clearly unrelated weak match instead of returning the wrong lesson.
    top_score, top_body = ranked[0]
    if top_score < 10:
        return {
            'mode':'local',
            'text':'I do not have a strong enough match in the Azielon learning library for that request yet. Please name the PMP concept you want to review.'
        }

    key=os.getenv('OPENAI_API_KEY')
    model=os.getenv('OPENAI_MODEL')

    # Safe deterministic fallback: answer only from the best matching approved note.
    if not key or not model:
        return {'mode':'local','topic_id':top_body.get('id'),'topic':top_body.get('title'),'text':_local_coach_answer(message,top_body)}

    # For live AI, use only the most relevant approved notes rather than dumping every note.
    selected=[body for _,body in ranked[:4]]
    context_parts=[]
    for body in selected:
        context_parts.append(json.dumps({
            'id':body.get('id'),
            'title':body.get('title'),
            'summary':body.get('summary'),
            'keyRules':body.get('keyRules'),
            'doFirst':body.get('doFirst'),
            'trickyDistinctions':body.get('trickyDistinctions'),
            'examTraps':body.get('examTraps'),
            'flowOrMemory':body.get('flowOrMemory')
        }, ensure_ascii=False))
    context='\n\n'.join(context_parts)

    body={
      'model': model,
      'input': [
        {'role':'system','content':(
            'You are Azielon Coach, a concise PMP learning coach. '
            'Answer the learner question directly using ONLY the supplied approved Azielon context. '
            'Never substitute a different PMP topic just because it is related. '
            'If the learner asks for a flow or steps, give the flow first. '
            'If the supplied context does not answer the question, say that clearly. '
            'Do not claim PMI endorsement or guarantee exam results.'
        )},
        {'role':'user','content':f'Approved Azielon context:\n{context}\n\nLearner question:\n{message}'}
      ]
    }
    async with httpx.AsyncClient(timeout=60) as client:
        r=await client.post(
            'https://api.openai.com/v1/responses',
            headers={'Authorization':f'Bearer {key}','Content-Type':'application/json'},
            json=body
        )
    if r.status_code>=400:
        # Do not fail the learner experience if the provider is unavailable.
        return {'mode':'local','topic_id':top_body.get('id'),'topic':top_body.get('title'),'text':_local_coach_answer(message,top_body)}

    data=r.json()
    text=data.get('output_text')
    if not text:
        texts=[]
        for item in data.get('output',[]):
            for c in item.get('content',[]):
                if c.get('type') in ('output_text','text'):
                    texts.append(c.get('text',''))
        text='\n'.join(texts)
    return {'mode':'live','topic_id':top_body.get('id'),'topic':top_body.get('title'),'text':text or _local_coach_answer(message,top_body)}


# ---------------- Full Mock + Concept Mastery Exams ----------------
def _exam_def(code: str):
    e=EXAM_DEFS.get(code)
    if not e: raise HTTPException(404,'Exam not found')
    return e

def _owned_exam_session(session_id: int, user: User, db: Session):
    s=db.get(ExamSession, session_id)
    if not s or s.user_id != user.id:
        raise HTTPException(404,'Exam session not found')
    return s

AZIELON_PASS_BENCHMARK=float(os.getenv('AZIELON_PASS_BENCHMARK','70'))

def _exam_time_state(s: ExamSession):
    now=datetime.utcnow()
    if s.status in ('submitted','expired'):
        return {'expired':s.status=='expired','remaining_seconds':0 if s.status=='expired' else max(0,s.duration_seconds),'paused':False}
    elapsed=(now-s.started_at).total_seconds()
    paused=float(s.break_seconds_used or 0)
    if s.break_started_at:
        current_pause=max(0.0,(now-s.break_started_at).total_seconds())
        paused += current_pause if s.status=='paused' else min(600.0,current_pause)
    active_elapsed=max(0.0,elapsed-paused)
    remaining=max(0,int(s.duration_seconds-active_elapsed))
    expired=remaining<=0 and s.status=='active'
    return {'expired':expired,'remaining_seconds':remaining,'paused':s.status=='paused'}

def _expire_exam_if_needed(s: ExamSession, db: Session):
    ts=_exam_time_state(s)
    if ts['expired'] and s.status=='active':
        s.status='expired'; s.completed_at=datetime.utcnow(); db.commit()
    return ts

def _active_real_mock(user_id:int, db:Session):
    rows=db.query(ExamSession).filter(ExamSession.user_id==user_id, ExamSession.status.in_(['active','paused']), ExamSession.mode=='real_mock').all()
    for s in rows:
        _expire_exam_if_needed(s,db)
        if s.status in ('active','paused'): return s
    return None

def _guard_no_active_real_mock(user:User, db:Session):
    active=_active_real_mock(user.id,db)
    if active:
        raise HTTPException(423,'A Real Mock exam is active or paused. Finish or submit it before opening study content.')

def _score_exam_response(q, data: ExamAttemptIn):
    qt=q.get('type')
    ans=q.get('answer')
    if qt=='matching':
        expected=ans or {}
        submitted=data.matching_pairs or {}
        return submitted==expected, {'matching_pairs':submitted}
    selected=list(data.selected_option_ids or [])
    # Exam data stores correct letters. Translate selections as letters from UI.
    expected=ans if isinstance(ans,list) else [ans]
    return set(selected)==set(expected), {'selected_option_ids':selected}

def _require_exam_access(user: User, db: Session, exam_code: str, mode: str|None=None):
    e=_exam_def(exam_code)
    feature=exam_code
    require_feature(user,db,feature,f'{e.get("name","This exam")} is not included in your plan')
    if e.get('kind')=='mastery':
        if mode=='real_mock':
            require_feature(user,db,'mastery_real_mock','Real Mock mode for Concept Mastery exams is Premium-only')
        elif mode and mode!='real_mock':
            require_feature(user,db,'mastery_learning','Rule-review mastery modes are included with Concept + Exam or Premium')
    return e

@app.get('/api/exams/catalog')
def exam_catalog(user: User = Depends(current_user), db: Session = Depends(get_db)):
    require_paid_access(user,db)
    out=[]
    features=set(access_payload(user,db).get('features') or [])
    for e in EXAM_CONTENT.get('exams',[]):
        if e.get('code') not in features:
            continue
        attempts=db.query(ExamSession).filter(ExamSession.user_id==user.id, ExamSession.exam_code==e['code']).count()
        latest=db.query(ExamSession).filter(ExamSession.user_id==user.id, ExamSession.exam_code==e['code']).order_by(ExamSession.id.desc()).first()
        active=None
        if latest and latest.status in ('active','paused'):
            _expire_exam_if_needed(latest,db)
            if latest.status in ('active','paused'):
                active={'session_id':latest.id,'mode':latest.mode,'current_index':latest.current_index,'feedback_mode':latest.feedback_mode,'paused':latest.status=='paused'}
        latest_summary=None
        if latest:
            rows=db.query(ExamAttempt).filter(ExamAttempt.exam_session_id==latest.id).all()
            correct=sum(1 for a in rows if a.is_correct)
            total=len(json.loads(latest.question_ids_json or '[]'))
            score_pct=round(correct/total*100,1) if total else None
            latest_summary={'session_id':latest.id,'status':latest.status,'answered':len(rows),'correct':correct,'total':total,'accuracy':score_pct,
                            'result':'PASS' if latest.status in ('submitted','expired') and score_pct is not None and score_pct>=AZIELON_PASS_BENCHMARK else ('BELOW BENCHMARK' if latest.status in ('submitted','expired') and score_pct is not None else None)}
        out.append({**e,'sessions_started':attempts,'latest_status':latest.status if latest else None,'active_session':active,'latest_summary':latest_summary,'benchmark':AZIELON_PASS_BENCHMARK})
    return out

@app.get('/api/exams/{exam_code}/rules')
def exam_rules(exam_code:str, block:int|None=None, user:User=Depends(current_user), db:Session=Depends(get_db)):
    require_paid_access(user,db)
    e=_require_exam_access(user,db,exam_code,'block_rules')
    require_feature(user,db,'rules','Rule Review is included with Concept + Exam or Premium')
    if not e.get('rules_available'): raise HTTPException(404,'This exam does not have rule-review content')
    active=_active_real_mock(user.id,db)
    if active:
        raise HTTPException(403,'Rule review is unavailable while a Real Mock session is active')
    rs=[r for r in EXAM_CONTENT.get('rules',[]) if r.get('exam_code')==exam_code]
    if block is not None: rs=[r for r in rs if int(r.get('block') or 0)==block]
    rs.sort(key=lambda r:(int(r.get('block') or 0),int(r.get('position') or 0)))
    return {'exam_code':exam_code,'rules':rs}

@app.post('/api/exams/{exam_code}/start')
def start_exam(exam_code:str, data:ExamStartIn, user:User=Depends(current_user), db:Session=Depends(get_db)):
    require_paid_access(user,db)
    mode=(data.mode or 'real_mock').strip().lower()
    e=_require_exam_access(user,db,exam_code,mode)
    allowed={'real_mock','block_rules','review_all'}
    if mode not in allowed: raise HTTPException(400,'Invalid exam mode')
    if mode!='real_mock' and not e.get('rules_available'):
        raise HTTPException(400,'Rule-review modes are available only for Concept Mastery exams')
    feedback=(data.feedback_mode or 'end').strip().lower()
    if feedback not in {'immediate','block','end'}: raise HTTPException(400,'Invalid feedback mode')
    if mode=='real_mock': feedback='end'
    ids=list(EXAM_QUESTION_IDS.get(exam_code,[]))
    if len(ids)!=180: raise HTTPException(500,'Exam content is incomplete')
    # Real mock order is mixed but deterministic per session creation.
    if mode=='real_mock': random.shuffle(ids)
    s=ExamSession(user_id=user.id,exam_code=exam_code,mode=mode,feedback_mode=feedback,
                  question_ids_json=json.dumps(ids),duration_seconds=int(e.get('duration_minutes',240))*60,
                  status='active',current_index=0,marked_json='[]',rules_viewed_json='[]')
    db.add(s); db.commit(); db.refresh(s)
    return {'session_id':s.id,'exam_code':exam_code,'exam_name':e['name'],'mode':mode,'feedback_mode':feedback,
            'total':180,'duration_seconds':s.duration_seconds,'remaining_seconds':s.duration_seconds,
            'requires_rule_review': mode in {'block_rules','review_all'},'break_after':[60,120]}

@app.get('/api/exam-sessions/{session_id}/status')
def exam_status(session_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db); s=_owned_exam_session(session_id,user,db); ts=_expire_exam_if_needed(s,db)
    answered=db.query(ExamAttempt).filter(ExamAttempt.exam_session_id==s.id).count()
    return {'session_id':s.id,'status':s.status,'mode':s.mode,'feedback_mode':s.feedback_mode,'answered':answered,
            'total':len(json.loads(s.question_ids_json or '[]')),'remaining_seconds':ts['remaining_seconds'],
            'marked':json.loads(s.marked_json or '[]'),'break_number':s.break_number,
            'on_break':bool(s.break_started_at and s.status=='active'),'paused':s.status=='paused'}

@app.post('/api/exam-sessions/{session_id}/rules-viewed/{block_no}')
def exam_rules_viewed(session_id:int,block_no:str,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_feature(user,db,'rules','Rule Review is included with Concept + Exam or Premium'); s=_owned_exam_session(session_id,user,db)
    if s.mode=='real_mock': raise HTTPException(403,'Rules are hidden in Real Mock mode')
    viewed=set(json.loads(s.rules_viewed_json or '[]')); viewed.add(str(block_no)); s.rules_viewed_json=json.dumps(sorted(viewed)); db.commit()
    return {'ok':True,'viewed':sorted(viewed)}

@app.get('/api/exam-sessions/{session_id}/questions/{index}')
def exam_question(session_id:int,index:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db); s=_owned_exam_session(session_id,user,db); ts=_expire_exam_if_needed(s,db)
    if s.status!='active': raise HTTPException(409,'Exam session is no longer active')
    if s.break_started_at: raise HTTPException(409,'End the break before continuing')
    ids=json.loads(s.question_ids_json or '[]')
    if index<0 or index>=len(ids): raise HTTPException(404,'Question index is outside this exam')
    q=EXAM_QUESTIONS.get(ids[index]);
    if not q: raise HTTPException(404,'Question not found')
    if s.mode=='block_rules':
        b=str(q.get('block') or 0); viewed=set(json.loads(s.rules_viewed_json or '[]'))
        if b not in viewed: raise HTTPException(403,f'Review the 10 rules for block {b} before starting these questions')
    elif s.mode=='review_all':
        viewed=set(json.loads(s.rules_viewed_json or '[]'))
        if 'all' not in viewed: raise HTTPException(403,'Review all rules before starting this mode')
    s.current_index=index; db.commit()
    a=db.query(ExamAttempt).filter(ExamAttempt.exam_session_id==s.id,ExamAttempt.question_id==q['id']).first()
    selected=json.loads(a.selected_json) if a else None
    return {'session_id':s.id,'current_index':index,'total':len(ids),'remaining_seconds':ts['remaining_seconds'],
            'question':_exam_question_payload(q,False),'saved_response':selected,'marked':q['id'] in set(json.loads(s.marked_json or '[]'))}

@app.post('/api/exam-sessions/{session_id}/attempts')
def exam_attempt(session_id:int,data:ExamAttemptIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db); s=_owned_exam_session(session_id,user,db); ts=_expire_exam_if_needed(s,db)
    if s.status!='active': raise HTTPException(409,'Exam session is no longer active')
    ids=json.loads(s.question_ids_json or '[]')
    if data.question_id not in ids: raise HTTPException(403,'Question does not belong to this exam')
    q=EXAM_QUESTIONS.get(data.question_id); is_correct,response=_score_exam_response(q,data)
    row=db.query(ExamAttempt).filter(ExamAttempt.exam_session_id==s.id,ExamAttempt.question_id==data.question_id).first()
    if row:
        row.selected_json=json.dumps(response); row.is_correct=is_correct; row.elapsed_seconds=data.elapsed_seconds; row.updated_at=datetime.utcnow()
    else:
        row=ExamAttempt(user_id=user.id,exam_session_id=s.id,question_id=data.question_id,selected_json=json.dumps(response),is_correct=is_correct,elapsed_seconds=data.elapsed_seconds)
        db.add(row)
    db.commit()
    payload={'saved':True,'remaining_seconds':ts['remaining_seconds']}
    if s.mode!='real_mock' and s.feedback_mode=='immediate':
        payload.update({'is_correct':is_correct,'answer':q.get('answer'),'explanation':q.get('explanation'),'rule_id':q.get('rule_id')})
    return payload

@app.post('/api/exam-sessions/{session_id}/mark')
def exam_mark(session_id:int,data:ExamMarkIn,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db); s=_owned_exam_session(session_id,user,db)
    marked=set(json.loads(s.marked_json or '[]'))
    if data.marked: marked.add(data.question_id)
    else: marked.discard(data.question_id)
    s.marked_json=json.dumps(sorted(marked)); db.commit(); return {'marked':sorted(marked)}

@app.post('/api/exam-sessions/{session_id}/pause')
def exam_pause(session_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db); s=_owned_exam_session(session_id,user,db); _expire_exam_if_needed(s,db)
    if s.status!='active': raise HTTPException(409,'Only an active exam can be paused')
    if s.break_started_at: raise HTTPException(409,'End the pacing break before pausing the exam')
    s.status='paused'; s.break_started_at=datetime.utcnow(); db.commit()
    ts=_exam_time_state(s)
    return {'paused':True,'remaining_seconds':ts['remaining_seconds'],'note':'Azielon pause: timer stopped until resume.'}

@app.post('/api/exam-sessions/{session_id}/resume')
def exam_resume_paused(session_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db); s=_owned_exam_session(session_id,user,db)
    if s.status!='paused' or not s.break_started_at: raise HTTPException(409,'This exam is not paused')
    used=max(0,int((datetime.utcnow()-s.break_started_at).total_seconds()))
    s.break_seconds_used=(s.break_seconds_used or 0)+used; s.break_started_at=None; s.status='active'; db.commit()
    ts=_exam_time_state(s)
    return {'paused':False,'remaining_seconds':ts['remaining_seconds']}

@app.post('/api/exam-sessions/{session_id}/break/start')
def exam_break_start(session_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db); s=_owned_exam_session(session_id,user,db); _expire_exam_if_needed(s,db)
    if s.status!='active': raise HTTPException(409,'Exam session is no longer active')
    if s.break_started_at: raise HTTPException(409,'A break is already active')
    answered=db.query(ExamAttempt).filter(ExamAttempt.exam_session_id==s.id).count()
    next_break=(s.break_number or 0)+1
    threshold=60 if next_break==1 else 120 if next_break==2 else None
    if threshold is None: raise HTTPException(409,'Both practice breaks have already been used')
    if answered<threshold: raise HTTPException(409,f'Break {next_break} becomes available after {threshold} answered questions')
    s.break_started_at=datetime.utcnow(); s.break_number=next_break; db.commit()
    return {'break_number':next_break,'break_seconds':600,'note':'Azielon pacing break. End early any time.'}

@app.post('/api/exam-sessions/{session_id}/break/end')
def exam_break_end(session_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db); s=_owned_exam_session(session_id,user,db)
    if not s.break_started_at: raise HTTPException(409,'No active break')
    used=min(600,max(0,int((datetime.utcnow()-s.break_started_at).total_seconds())))
    s.break_seconds_used=(s.break_seconds_used or 0)+used; s.break_started_at=None; db.commit()
    return {'ended':True,'break_seconds_used':used}

@app.post('/api/exam-sessions/{session_id}/submit')
def exam_submit(session_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db); s=_owned_exam_session(session_id,user,db)
    if s.status in ('active','paused'):
        if s.status=='paused' and s.break_started_at:
            s.break_seconds_used=(s.break_seconds_used or 0)+max(0,int((datetime.utcnow()-s.break_started_at).total_seconds()))
        s.status='submitted'; s.completed_at=datetime.utcnow(); s.break_started_at=None; db.commit()
    return {'submitted':True,'status':s.status}

@app.get('/api/exam-sessions/{session_id}/results')
def exam_results(session_id:int,user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db); s=_owned_exam_session(session_id,user,db); _expire_exam_if_needed(s,db)
    if s.status=='active': raise HTTPException(403,'Submit the exam before viewing results')
    ids=json.loads(s.question_ids_json or '[]'); attempts=db.query(ExamAttempt).filter(ExamAttempt.exam_session_id==s.id).all(); amap={a.question_id:a for a in attempts}
    results=[]; domains={}; approaches={}; question_types={}
    for qid in ids:
        q=EXAM_QUESTIONS[qid]; a=amap.get(qid); ok=bool(a.is_correct) if a else False
        d=domains.setdefault(q.get('domain') or 'Other',{'total':0,'correct':0}); d['total']+=1; d['correct']+=1 if ok else 0
        ap=approaches.setdefault(q.get('approach') or 'Mixed',{'total':0,'correct':0}); ap['total']+=1; ap['correct']+=1 if ok else 0
        qt=question_types.setdefault(q.get('type') or 'single',{'total':0,'correct':0}); qt['total']+=1; qt['correct']+=1 if ok else 0
        results.append({'question':_exam_question_payload(q,False),'selected':json.loads(a.selected_json) if a else None,
                        'is_correct':ok,'unanswered':a is None,'answer':q.get('answer'),'explanation':q.get('explanation'),'rule_id':q.get('rule_id')})
    correct=sum(1 for x in results if x['is_correct']); answered=len(attempts)
    for group in (domains,approaches,question_types):
        for d in group.values(): d['accuracy']=round(d['correct']/d['total']*100,1) if d['total'] else None
    accuracy=round(correct/len(ids)*100,1) if ids else None
    result_label='PASS' if accuracy is not None and accuracy>=AZIELON_PASS_BENCHMARK else 'BELOW BENCHMARK'
    return {'session_id':s.id,'exam_code':s.exam_code,'status':s.status,'total':len(ids),'answered':answered,'correct':correct,
            'accuracy':accuracy,'domains':domains,'approaches':approaches,'question_types':question_types,
            'benchmark':AZIELON_PASS_BENCHMARK,'result_label':result_label,
            'benchmark_note':'Azielon practice benchmark only; PMI does not publish a fixed percentage passing score.',
            'results':results}

@app.get('/api/exams/rules/mastery-summary')
def mastery_summary(user:User=Depends(current_user),db:Session=Depends(get_db)):
    require_paid_access(user,db)
    # Rule strength derives from paired mastery question history.
    out=[]
    # Lightweight summary keeps API stable without requiring a separate rule-progress table.
    return {'message':'Rule mastery is calculated from completed Concept Mastery exam attempts in the client review view.'}

@app.get('/api/version')
def version():
    return {'version': '4.3.5', 'landing': 'sales-free5'}

@app.get('/live-pmp')
def live_pmp_page():
    return FileResponse(
        STATIC/'live-pmp.html',
        headers={'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',
                 'Pragma':'no-cache','Expires':'0'}
    )

@app.get('/')
def root():
    return FileResponse(
        STATIC/'index.html',
        headers={'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',
                 'Pragma':'no-cache','Expires':'0'}
    )

@app.get('/{path:path}')
def spa(path: str):
    candidate=STATIC/path
    if candidate.is_file():
        return FileResponse(candidate)
    return FileResponse(
        STATIC/'index.html',
        headers={'Cache-Control':'no-store, no-cache, must-revalidate, max-age=0',
                 'Pragma':'no-cache','Expires':'0'}
    )
