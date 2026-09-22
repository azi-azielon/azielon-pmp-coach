#!/usr/bin/env python3
"""One-command local PostgreSQL bootstrap for Azielon PMP Coach.

Creates/updates the dedicated PostgreSQL role and database, writes .env,
initializes the application schema/content, optionally creates an admin,
and runs verification. PostgreSQL admin credentials are never written to disk.
"""
from __future__ import annotations

import argparse
import getpass
import os
import secrets
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
ENV_EXAMPLE = ROOT / ".env.example"

PLACEHOLDERS = {
    "", "CHANGE_ME", "REPLACE_ME", "sk_test_REPLACE_ME", "whsec_REPLACE_ME",
    "replace-with-a-long-random-secret", "change-me-before-running-create-admin",
}


def prompt(label: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{label}{suffix}: ").strip()
    return value or (default or "")


def yes_no(label: str, default: bool = True) -> bool:
    suffix = " [Y/n]" if default else " [y/N]"
    value = input(label + suffix + ": ").strip().lower()
    if not value:
        return default
    return value in {"y", "yes"}


def load_env_template() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_EXAMPLE.exists():
        for k, v in dotenv_values(ENV_EXAMPLE).items():
            values[k] = v or ""
    if ENV_FILE.exists():
        for k, v in dotenv_values(ENV_FILE).items():
            if v is not None:
                values[k] = v
    return values


def write_env(values: dict[str, str]) -> None:
    order = [
        "APP_SECRET", "APP_BASE_URL", "ACCESS_TOKEN_MINUTES", "REQUIRE_PAID_ACCESS",
        "DATABASE_URL", "OPENAI_API_KEY", "OPENAI_MODEL",
        "ADMIN_EMAIL", "ADMIN_PASSWORD",
        "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
        "PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET", "PAYPAL_BASE_URL", "PAYPAL_WEBHOOK_ID",
    ]
    groups = {
        "APP_SECRET": "# Application",
        "DATABASE_URL": "# PostgreSQL",
        "OPENAI_API_KEY": "# OpenAI (optional)",
        "ADMIN_EMAIL": "# Bootstrap admin (password intentionally not persisted by auto-setup)",
        "STRIPE_SECRET_KEY": "# Stripe TEST MODE only for local testing",
        "PAYPAL_CLIENT_ID": "# PayPal SANDBOX only for local testing",
    }
    lines: list[str] = []
    emitted = set()
    for key in order:
        if key in groups:
            if lines and lines[-1] != "":
                lines.append("")
            lines.append(groups[key])
        value = values.get(key, "")
        if key == "ADMIN_PASSWORD":
            value = ""  # never persist an admin password from interactive setup
        lines.append(f"{key}={value}")
        emitted.add(key)
    for key in sorted(set(values) - emitted):
        lines.append(f"{key}={values[key]}")
    ENV_FILE.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def admin_conn(host: str, port: int, admin_user: str, admin_password: str, admin_db: str):
    try:
        import psycopg
    except ImportError as exc:
        raise SystemExit("psycopg is not installed. Run SETUP_LOCAL_WINDOWS.bat so dependencies are installed first.") from exc
    return psycopg.connect(
        host=host, port=port, user=admin_user, password=admin_password,
        dbname=admin_db, autocommit=True, connect_timeout=8,
    )


def ensure_postgres(host: str, port: int, admin_user: str, admin_password: str,
                    admin_db: str, app_user: str, app_password: str, db_name: str) -> None:
    try:
        import psycopg
        from psycopg import sql
    except ImportError as exc:
        raise SystemExit("psycopg is not installed. Run SETUP_LOCAL_WINDOWS.bat so dependencies are installed first.") from exc
    print("\n[1/5] Connecting to PostgreSQL as local administrator...")
    try:
        conn = admin_conn(host, port, admin_user, admin_password, admin_db)
    except Exception as exc:
        raise SystemExit(
            "\nCould not connect to PostgreSQL. Make sure the PostgreSQL service is running, "
            "the host/port are correct, and the postgres/admin password is correct.\n"
            f"Details: {exc}"
        )

    with conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (app_user,))
            role_exists = cur.fetchone() is not None
            if role_exists:
                print(f"  PostgreSQL role '{app_user}' already exists — updating its local app password.")
                cur.execute(
                    sql.SQL("ALTER ROLE {} WITH LOGIN PASSWORD {}").format(
                        sql.Identifier(app_user), sql.Literal(app_password)
                    )
                )
            else:
                print(f"  Creating PostgreSQL role '{app_user}'.")
                cur.execute(
                    sql.SQL("CREATE ROLE {} WITH LOGIN PASSWORD {}").format(
                        sql.Identifier(app_user), sql.Literal(app_password)
                    )
                )

            cur.execute("SELECT 1 FROM pg_database WHERE datname=%s", (db_name,))
            db_exists = cur.fetchone() is not None
            if not db_exists:
                print(f"  Creating database '{db_name}'.")
                cur.execute(sql.SQL("CREATE DATABASE {} OWNER {}").format(sql.Identifier(db_name), sql.Identifier(app_user)))
            else:
                print(f"  Database '{db_name}' already exists — reusing it.")
                cur.execute(sql.SQL("ALTER DATABASE {} OWNER TO {}").format(sql.Identifier(db_name), sql.Identifier(app_user)))
    conn.close()

    print("  Ensuring schema/object ownership and privileges...")
    try:
        with admin_conn(host, port, admin_user, admin_password, db_name) as conn2:
            with conn2.cursor() as cur:
                # The database may have been partially initialized by an earlier setup run
                # under the PostgreSQL administrator account.  In that case, existing
                # tables/sequences can block SQLAlchemy even though the dedicated app user
                # can connect.  Transfer public-schema application objects to the app role.
                cur.execute(sql.SQL("GRANT ALL ON SCHEMA public TO {}").format(sql.Identifier(app_user)))
                cur.execute(sql.SQL("ALTER SCHEMA public OWNER TO {}").format(sql.Identifier(app_user)))

                cur.execute("""
                    SELECT c.relname, c.relkind
                    FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'public'
                      AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
                    ORDER BY c.relkind, c.relname
                """)
                objects = cur.fetchall()
                if objects:
                    print(f"  Found {len(objects)} existing public-schema object(s); ensuring Azielon ownership.")
                for relname, relkind in objects:
                    if relkind in ('r', 'p'):
                        stmt = sql.SQL("ALTER TABLE {}.{} OWNER TO {}").format(
                            sql.Identifier('public'), sql.Identifier(relname), sql.Identifier(app_user)
                        )
                    elif relkind == 'S':
                        stmt = sql.SQL("ALTER SEQUENCE {}.{} OWNER TO {}").format(
                            sql.Identifier('public'), sql.Identifier(relname), sql.Identifier(app_user)
                        )
                    elif relkind == 'v':
                        stmt = sql.SQL("ALTER VIEW {}.{} OWNER TO {}").format(
                            sql.Identifier('public'), sql.Identifier(relname), sql.Identifier(app_user)
                        )
                    elif relkind == 'm':
                        stmt = sql.SQL("ALTER MATERIALIZED VIEW {}.{} OWNER TO {}").format(
                            sql.Identifier('public'), sql.Identifier(relname), sql.Identifier(app_user)
                        )
                    else:
                        continue
                    cur.execute(stmt)

                cur.execute(sql.SQL("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO {}").format(sql.Identifier(app_user)))
                cur.execute(sql.SQL("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO {}").format(sql.Identifier(app_user)))
                cur.execute(sql.SQL("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO {}").format(sql.Identifier(app_user)))
                cur.execute(sql.SQL("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO {}").format(sql.Identifier(app_user)))
    except Exception as exc:
        raise SystemExit(f"Could not repair Azielon database ownership/privileges: {exc}")

    print("  Testing the dedicated Azielon database login...")
    with psycopg.connect(host=host, port=port, user=app_user, password=app_password,
                         dbname=db_name, connect_timeout=8) as test_conn:
        with test_conn.cursor() as cur:
            cur.execute("SELECT current_database(), current_user, version()")
            dbn, usr, ver = cur.fetchone()
            print(f"  Connected as '{usr}' to '{dbn}' ({ver.split(',')[0]}).")


def run_python(script: str, extra_env: dict[str, str] | None = None) -> None:
    env = os.environ.copy()
    # Ensure project modules (for example `backend`) are importable from every
    # helper script, including on Windows when scripts are launched by path.
    current_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(ROOT) + (os.pathsep + current_pythonpath if current_pythonpath else "")
    if extra_env:
        env.update(extra_env)
    subprocess.run([sys.executable, str(ROOT / script)], cwd=ROOT, env=env, check=True)


def main() -> None:
    ap = argparse.ArgumentParser(description="Bootstrap local Azielon PostgreSQL + application database")
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--port", type=int, default=5432)
    ap.add_argument("--admin-user", default="postgres")
    ap.add_argument("--admin-db", default="postgres")
    ap.add_argument("--app-user", default="azielon")
    ap.add_argument("--db-name", default="azielon_pmp")
    ap.add_argument("--no-admin-account", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    print("=" * 66)
    print(" Azielon PMP Coach — Local PostgreSQL Auto Setup")
    print("=" * 66)
    print("This setup will create/reuse a dedicated PostgreSQL role and database,")
    print("configure .env, initialize tables/content, and verify the installation.")
    print("Your PostgreSQL administrator password is used only in memory.\n")

    host = prompt("PostgreSQL host", args.host)
    port = int(prompt("PostgreSQL port", str(args.port)))
    admin_user = prompt("PostgreSQL administrator user", args.admin_user)
    admin_db = prompt("PostgreSQL maintenance database", args.admin_db)
    app_user = prompt("Azielon database user", args.app_user)
    db_name = prompt("Azielon database name", args.db_name)

    if args.dry_run:
        print("\nDry run only — no database changes were made.")
        print({"host": host, "port": port, "admin_user": admin_user, "admin_db": admin_db,
               "app_user": app_user, "db_name": db_name})
        return

    admin_password = getpass.getpass(f"Password for PostgreSQL admin user '{admin_user}': ")
    if not admin_password:
        raise SystemExit("Administrator password cannot be empty.")

    # Dedicated app password is intentionally generated and then written only in DATABASE_URL.
    app_password = secrets.token_urlsafe(28)
    ensure_postgres(host, port, admin_user, admin_password, admin_db, app_user, app_password, db_name)

    print("\n[2/5] Writing local application configuration...")
    env = load_env_template()
    if not env.get("APP_SECRET") or env.get("APP_SECRET") in PLACEHOLDERS or len(env.get("APP_SECRET", "")) < 32:
        env["APP_SECRET"] = secrets.token_urlsafe(64)
    env.setdefault("APP_BASE_URL", "http://localhost:8000")
    env.setdefault("ACCESS_TOKEN_MINUTES", "720")
    env.setdefault("REQUIRE_PAID_ACCESS", "true")
    env.setdefault("PAYMENT_MODE", "test")
    env.setdefault("PAYPAL_BASE_URL", "https://api-m.sandbox.paypal.com")
    encoded_pw = quote_plus(app_password)
    env["DATABASE_URL"] = f"postgresql+psycopg://{app_user}:{encoded_pw}@{host}:{port}/{db_name}"
    env["ADMIN_PASSWORD"] = ""
    write_env(env)
    print(f"  Wrote {ENV_FILE.name}. PostgreSQL admin credentials were NOT saved.")

    print("\n[3/5] Creating application tables and seeding Azielon content...")
    run_python("scripts/init_app_db.py")

    print("\n[4/5] Optional admin account...")
    if not args.no_admin_account and yes_no("Create or update an Azielon admin login now?", True):
        email = prompt("Admin email", env.get("ADMIN_EMAIL") if env.get("ADMIN_EMAIL") not in {"", "admin@example.com"} else None)
        if email:
            while True:
                pw1 = getpass.getpass("Admin password (not saved to .env): ")
                pw2 = getpass.getpass("Confirm admin password: ")
                if len(pw1) < 10:
                    print("  Please use at least 10 characters.")
                    continue
                if pw1 != pw2:
                    print("  Passwords do not match. Try again.")
                    continue
                break
            env["ADMIN_EMAIL"] = email
            write_env(env)
            run_python("scripts/create_admin.py", {"ADMIN_EMAIL": email, "ADMIN_PASSWORD": pw1})
        else:
            print("  Skipped admin creation.")
    else:
        print("  Skipped admin creation.")

    print("\n[5/5] Verifying PostgreSQL + seeded content...")
    run_python("scripts/db_check.py")
    run_python("scripts/verify_install.py")

    print("\n" + "=" * 66)
    print(" Setup complete")
    print("=" * 66)
    print("Start the app with:")
    print("  Windows: RUN_LOCAL_WINDOWS.bat")
    print("  PowerShell: .\\.venv\\Scripts\\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000")
    print("Then open: http://localhost:8000")
    print("\nStripe/PayPal keys are optional and can be pasted into .env when you are ready to test payments.")


if __name__ == "__main__":
    main()
