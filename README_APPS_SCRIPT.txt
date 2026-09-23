AZIELON PMP COACH v4.3.8 — GOOGLE APPS SCRIPT MAIL PATCH

WHY
Render Free blocks outbound SMTP ports such as 587. This patch sends email over HTTPS to a Google Apps Script web app, which then sends mail using Google Workspace/Gmail.

FILES
1) backend/main.py — replace your existing backend/main.py
2) Code.gs — paste into a new Google Apps Script project

GOOGLE APPS SCRIPT SETUP
1. Open https://script.google.com and create a New project.
2. Replace Code.gs contents with the supplied Code.gs.
3. Project Settings -> Script properties -> Add script property:
     Property: PMP_MAIL_SECRET
     Value: <a long random secret>
4. Deploy -> New deployment -> Select type: Web app
     Execute as: Me
     Who has access: Anyone
5. Authorize the script when prompted.
6. Copy the Web app URL ending in /exec.

RENDER ENVIRONMENT VARIABLES
Add:
  GOOGLE_APPS_SCRIPT_MAIL_URL=<the /exec web app URL>
  GOOGLE_APPS_SCRIPT_MAIL_SECRET=<the exact same secret as Apps Script>

Keep:
  APP_BASE_URL=https://pmp.azielon.com
  PASSWORD_RESET_MODE=prod
  PROGRAM_REGISTRATION_NOTIFY_EMAIL=azi@azielon.com
  ADMIN_EMAIL=azi@azielon.com
  ADMIN_PASSWORD=<your existing strong admin password>

You may delete these SMTP variables because this patch no longer uses them:
  SMTP_HOST
  SMTP_PORT
  SMTP_USERNAME
  SMTP_PASSWORD
  SMTP_FROM
  SMTP_USE_TLS

GITHUB
Replace backend/main.py and push:
  git add backend/main.py
  git commit -m "Use Google Apps Script for production email"
  git push

TEST
After Render redeploys:
1. Go to https://pmp.azielon.com
2. Forgot password -> enter azi@azielon.com -> Send reset link
3. Render should log:
     [password-reset] Reset email sent to azi@azielon.com
4. Check inbox/spam and click the reset link.

SECURITY
Do not put GOOGLE_APPS_SCRIPT_MAIL_SECRET in GitHub.
Keep the Web App URL and secret only in Render/Apps Script settings.
If the secret is exposed, rotate it in both places.
