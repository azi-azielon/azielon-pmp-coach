# Azielon PMP — Helcim production setup (v4.3.10)

This build replaces the customer-facing Autobooks flow with HelcimPay.js.

## Pricing behavior
- Weekly plans: recurring subscriptions
- Monthly plans: recurring subscriptions
- 3-month plans: one-time payment / 90 days of access
- Checkout offers ACH + card. One-time purchases use Fee Saver when `HELCIM_FEE_SAVER=true`.

## Render environment variables
Set these in Render, never GitHub:

```
HELCIM_API_TOKEN=<Helcim API token>
HELCIM_WEBHOOK_VERIFIER_TOKEN=<Helcim webhook verifier token>
HELCIM_FEE_SAVER=true
HELCIM_PLAN_FULL_WEEKLY_ID=<numeric Helcim recurring plan ID>
HELCIM_PLAN_FULL_MONTHLY_ID=<numeric Helcim recurring plan ID>
HELCIM_PLAN_CONCEPT_WEEKLY_ID=<numeric Helcim recurring plan ID>
HELCIM_PLAN_CONCEPT_MONTHLY_ID=<numeric Helcim recurring plan ID>
HELCIM_PLAN_DRILLS_WEEKLY_ID=<numeric Helcim recurring plan ID>
HELCIM_PLAN_DRILLS_MONTHLY_ID=<numeric Helcim recurring plan ID>
```

Keep the existing Apps Script mail variables and `APP_BASE_URL=https://pmp.azielon.com`.

## Helcim recurring plans to create
In Helcim: All Tools → Recurring → Create New Plan. Create six plans, all **On sign-up**, **Forever**, no trial, no setup fee:

| Plan | Amount | Period |
|---|---:|---|
| Full PMP Prep — Weekly | $29 | Weekly |
| Full PMP Prep — Monthly | $69 | Monthly |
| Concept + Exam Prep — Weekly | $19 | Weekly |
| Concept + Exam Prep — Monthly | $45 | Monthly |
| Exam Drills & Simulator — Weekly | $12 | Weekly |
| Exam Drills & Simulator — Monthly | $29 | Monthly |

Allow the payment method(s) you want available for subscriptions. After each plan is created, copy its numeric plan ID into the matching Render variable above.

## Webhook
In Helcim → Integrations → Webhooks:
- Turn Webhooks ON
- Deliver URL: `https://pmp.azielon.com/api/billing/helcim/webhook`
- Enable **Card Transaction**
- Copy the Verifier Token into `HELCIM_WEBHOOK_VERIFIER_TOKEN` in Render

The code verifies Helcim's HMAC-SHA256 webhook signature before processing events.

## Deploy
Replace the project files with this build, then:

```bash
git add .
git commit -m "Add Helcim ACH card and recurring billing"
git push
```

Render should redeploy automatically.

## Important
The backend initializes HelcimPay.js; the API token never goes to the browser. HelcimPay.js collects card/bank information, so Azielon does not store raw payment credentials.
