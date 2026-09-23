import os, json, uuid, time, hmac, hashlib, re
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

import httpx
from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from .models import BillingPlan, CheckoutOrder, Entitlement, PaymentWebhookEvent, User


def utcnow():
    return datetime.utcnow()


def seed_billing_plans(db: Session):
    plans = [
        ('full_weekly','full','Full PMP Prep','weekly',7,2900),
        ('full_monthly','full','Full PMP Prep','monthly',30,6900),
        ('full_3month','full','Full PMP Prep','3-month',90,14900),
        ('concept_weekly','concept','Concept + Exam Prep','weekly',7,1900),
        ('concept_monthly','concept','Concept + Exam Prep','monthly',30,4500),
        ('concept_3month','concept','Concept + Exam Prep','3-month',90,9900),
        ('drills_weekly','drills','Exam Drills & Simulator','weekly',7,1200),
        ('drills_monthly','drills','Exam Drills & Simulator','monthly',30,2900),
        ('drills_3month','drills','Exam Drills & Simulator','3-month',90,6900),
    ]
    features = {
        'full':[
            'All practice modes','Full Mock Exams 1–2','Concept Mastery Exams 3–5',
            'Rule-review modes','All diagrams & visual exhibits','AI Coach',
            'Topic notes','Tricky words','Review queue','Progress analytics'
        ],
        'concept':[
            'Standard practice','Topic notes','Tricky words','PMP decision rules',
            'Concept Mastery Exams 3–5','10 Rules → 10 Questions',
            'Review All Rules First','Rules Review Only','Review queue','Progress analytics'
        ],
        'drills':[
            'Standard practice','Timed practice','Full Mock Exams 1–2',
            'Review queue','Bookmarks','Progress analytics'
        ]
    }
    changed=False
    for code,tier,name,cadence,duration,amount in plans:
        row=db.get(BillingPlan, code)
        if not row:
            row=BillingPlan(code=code,tier_code=tier,name=name,cadence=cadence,duration_days=duration,amount_cents=amount,currency='USD',features_json=json.dumps(features[tier]),active=True)
            db.add(row); changed=True
        else:
            row.tier_code=tier; row.name=name; row.cadence=cadence; row.duration_days=duration; row.amount_cents=amount; row.currency='USD'; row.features_json=json.dumps(features[tier]); row.active=True
            changed=True
    if changed: db.commit()


def catalog(db: Session):
    rows=db.query(BillingPlan).filter(BillingPlan.active==True).order_by(BillingPlan.tier_code,BillingPlan.amount_cents).all()
    return [{
        'code':r.code,'tier_code':r.tier_code,'name':r.name,'cadence':r.cadence,'duration_days':r.duration_days,
        'amount_cents':r.amount_cents,'currency':r.currency,'features':json.loads(r.features_json or '[]')
    } for r in rows]


def current_entitlement(db: Session, user_id: int):
    now=utcnow()
    rows=db.query(Entitlement).filter(Entitlement.user_id==user_id,Entitlement.status=='active').order_by(Entitlement.ends_at.desc()).all()
    for e in rows:
        if e.ends_at and e.ends_at > now:
            return e
        if e.ends_at and e.ends_at <= now:
            e.status='expired'
    db.commit()
    return None


def entitlement_payload(e: Optional[Entitlement]):
    if not e: return None
    return {'id':e.id,'tier_code':e.tier_code,'status':e.status,'starts_at':e.starts_at.isoformat() if e.starts_at else None,'ends_at':e.ends_at.isoformat() if e.ends_at else None,'provider':e.provider,'plan_code':e.plan_code}


def grant_entitlement(db: Session, order: CheckoutOrder):
    if order.entitlement_granted:
        return current_entitlement(db, order.user_id)
    plan=db.get(BillingPlan, order.plan_code)
    if not plan: raise HTTPException(500,'Billing plan not found')
    now=utcnow()
    current=current_entitlement(db, order.user_id)
    start = current.ends_at if current and current.ends_at and current.ends_at > now and current.tier_code==plan.tier_code else now
    end = start + timedelta(days=plan.duration_days)
    ent=Entitlement(user_id=order.user_id,tier_code=plan.tier_code,plan_code=plan.code,source_order_id=order.id,provider=order.provider,status='active',starts_at=start,ends_at=end)
    db.add(ent)
    order.entitlement_granted=True
    order.paid_at=order.paid_at or now
    order.status='paid'
    db.commit(); db.refresh(ent)
    return ent


def create_local_order(db: Session, user: User, plan: BillingPlan, provider: str):
    order=CheckoutOrder(id=str(uuid.uuid4()),user_id=user.id,plan_code=plan.code,provider=provider,amount_cents=plan.amount_cents,currency=plan.currency,status='created')
    db.add(order); db.commit(); db.refresh(order)
    return order




def payment_mode():
    mode=os.getenv('PAYMENT_MODE','test').strip().lower()
    return mode if mode in ('test','prod') else 'test'


def test_checkout(db: Session, user: User, plan_code: str, method: str, details: dict):
    if payment_mode() != 'test':
        raise HTTPException(403,'Dummy checkout is disabled in production mode')
    plan=db.get(BillingPlan, plan_code)
    if not plan or not plan.active:
        raise HTTPException(404,'Plan not found')
    method=(method or '').strip().lower()
    if method not in ('card','paypal'):
        raise HTTPException(400,'Unsupported test payment method')
    # Relaxed validation for local testing only. Never process or persist real credentials here.
    if method == 'card':
        number=''.join(ch for ch in str(details.get('card_number','')) if ch.isdigit())
        if len(number) < 12:
            raise HTTPException(400,'Enter a dummy card number for test mode')
        if not str(details.get('expiry','')).strip():
            raise HTTPException(400,'Enter a dummy expiration date')
        if len(''.join(ch for ch in str(details.get('cvv','')) if ch.isdigit())) < 3:
            raise HTTPException(400,'Enter a dummy CVV')
        masked='*' * max(0,len(number)-4) + number[-4:]
        safe={'mode':'test','method':'card','card_last4':number[-4:],'masked_card':masked}
        provider='test_card'
    else:
        email=str(details.get('paypal_email','')).strip()
        password=str(details.get('paypal_password','')).strip()
        if not email or '@' not in email:
            raise HTTPException(400,'Enter a dummy PayPal email for test mode')
        if len(password) < 3:
            raise HTTPException(400,'Enter a dummy PayPal password for test mode')
        safe={'mode':'test','method':'paypal','paypal_email':email}
        provider='test_paypal'
    order=create_local_order(db,user,plan,provider)
    order.provider_order_id='TEST-'+str(uuid.uuid4())
    order.provider_capture_id='TEST-CAPTURE-'+str(uuid.uuid4())
    order.raw_json=json.dumps(safe)
    ent=grant_entitlement(db,order)
    return {'paid':True,'test_mode':True,'order_id':order.id,'entitlement':entitlement_payload(ent)}


def _stripe_headers():
    key=os.getenv('STRIPE_SECRET_KEY')
    if not key: raise HTTPException(503,'Stripe is not configured')
    return {'Authorization':f'Bearer {key}'}


def stripe_checkout(db: Session, user: User, plan_code: str):
    plan=db.get(BillingPlan, plan_code)
    if not plan or not plan.active: raise HTTPException(404,'Plan not found')
    order=create_local_order(db,user,plan,'stripe')
    base=os.getenv('APP_BASE_URL','http://localhost:8000').rstrip('/')
    data={
        'mode':'payment',
        'customer_email':user.email,
        'success_url':f'{base}/?billing=stripe-success&session_id={{CHECKOUT_SESSION_ID}}',
        'cancel_url':f'{base}/?billing=cancelled',
        'metadata[local_order_id]':order.id,
        'metadata[plan_code]':plan.code,
        'metadata[user_id]':str(user.id),
        'line_items[0][price_data][currency]':plan.currency.lower(),
        'line_items[0][price_data][unit_amount]':str(plan.amount_cents),
        'line_items[0][price_data][product_data][name]':f'{plan.name} — {plan.cadence}',
        'line_items[0][price_data][product_data][description]':f'{plan.duration_days} days of Azielon PMP access',
        'line_items[0][quantity]':'1',
    }
    try:
        r=httpx.post('https://api.stripe.com/v1/checkout/sessions',headers=_stripe_headers(),data=data,timeout=30)
        if r.status_code>=400: raise RuntimeError(r.text)
        s=r.json()
    except Exception as e:
        order.status='failed'; order.raw_json=json.dumps({'error':str(e)}); db.commit()
        raise HTTPException(502,'Unable to create Stripe Checkout Session')
    order.provider_order_id=s.get('id'); order.raw_json=json.dumps({'checkout_url':s.get('url')}); db.commit()
    return {'order_id':order.id,'provider_order_id':s.get('id'),'checkout_url':s.get('url')}


def confirm_stripe_session(db: Session, user: User, session_id: str):
    order=db.query(CheckoutOrder).filter(CheckoutOrder.provider=='stripe',CheckoutOrder.provider_order_id==session_id,CheckoutOrder.user_id==user.id).first()
    if not order: raise HTTPException(404,'Checkout order not found')
    if order.status=='paid': return {'paid':True,'entitlement':entitlement_payload(current_entitlement(db,user.id))}
    r=httpx.get(f'https://api.stripe.com/v1/checkout/sessions/{session_id}',headers=_stripe_headers(),timeout=30)
    if r.status_code>=400: raise HTTPException(502,'Unable to verify Stripe Checkout Session')
    s=r.json()
    if s.get('payment_status')=='paid':
        order.provider_capture_id=s.get('payment_intent')
        order.raw_json=json.dumps(s)
        ent=grant_entitlement(db,order)
        return {'paid':True,'entitlement':entitlement_payload(ent)}
    return {'paid':False,'status':s.get('payment_status')}


def _verify_stripe_signature(payload: bytes, sig_header: str, secret: str, tolerance: int=300):
    parts={}
    for item in sig_header.split(','):
        if '=' in item:
            k,v=item.split('=',1); parts.setdefault(k,[]).append(v)
    try: ts=int(parts.get('t',['0'])[0])
    except: raise HTTPException(400,'Invalid Stripe signature timestamp')
    if abs(int(time.time())-ts)>tolerance: raise HTTPException(400,'Stale Stripe webhook signature')
    signed=str(ts).encode()+b'.'+payload
    expected=hmac.new(secret.encode(),signed,hashlib.sha256).hexdigest()
    if not any(hmac.compare_digest(expected,x) for x in parts.get('v1',[])):
        raise HTTPException(400,'Invalid Stripe webhook signature')


def process_stripe_webhook(db: Session, payload: bytes, sig_header: str):
    secret=os.getenv('STRIPE_WEBHOOK_SECRET')
    if not secret: raise HTTPException(503,'Stripe webhook secret not configured')
    _verify_stripe_signature(payload,sig_header,secret)
    try: event=json.loads(payload)
    except: raise HTTPException(400,'Invalid Stripe webhook payload')
    eid=event.get('id')
    if db.query(PaymentWebhookEvent).filter(PaymentWebhookEvent.provider=='stripe',PaymentWebhookEvent.event_id==eid).first():
        return {'received':True,'duplicate':True}
    rec=PaymentWebhookEvent(provider='stripe',event_id=eid,event_type=event.get('type',''),payload_json=payload.decode('utf-8','ignore'),status='received')
    db.add(rec); db.commit()
    obj=event.get('data',{}).get('object',{})
    if event.get('type') in ('checkout.session.completed','checkout.session.async_payment_succeeded') and obj.get('payment_status')=='paid':
        local_order_id=(obj.get('metadata') or {}).get('local_order_id')
        order=db.get(CheckoutOrder,local_order_id) if local_order_id else None
        if order:
            order.provider_order_id=obj.get('id') or order.provider_order_id
            order.provider_capture_id=obj.get('payment_intent')
            grant_entitlement(db,order)
    rec.status='processed'; rec.processed_at=utcnow(); db.commit()
    return {'received':True}


async def paypal_access_token():
    cid=os.getenv('PAYPAL_CLIENT_ID'); secret=os.getenv('PAYPAL_CLIENT_SECRET')
    if not cid or not secret: raise HTTPException(503,'PayPal is not configured')
    base=os.getenv('PAYPAL_BASE_URL','https://api-m.sandbox.paypal.com').rstrip('/')
    async with httpx.AsyncClient(timeout=30) as client:
        r=await client.post(base+'/v1/oauth2/token',auth=(cid,secret),data={'grant_type':'client_credentials'},headers={'Accept':'application/json'})
    if r.status_code>=400: raise HTTPException(502,'Unable to authenticate with PayPal')
    return r.json()['access_token']


async def paypal_create_order(db: Session, user: User, plan_code: str):
    plan=db.get(BillingPlan,plan_code)
    if not plan or not plan.active: raise HTTPException(404,'Plan not found')
    token=await paypal_access_token()
    base_api=os.getenv('PAYPAL_BASE_URL','https://api-m.sandbox.paypal.com').rstrip('/')
    base_app=os.getenv('APP_BASE_URL','http://localhost:8000').rstrip('/')
    order=create_local_order(db,user,plan,'paypal')
    body={
        'intent':'CAPTURE',
        'purchase_units':[{'reference_id':order.id,'custom_id':order.id,'description':f'{plan.name} — {plan.cadence}','amount':{'currency_code':plan.currency,'value':f'{plan.amount_cents/100:.2f}'}}],
        'payment_source':{},
        'application_context':{'brand_name':'Azielon','user_action':'PAY_NOW','return_url':f'{base_app}/?billing=paypal-return','cancel_url':f'{base_app}/?billing=cancelled'}
    }
    body.pop('payment_source',None)
    async with httpx.AsyncClient(timeout=30) as client:
        r=await client.post(base_api+'/v2/checkout/orders',headers={'Authorization':f'Bearer {token}','Content-Type':'application/json','PayPal-Request-Id':order.id},json=body)
    if r.status_code>=400:
        order.status='failed'; order.raw_json=r.text; db.commit(); raise HTTPException(502,'Unable to create PayPal order')
    data=r.json(); order.provider_order_id=data.get('id'); order.raw_json=json.dumps(data); db.commit()
    approve=next((x.get('href') for x in data.get('links',[]) if x.get('rel')=='approve'),None)
    if not approve: raise HTTPException(502,'PayPal approval URL missing')
    return {'order_id':order.id,'provider_order_id':order.provider_order_id,'approval_url':approve}


async def paypal_capture_order(db: Session, user: User, provider_order_id: str):
    order=db.query(CheckoutOrder).filter(CheckoutOrder.provider=='paypal',CheckoutOrder.provider_order_id==provider_order_id,CheckoutOrder.user_id==user.id).first()
    if not order: raise HTTPException(404,'PayPal order not found')
    if order.status=='paid': return {'paid':True,'entitlement':entitlement_payload(current_entitlement(db,user.id))}
    token=await paypal_access_token(); base=os.getenv('PAYPAL_BASE_URL','https://api-m.sandbox.paypal.com').rstrip('/')
    async with httpx.AsyncClient(timeout=30) as client:
        r=await client.post(base+f'/v2/checkout/orders/{provider_order_id}/capture',headers={'Authorization':f'Bearer {token}','Content-Type':'application/json','PayPal-Request-Id':f'capture-{order.id}'},json={})
    if r.status_code>=400: raise HTTPException(502,'Unable to capture PayPal order')
    data=r.json(); order.raw_json=json.dumps(data)
    if data.get('status')=='COMPLETED':
        captures=[]
        for pu in data.get('purchase_units',[]): captures += pu.get('payments',{}).get('captures',[])
        if captures: order.provider_capture_id=captures[0].get('id')
        ent=grant_entitlement(db,order)
        return {'paid':True,'entitlement':entitlement_payload(ent)}
    db.commit(); return {'paid':False,'status':data.get('status')}


async def verify_paypal_webhook(request: Request, body: dict):
    webhook_id=os.getenv('PAYPAL_WEBHOOK_ID')
    if not webhook_id: raise HTTPException(503,'PayPal webhook ID not configured')
    token=await paypal_access_token(); base=os.getenv('PAYPAL_BASE_URL','https://api-m.sandbox.paypal.com').rstrip('/')
    verify={
        'transmission_id':request.headers.get('paypal-transmission-id'),
        'transmission_time':request.headers.get('paypal-transmission-time'),
        'cert_url':request.headers.get('paypal-cert-url'),
        'auth_algo':request.headers.get('paypal-auth-algo'),
        'transmission_sig':request.headers.get('paypal-transmission-sig'),
        'webhook_id':webhook_id,
        'webhook_event':body,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        r=await client.post(base+'/v1/notifications/verify-webhook-signature',headers={'Authorization':f'Bearer {token}','Content-Type':'application/json'},json=verify)
    if r.status_code>=400 or r.json().get('verification_status')!='SUCCESS': raise HTTPException(400,'Invalid PayPal webhook signature')


async def process_paypal_webhook(db: Session, request: Request, body: dict):
    await verify_paypal_webhook(request,body)
    eid=body.get('id','')
    if db.query(PaymentWebhookEvent).filter(PaymentWebhookEvent.provider=='paypal',PaymentWebhookEvent.event_id==eid).first():
        return {'received':True,'duplicate':True}
    rec=PaymentWebhookEvent(provider='paypal',event_id=eid,event_type=body.get('event_type',''),payload_json=json.dumps(body),status='received')
    db.add(rec); db.commit()
    if body.get('event_type')=='PAYMENT.CAPTURE.COMPLETED':
        res=body.get('resource',{})
        provider_order_id=((res.get('supplementary_data') or {}).get('related_ids') or {}).get('order_id')
        order=db.query(CheckoutOrder).filter(CheckoutOrder.provider=='paypal',CheckoutOrder.provider_order_id==provider_order_id).first() if provider_order_id else None
        if order:
            order.provider_capture_id=res.get('id'); order.raw_json=json.dumps(body); grant_entitlement(db,order)
    rec.status='processed'; rec.processed_at=utcnow(); db.commit()
    return {'received':True}


def require_paid_access(user: User, db: Session):
    required=os.getenv('REQUIRE_PAID_ACCESS','false').lower() in ('1','true','yes','on')
    if not required:
        return True
    if user.role in ('admin','instructor','content_editor','reviewer'):
        return True
    ent=current_entitlement(db,user.id)
    if not ent:
        raise HTTPException(402,'Active paid access is required for this feature')
    return True



FEATURE_MATRIX = {
    'drills': {
        'practice','review','progress','bookmarks','mock1','mock2'
    },
    'concept': {
        'practice','review','progress','bookmarks','notes','tricky',
        'mastery3','mastery4','mastery5','rules','mastery_learning'
    },
    'full': {
        'practice','review','progress','bookmarks','notes','tricky','diagrams',
        'visual_questions','mock1','mock2','mastery3','mastery4','mastery5',
        'rules','mastery_learning','mastery_real_mock','ai_coach'
    },
}
STAFF_ROLES = {'admin','instructor','content_editor','reviewer'}

def user_tier(user: User, db: Session):
    if user.role in STAFF_ROLES:
        return 'full'
    required=os.getenv('REQUIRE_PAID_ACCESS','false').lower() in ('1','true','yes','on')
    if not required:
        return 'full'
    e=current_entitlement(db,user.id)
    return e.tier_code if e else None

def feature_set(user: User, db: Session):
    tier=user_tier(user,db)
    return set(FEATURE_MATRIX.get(tier,set()))

def has_feature(user: User, db: Session, feature: str):
    return feature in feature_set(user,db)

def require_feature(user: User, db: Session, feature: str, message: str|None=None):
    require_paid_access(user,db)
    if not has_feature(user,db,feature):
        raise HTTPException(403, message or 'Your plan does not include this feature')
    return True

def access_payload(user: User, db: Session):
    tier=user_tier(user,db)
    return {
        'tier_code': tier,
        'features': sorted(feature_set(user,db)),
        'feature_matrix': {k: sorted(v) for k,v in FEATURE_MATRIX.items()}
    }


# --- Autobooks payment-link integration ---
def autobooks_checkout(db: Session, user: User, plan_code: str):
    plan=db.get(BillingPlan, plan_code)
    if not plan or not plan.active:
        raise HTTPException(404,'Plan not found')
    payment_url=os.getenv('AUTOBOOKS_PAYMENT_URL','').strip()
    if not payment_url:
        raise HTTPException(503,'Autobooks payment link is not configured')
    order=create_local_order(db,user,plan,'autobooks')
    reference='PMP-'+order.id.replace('-','')[:8].upper()
    order.provider_order_id=reference
    order.raw_json=json.dumps({'payer_name':user.name,'payer_email':user.email,'payment_url':payment_url,'reference':reference})
    db.commit()
    return {'order_id':order.id,'reference':reference,'checkout_url':payment_url,'amount_cents':plan.amount_cents,'currency':plan.currency,'plan_name':plan.name,'cadence':plan.cadence,'payer_name':user.name,'payer_email':user.email}


def autobooks_order_status(db: Session, user: User, order_id: str):
    order=db.query(CheckoutOrder).filter(CheckoutOrder.id==order_id,CheckoutOrder.user_id==user.id,CheckoutOrder.provider=='autobooks').first()
    if not order:
        raise HTTPException(404,'Autobooks order not found')
    return {'order_id':order.id,'reference':order.provider_order_id,'status':order.status,'paid':bool(order.entitlement_granted),'entitlement':entitlement_payload(current_entitlement(db,user.id)) if order.entitlement_granted else None}


def process_autobooks_confirmation(db: Session, payload: dict, supplied_secret: str):
    expected=os.getenv('AUTOBOOKS_WEBHOOK_SECRET','').strip()
    if not expected:
        raise HTTPException(503,'Autobooks confirmation webhook is not configured')
    if not supplied_secret or not hmac.compare_digest(str(supplied_secret), expected):
        raise HTTPException(401,'Unauthorized')
    event_id=str(payload.get('event_id') or payload.get('message_id') or ('autobooks-'+str(uuid.uuid4()))).strip()
    existing=db.query(PaymentWebhookEvent).filter(PaymentWebhookEvent.provider=='autobooks',PaymentWebhookEvent.event_id==event_id).first()
    if existing:
        return {'received':True,'duplicate':True}
    reference=str(payload.get('reference') or '').strip().upper()
    payer_email=str(payload.get('payer_email') or '').strip().lower()
    payer_name=str(payload.get('payer_name') or '').strip().lower()
    try: amount_cents=int(payload.get('amount_cents') or 0)
    except Exception: amount_cents=0
    status=str(payload.get('status') or 'submitted').strip().lower()
    rec=PaymentWebhookEvent(provider='autobooks',event_id=event_id,event_type='payment.'+status,payload_json=json.dumps(payload),status='received')
    db.add(rec); db.commit()
    order=None
    if reference:
        order=db.query(CheckoutOrder).filter(CheckoutOrder.provider=='autobooks',CheckoutOrder.provider_order_id==reference).order_by(CheckoutOrder.created_at.desc()).first()
    if not order and amount_cents:
        candidates=db.query(CheckoutOrder).filter(CheckoutOrder.provider=='autobooks',CheckoutOrder.amount_cents==amount_cents,CheckoutOrder.status.in_(['created','pending'])).order_by(CheckoutOrder.created_at.desc()).limit(20).all()
        for candidate in candidates:
            try: meta=json.loads(candidate.raw_json or '{}')
            except Exception: meta={}
            if (payer_email and str(meta.get('payer_email','')).lower()==payer_email) or (payer_name and str(meta.get('payer_name','')).strip().lower()==payer_name):
                order=candidate; break
    if not order:
        rec.status='unmatched'; rec.processed_at=utcnow(); db.commit()
        return {'received':True,'matched':False}
    if status in ('submitted','incoming','paid','deposited','completed','succeeded'):
        order.status='paid'; order.provider_capture_id=event_id
        try: prior=json.loads(order.raw_json or '{}')
        except Exception: prior={}
        order.raw_json=json.dumps({**prior,'autobooks_confirmation':payload})
        ent=grant_entitlement(db,order)
        rec.status='processed'; rec.processed_at=utcnow(); db.commit()
        return {'received':True,'matched':True,'paid':True,'order_id':order.id,'entitlement':entitlement_payload(ent)}
    order.status=status or order.status
    rec.status='processed'; rec.processed_at=utcnow(); db.commit()
    return {'received':True,'matched':True,'paid':False,'order_id':order.id,'status':order.status}


# --- Helcim / HelcimPay.js integration ---
HELCIM_API_BASE = 'https://api.helcim.com/v2'


def _helcim_token():
    token=os.getenv('HELCIM_API_TOKEN','').strip()
    if not token:
        raise HTTPException(503,'Helcim is not configured')
    return token


def _helcim_headers(extra=None):
    h={'accept':'application/json','content-type':'application/json','api-token':_helcim_token()}
    if extra: h.update(extra)
    return h


def helcim_ready():
    return bool(os.getenv('HELCIM_API_TOKEN','').strip())


def _helcim_plan_id(plan_code: str):
    key='HELCIM_PLAN_'+plan_code.upper().replace('-','_')+'_ID'
    value=os.getenv(key,'').strip()
    if not value:
        raise HTTPException(503,f'Helcim recurring plan is not configured for {plan_code}')
    try: return int(value)
    except Exception: raise HTTPException(503,f'Invalid {key}')


def _order_meta(order: CheckoutOrder):
    try: return json.loads(order.raw_json or '{}')
    except Exception: return {}


def _save_order_meta(db: Session, order: CheckoutOrder, meta: dict):
    order.raw_json=json.dumps(meta, separators=(',',':'))
    db.commit()


def _helcim_is_recurring(plan: BillingPlan):
    return plan.cadence in ('weekly','monthly')


def _helcim_payment_method_from_response(data: dict):
    if data.get('bankToken') or str(data.get('type','')).upper() in ('WITHDRAWAL','ACH'):
        return 'bank'
    return 'card'


def _helcim_response_accepted(data: dict):
    status=str(data.get('status') or '').upper()
    status_auth=str(data.get('statusAuth') or '').upper()
    status_clearing=str(data.get('statusClearing') or '').upper()
    if status in ('APPROVED','APPROVAL'):
        return True
    # ACH is asynchronous. HelcimPay SUCCESS may initially report PENDING/OPENED.
    if status_auth in ('APPROVED','PENDING','IN_PROGRESS') and status_clearing not in ('REJECTED','RETURNED'):
        return True
    return False


def _helcim_validate_checkout_hash(meta: dict, payload: dict):
    secret=str(meta.get('secret_token') or '')
    received=str(payload.get('hash') or '')
    data=payload.get('data') or {}
    if not secret or not received or not isinstance(data,dict):
        raise HTTPException(400,'Incomplete Helcim checkout response')
    # Helcim hashes compact JSON(data) + secretToken with SHA-256.
    cleaned=json.dumps(data,separators=(',',':'),ensure_ascii=True)
    calculated=hashlib.sha256((cleaned+secret).encode()).hexdigest()
    if not hmac.compare_digest(calculated,received):
        raise HTTPException(400,'Invalid Helcim checkout response')
    return data


def helcim_start_checkout(db: Session, user: User, plan_code: str):
    plan=db.get(BillingPlan,plan_code)
    if not plan or not plan.active:
        raise HTTPException(404,'Plan not found')
    recurring=_helcim_is_recurring(plan)
    order=create_local_order(db,user,plan,'helcim')
    amount=round(plan.amount_cents/100,2)
    customer_request={'contactName': user.name or user.email}
    body={
        'paymentType':'verify' if recurring else 'purchase',
        'amount':0 if recurring else amount,
        'currency':plan.currency,
        'paymentMethod':'cc-ach',
        'setAsDefaultPaymentMethod':1,
        'confirmationScreen':True,
        'displayContactFields':1,
        'language':'en',
        'customerRequest':customer_request,
        'customStyling':{'ctaButtonText':'subscribe' if recurring else 'pay'}
    }
    if not recurring and os.getenv('HELCIM_FEE_SAVER','true').strip().lower() in ('1','true','yes','on'):
        body['hasConvenienceFee']=1
    try:
        r=httpx.post(HELCIM_API_BASE+'/helcim-pay/initialize',headers=_helcim_headers(),json=body,timeout=30)
        if r.status_code>=400:
            raise RuntimeError(r.text)
        hp=r.json()
        checkout_token=hp.get('checkoutToken'); secret_token=hp.get('secretToken')
        if not checkout_token or not secret_token:
            raise RuntimeError('Helcim response did not include checkout tokens')
    except Exception as e:
        order.status='failed'; order.raw_json=json.dumps({'error':str(e)}); db.commit()
        raise HTTPException(502,f'Unable to initialize Helcim checkout: {e}')
    meta={
        'checkout_token':checkout_token,
        'secret_token':secret_token,
        'recurring':recurring,
        'plan_code':plan.code,
        'payer_email':user.email,
        'payer_name':user.name,
        'amount_cents':plan.amount_cents,
        'currency':plan.currency,
    }
    order.provider_order_id=checkout_token
    order.status='pending'
    _save_order_meta(db,order,meta)
    return {
        'order_id':order.id,
        'checkout_token':checkout_token,
        'recurring':recurring,
        'plan_code':plan.code,
        'plan_name':plan.name,
        'cadence':plan.cadence,
        'amount_cents':plan.amount_cents,
        'currency':plan.currency,
    }


def _find_subscription_obj(response):
    if isinstance(response,dict):
        for key in ('subscriptions','data','items'):
            v=response.get(key)
            if isinstance(v,list) and v and isinstance(v[0],dict): return v[0]
            if isinstance(v,dict) and ('id' in v or 'subscriptionId' in v): return v
        if 'id' in response and ('paymentPlanId' in response or 'customerCode' in response): return response
    if isinstance(response,list) and response and isinstance(response[0],dict): return response[0]
    return None


def _create_helcim_subscription(plan: BillingPlan, customer_code: str, payment_method: str, order_id: str):
    plan_id=_helcim_plan_id(plan.code)
    idem=('azi'+re.sub(r'[^A-Za-z0-9]','',order_id))[:25].ljust(25,'0')
    sub={
        'paymentPlanId':plan_id,
        'customerCode':customer_code,
        'activationDate':utcnow().date().isoformat(),
        'paymentMethod':payment_method,
    }
    r=httpx.post(HELCIM_API_BASE+'/subscriptions',headers=_helcim_headers({'idempotency-key':idem}),json={'subscriptions':[sub]},timeout=30)
    if r.status_code>=400:
        raise HTTPException(502,'Unable to create Helcim subscription: '+r.text[:800])
    return r.json()


def _extend_recurring_entitlement(db: Session, order: CheckoutOrder, successful_cycles: int=1):
    plan=db.get(BillingPlan,order.plan_code)
    if not plan: return None
    meta=_order_meta(order)
    already=max(0,int(meta.get('cycles_granted') or 0))
    target=max(already,int(successful_cycles or 0))
    if target<=already:
        return current_entitlement(db,order.user_id)
    cycles_to_add=target-already
    ent=db.query(Entitlement).filter(Entitlement.source_order_id==order.id).first()
    now=utcnow()
    if not ent:
        ent=Entitlement(user_id=order.user_id,tier_code=plan.tier_code,plan_code=plan.code,source_order_id=order.id,provider='helcim',status='active',starts_at=now,ends_at=now+timedelta(days=plan.duration_days*cycles_to_add))
        db.add(ent)
    else:
        base=ent.ends_at if ent.ends_at and ent.ends_at>now else now
        ent.ends_at=base+timedelta(days=plan.duration_days*cycles_to_add)
        ent.status='active'
    order.entitlement_granted=True; order.status='paid'; order.paid_at=order.paid_at or now
    meta['cycles_granted']=target
    order.raw_json=json.dumps(meta,separators=(',',':'))
    db.commit(); db.refresh(ent)
    return ent


def helcim_complete_checkout(db: Session, user: User, order_id: str, response_payload: dict):
    order=db.query(CheckoutOrder).filter(CheckoutOrder.id==order_id,CheckoutOrder.user_id==user.id,CheckoutOrder.provider=='helcim').first()
    if not order: raise HTTPException(404,'Helcim order not found')
    meta=_order_meta(order)
    data=_helcim_validate_checkout_hash(meta,response_payload)
    plan=db.get(BillingPlan,order.plan_code)
    if not plan: raise HTTPException(500,'Billing plan not found')
    customer_code=str(data.get('customerCode') or '').strip()
    if not customer_code:
        raise HTTPException(400,'Helcim did not return a customer code')
    meta['helcim_customer_code']=customer_code
    meta['helcim_checkout_response']=data
    order.provider_capture_id=str(data.get('transactionId') or '') or None
    if not meta.get('recurring'):
        try:
            actual=int(round(float(data.get('amount') or 0)*100))
        except Exception: actual=0
        if actual != plan.amount_cents or str(data.get('currency') or '').upper()!=plan.currency.upper():
            raise HTTPException(400,'Helcim payment amount did not match selected plan')
        if not _helcim_response_accepted(data):
            raise HTTPException(402,'Helcim payment was not accepted')
        _save_order_meta(db,order,meta)
        ent=grant_entitlement(db,order)
        return {'paid':True,'recurring':False,'entitlement':entitlement_payload(ent)}
    payment_method=_helcim_payment_method_from_response(data)
    sub_response=_create_helcim_subscription(plan,customer_code,payment_method,order.id)
    sub=_find_subscription_obj(sub_response) or {}
    sub_id=sub.get('id') or sub.get('subscriptionId')
    if not sub_id:
        raise HTTPException(502,'Helcim subscription was created but no subscription id was returned')
    order.provider_order_id=str(sub_id)
    meta.update({'subscription_id':sub_id,'payment_method':payment_method,'subscription_response':sub_response})
    times_billed=int(sub.get('timesBilled') or 0)
    # Subscription plans are configured to bill on signup. A successful first bill activates access.
    if times_billed < 1:
        payments=sub.get('payments') or []
        approved=[p for p in payments if str(p.get('status','')).lower()=='approved']
        times_billed=len(approved)
    _save_order_meta(db,order,meta)
    ent=_extend_recurring_entitlement(db,order,times_billed) if times_billed else None
    return {'paid':bool(ent),'recurring':True,'subscription_id':sub_id,'status':sub.get('status','active'),'entitlement':entitlement_payload(ent)}


def sync_helcim_subscriptions(db: Session, user: User):
    if not helcim_ready(): return
    orders=db.query(CheckoutOrder).filter(CheckoutOrder.user_id==user.id,CheckoutOrder.provider=='helcim').order_by(CheckoutOrder.created_at.desc()).limit(10).all()
    for order in orders:
        meta=_order_meta(order)
        sid=meta.get('subscription_id')
        if not sid: continue
        try:
            r=httpx.get(f'{HELCIM_API_BASE}/subscriptions/{sid}',headers=_helcim_headers(),params={'includeSubObjects':'true'},timeout=12)
            if r.status_code>=400: continue
            sub=r.json(); status=str(sub.get('status') or '').lower()
            times=int(sub.get('timesBilled') or 0)
            if times: _extend_recurring_entitlement(db,order,times)
            ent=db.query(Entitlement).filter(Entitlement.source_order_id==order.id).first()
            if ent and status in ('cancelled','term_ended') and ent.ends_at<=utcnow(): ent.status='expired'; db.commit()
            meta=_order_meta(order); meta['subscription_status']=status; meta['times_billed_seen']=times; order.raw_json=json.dumps(meta,separators=(',',':')); db.commit()
        except Exception:
            continue


def _verify_helcim_webhook(request: Request, raw_body: bytes):
    token=os.getenv('HELCIM_WEBHOOK_VERIFIER_TOKEN','').strip()
    if not token: raise HTTPException(503,'Helcim webhook verifier token is not configured')
    wid=request.headers.get('webhook-id',''); ts=request.headers.get('webhook-timestamp',''); sig=request.headers.get('webhook-signature','')
    if not wid or not ts or not sig: raise HTTPException(400,'Missing Helcim webhook signature headers')
    try: key=__import__('base64').b64decode(token)
    except Exception: raise HTTPException(503,'Invalid Helcim webhook verifier token')
    signed=wid+'.'+ts+'.'+raw_body.decode('utf-8')
    calc=__import__('base64').b64encode(hmac.new(key,signed.encode(),hashlib.sha256).digest()).decode()
    candidates=[]
    for part in sig.split():
        if ',' in part: candidates.append(part.split(',',1)[1])
        else: candidates.append(part)
    if not any(hmac.compare_digest(calc,c) for c in candidates): raise HTTPException(401,'Invalid Helcim webhook signature')
    return wid


def process_helcim_webhook(db: Session, request: Request, raw_body: bytes, body: dict):
    event_id=_verify_helcim_webhook(request,raw_body)
    existing=db.query(PaymentWebhookEvent).filter(PaymentWebhookEvent.provider=='helcim',PaymentWebhookEvent.event_id==event_id).first()
    if existing: return {'received':True,'duplicate':True}
    rec=PaymentWebhookEvent(provider='helcim',event_id=event_id,event_type=str(body.get('type') or ''),payload_json=raw_body.decode('utf-8'),status='received')
    db.add(rec); db.commit()
    # Helcim sends the transaction id; fetch details server-side before changing access.
    if body.get('type')=='cardTransaction' and body.get('id'):
        try:
            r=httpx.get(f"{HELCIM_API_BASE}/card-transactions/{body.get('id')}",headers=_helcim_headers(),timeout=20)
            if r.status_code<400:
                tx=r.json(); customer=str(tx.get('customerCode') or '')
                amount_cents=int(round(float(tx.get('amount') or 0)*100))
                if str(tx.get('status') or '').upper() in ('APPROVED','APPROVAL') and customer:
                    orders=db.query(CheckoutOrder).filter(CheckoutOrder.provider=='helcim').order_by(CheckoutOrder.created_at.desc()).limit(100).all()
                    for order in orders:
                        meta=_order_meta(order); plan=db.get(BillingPlan,order.plan_code)
                        if not plan or not meta.get('recurring'): continue
                        if str(meta.get('helcim_customer_code') or '')==customer and plan.amount_cents==amount_cents:
                            # Fetch subscription so timesBilled is authoritative and idempotent.
                            sid=meta.get('subscription_id')
                            if sid:
                                sr=httpx.get(f'{HELCIM_API_BASE}/subscriptions/{sid}',headers=_helcim_headers(),params={'includeSubObjects':'true'},timeout=12)
                                if sr.status_code<400:
                                    sub=sr.json(); _extend_recurring_entitlement(db,order,int(sub.get('timesBilled') or 0))
                            break
        except Exception as e:
            rec.status='error'; rec.payload_json=json.dumps({'event':body,'error':str(e)}); db.commit(); return {'received':True,'processed':False}
    rec.status='processed'; rec.processed_at=utcnow(); db.commit()
    return {'received':True,'processed':True}
