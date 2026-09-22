#!/usr/bin/env python3
"""Verify the local installation contains at least the canonical Azielon content.

The check intentionally uses minimum counts rather than exact counts because instructors
and admins can add content to PostgreSQL. Extra user-created content must not make setup fail.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.db import SessionLocal
from backend.models import Question, TopicNote, Diagram, TrickyWord, BillingPlan

minimum_expected = {
    "questions": 780,
    "notes": 30,
    "diagrams": 54,
    "tricky_words": 45,
    "billing_plans": 9,
}

db = SessionLocal()
try:
    actual = {
        "questions": db.query(Question).count(),
        "notes": db.query(TopicNote).count(),
        "diagrams": db.query(Diagram).count(),
        "tricky_words": db.query(TrickyWord).count(),
        "billing_plans": db.query(BillingPlan).count(),
    }
finally:
    db.close()

ok = True
print("Installation content verification:")
for key, minimum in minimum_expected.items():
    got = actual[key]
    good = got >= minimum
    ok &= good
    suffix = "" if got == minimum else f"; {got-minimum} additional record(s) present"
    print(f"  {'PASS' if good else 'FAIL'} {key}: {got} (minimum expected {minimum}){suffix}")

# Also confirm the packaged Premium diagram files are physically present.
diagram_dir = ROOT / 'protected_assets' / 'diagrams'
image_count = len([p for p in diagram_dir.glob('*') if p.is_file() and p.suffix.lower() in {'.png','.jpg','.jpeg','.webp'}])
images_good = image_count >= 54
ok &= images_good
print(f"  {'PASS' if images_good else 'FAIL'} protected diagram images: {image_count} (minimum expected 54)")

if not ok:
    raise SystemExit("Verification failed. See counts above.")
print("All canonical Azielon content is present. Extra instructor/admin content is allowed.")
