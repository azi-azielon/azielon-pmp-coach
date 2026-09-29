Azielon PMP Coach v5.14.10 — Database-Backed Daily Study Plan

Replace these files in the existing project:
  static/index.html
  static/app.js
  static/styles.css
  backend/main.py
  backend/models.py
  VERSION.txt

What changed
- Adds daily_study_plans and daily_study_tasks database tables.
- Daily task status is now account-backed: not_started -> in_progress -> done.
- Opening a task saves In progress to the database.
- Done saves completion to the database.
- Topic Notes, Tricky Words, and Diagrams also sync to existing study_item_states.
- The next study day carries unfinished database tasks forward first, then fills remaining slots using the current adaptive plan/weak area recommendations.
- Existing v5.14.8/v5.14.9 localStorage daily-plan data is imported once when possible.
- The database is the source of truth after migration; localStorage is only used to discover legacy plan data for import.

Deployment
- Deploy the files and restart the app/server.
- This project already calls Base.metadata.create_all(...) at startup, so the two new tables are created automatically on restart.
- No destructive database migration is required for these additive tables.
