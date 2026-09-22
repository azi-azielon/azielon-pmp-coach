#!/usr/bin/env python3
"""Create all application tables and idempotently seed canonical content/pricing."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.db import Base, engine, SessionLocal
from backend.seed import seed_all
from backend.billing import seed_billing_plans
from backend.models import Question, TopicNote, Diagram, TrickyWord, BillingPlan

print("  Creating/updating SQLAlchemy tables...")
Base.metadata.create_all(bind=engine)

db = SessionLocal()
try:
    print("  Seeding canonical learner content...")
    seed_all(db)
    print("  Seeding pricing catalog...")
    seed_billing_plans(db)
    print("  Seed counts:")
    print("    Questions:", db.query(Question).count())
    print("    Topic notes:", db.query(TopicNote).count())
    print("    Diagrams:", db.query(Diagram).count())
    print("    Tricky words:", db.query(TrickyWord).count())
    print("    Billing plans:", db.query(BillingPlan).count())
finally:
    db.close()
