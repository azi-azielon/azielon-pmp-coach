#!/usr/bin/env python3
"""Verify PostgreSQL connectivity for the Azielon app."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import text
from backend.db import engine

with engine.connect() as conn:
    version = conn.execute(text("select version()" )).scalar()
    dbname = conn.execute(text("select current_database()" )).scalar()
    dbuser = conn.execute(text("select current_user" )).scalar()
    print("Connected successfully")
    print("Database:", dbname)
    print("User:", dbuser)
    print("Server:", version)
