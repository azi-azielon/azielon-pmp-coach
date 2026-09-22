from backend.db import SessionLocal
from backend.models import BillingPlan, CheckoutOrder, Entitlement

db=SessionLocal()
try:
    print('Plans:', db.query(BillingPlan).count())
    for p in db.query(BillingPlan).order_by(BillingPlan.tier_code,BillingPlan.duration_days):
        print(p.code, p.name, p.cadence, f'${p.amount_cents/100:.2f}', p.duration_days, 'days')
    print('Orders:', db.query(CheckoutOrder).count())
    print('Entitlements:', db.query(Entitlement).count())
finally:
    db.close()
