import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.db import Base, engine, SessionLocal
from backend.models import User
from backend.security import hash_password

email=os.getenv('ADMIN_EMAIL')
password=os.getenv('ADMIN_PASSWORD')
if not email or not password:
    raise SystemExit('Set ADMIN_EMAIL and ADMIN_PASSWORD first.')
Base.metadata.create_all(bind=engine)
db=SessionLocal()
try:
    u=db.query(User).filter(User.email==email.lower()).first()
    if u:
        u.role='admin'; u.password_hash=hash_password(password); u.is_active=True
        print('Updated admin:',email)
    else:
        db.add(User(email=email.lower(),name='Azielon Admin',password_hash=hash_password(password),role='admin'))
        print('Created admin:',email)
    db.commit()
finally:
    db.close()
