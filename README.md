# Azielon PMP Practice Coach v4.2.8 — Clean Local Build

This package contains only the files required to set up and run the current Windows/PostgreSQL version of Azielon PMP Practice Coach.

## First-time setup

1. Make sure PostgreSQL is running.
2. Double-click `SETUP_LOCAL_WINDOWS.bat`.
3. Enter your PostgreSQL administrator credentials when prompted.
4. The setup creates/reuses the Azielon PostgreSQL role and `azielon_pmp` database, installs dependencies, creates tables, seeds content, and verifies the installation.

You do **not** need to delete an existing Azielon database. The setup reuses it.

## Start the app

After setup, double-click:

`RUN_LOCAL_WINDOWS.bat`

The browser opens:

`http://localhost:8000/?build=428`

On normal days, use only `RUN_LOCAL_WINDOWS.bat`.

## Important folders

- `backend/` — FastAPI application, database models, billing, security, APIs
- `data/` — approved questions, exams, notes, tricky words, and diagram metadata
- `protected_assets/` — protected Premium diagram images
- `scripts/` — database/bootstrap/verification utilities
- `static/` — application HTML, CSS, JavaScript, and logo

## Configuration

`.env.example` contains the supported environment settings. The setup creates `.env` locally.

Payment and AI credentials can be added to `.env` later.

## Included launcher files

There are intentionally only two Windows `.bat` files:

- `SETUP_LOCAL_WINDOWS.bat` — first-time/setup/update database initialization
- `RUN_LOCAL_WINDOWS.bat` — start the current app

Historical launchers, old release notes, test databases, tests, caches, and backup files have been removed from this clean package.


## v4.2.9 database update
Run `SETUP_LOCAL_WINDOWS.bat` once after upgrading so PostgreSQL creates the `pmp_class_registration_leads` table used by the live-class registration form.

## v4.3.0 payment and domain notes

- Live PMP class registration no longer opens a Google Form.
- After the learner selects an eligible class date, Azielon saves the lead and opens the secure Autobooks payment page:
  `https://app.autobooks.co/pay/azie`
- PayPal has been removed from the visible learner billing interface.
- Recommended production hostname: `https://pmp.azielon.com`
- Set `APP_BASE_URL=https://pmp.azielon.com` in production.

## v4.3.1 program registration administration

Instructor Studio now includes **Program Registrations** with learner name, email, preferred class date, price, payment status, and admin actions.

Because the Autobooks Payment Link is an external hosted payment page and no public webhook integration is configured in this build, the application cannot independently verify an Autobooks payment in real time. Autobooks itself can email the merchant when a payment is submitted. After that notification is received, an Azielon admin can click **Mark paid + email** in Instructor Studio. The app then records the paid status and sends the detailed Azielon program-registration email to `PROGRAM_REGISTRATION_NOTIFY_EMAIL`.

The email uses the same SMTP settings as password-reset email.


## v4.3.2 updates
- Fixed the local secure-card test-payment modal; the submit button and form closing markup are restored.
- Live PMP cohorts can only start on Tuesday. The Tuesday in Thanksgiving week and the Tuesday in Christmas week are excluded.
- Founder name is shown as **Dr. Sonia Gandham, PMP®, CSM®**.
- Registration confirmation email is intentionally sent **after payment is confirmed**, not before. Because Autobooks does not currently notify this app through a configured webhook, the admin action **Mark paid + email** is the confirmation point. It sends the admin registration email to `azi@azielon.com` and a learner confirmation email to the registrant.

## v4.3.3 email behavior

There are now two email moments:

1. **When a learner selects a class date:** Azielon saves the registration and attempts to email `azi@azielon.com` that a registration has started and payment is pending.
2. **After payment is confirmed:** In Instructor Studio → Program Registrations, click **Mark paid + email**. This sends the paid-registration email to `azi@azielon.com` and the confirmation email to the learner.

Autobooks is an external hosted payment page and is not currently connected to this app by a verified payment webhook, so the app cannot know automatically that payment completed. The admin confirmation action is still required after Autobooks confirms the payment.

### SMTP configuration

Emails will not send until `.env` contains working SMTP credentials:

```
SMTP_HOST=...
SMTP_PORT=587
SMTP_USERNAME=...
SMTP_PASSWORD=...
SMTP_FROM=...
SMTP_USE_TLS=true
PROGRAM_REGISTRATION_NOTIFY_EMAIL=azi@azielon.com
```

Instructor Studio now shows **Email ready** or **Email not configured**, and includes a **Send test email** button.


## v4.3.4 hosted plan payments

All learner-facing PMP app tier payment buttons now open the same secure Autobooks hosted payment page:

`https://app.autobooks.co/pay/azie`

Azielon does not collect, store, or validate credit-card details for these hosted payments.

## v4.3.5 payment architecture

### PMP Practice Coach tiers
Tier purchases use Stripe Checkout.

- Local development: `PAYMENT_MODE=test` uses the built-in dummy-card flow.
- Production: set `PAYMENT_MODE=prod`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`.
- Stripe Checkout returns the learner to `APP_BASE_URL`, and the app grants the purchased entitlement after payment confirmation.
- Recommended production base URL: `https://pmp.azielon.com`.

### Live PMP Online Class
The live $999 instructor-led program remains separate from app-tier billing.

Public page:

`https://pmp.azielon.com/live-pmp`

This page:
1. captures the learner's name, email, and eligible Tuesday start date;
2. saves the registration in PostgreSQL;
3. opens the secure Autobooks hosted payment page.

Autobooks payment URL:

`https://app.autobooks.co/pay/azie`

The Tuesday in Thanksgiving week and the Tuesday in Christmas week are excluded.
