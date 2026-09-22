import os, hmac, hashlib, secrets
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from .db import get_db
from .models import User

APP_SECRET = os.getenv('APP_SECRET', 'dev-secret-change-me')
ACCESS_TOKEN_MINUTES = int(os.getenv('ACCESS_TOKEN_MINUTES', '720'))
security = HTTPBearer(auto_error=False)

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 200_000)
    return f'pbkdf2_sha256$200000${salt}${dk.hex()}'

def verify_password(password: str, encoded: str) -> bool:
    try:
        alg, rounds, salt, digest = encoded.split('$', 3)
        if alg != 'pbkdf2_sha256': return False
        dk = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), int(rounds)).hex()
        return hmac.compare_digest(dk, digest)
    except Exception:
        return False

def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {'sub': str(user.id), 'role': user.role, 'iat': now, 'exp': now + timedelta(minutes=ACCESS_TOKEN_MINUTES)}
    return jwt.encode(payload, APP_SECRET, algorithm='HS256')

def current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Authentication required')
    try:
        payload = jwt.decode(credentials.credentials, APP_SECRET, algorithms=['HS256'])
        user = db.get(User, int(payload['sub']))
    except Exception:
        user = None
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid or expired token')
    return user

def require_roles(*roles):
    def dep(user: User = Depends(current_user)):
        if user.role not in roles:
            raise HTTPException(status_code=403, detail='Insufficient permissions')
        return user
    return dep


def create_password_reset_token() -> tuple[str, str]:
    raw = secrets.token_urlsafe(32)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    return raw, digest

def hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
