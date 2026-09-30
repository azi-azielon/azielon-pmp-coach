/* Live PMP class registration: shared by the sign-up page panel and the in-app "PMP Live Classes" view. */
(function(){
  const CHECKOUT_URL='https://checkout.page/s/kjkWZa38InTkt';
  const q=(s,r=document)=>r.querySelector(s);
  function thanksgiving(y){const d=new Date(y,10,1,12);d.setDate(1+((4-d.getDay()+7)%7)+21);return d}
  function weekMonday(d){const x=new Date(d);x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
  function blocked(d){
    const y=d.getFullYear(),tg=thanksgiving(y),tgTue=new Date(tg);tgTue.setDate(tg.getDate()-2);
    const mon=weekMonday(new Date(y,11,25,12)),xTue=new Date(mon);xTue.setDate(mon.getDate()+1);
    return d.toDateString()===tgTue.toDateString()||d.toDateString()===xTue.toDateString();
  }
  function tuesdays(){
    const out=[],now=new Date();now.setHours(12,0,0,0);const end=new Date(now);end.setFullYear(end.getFullYear()+1);
    const d=new Date(now);while(d.getDay()!==2)d.setDate(d.getDate()+1);
    for(;d<=end;d.setDate(d.getDate()+7)){const x=new Date(d);if(!blocked(x))out.push(x)}
    return out;
  }
  const options='<option value="">Choose an available Tuesday</option>'+tuesdays().map(d=>{
    const v=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return `<option value="${v}">${d.toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</option>`;
  }).join('');
  const BTN='Continue to secure payment <span>→</span>';

  document.querySelectorAll('.live-form').forEach(f=>{
    const sel=q('select[name=classDate]',f),msg=q('.live-msg',f),btn=q('.live-pay',f),fb=q('.live-fallback',f);
    sel.innerHTML=options;
    // Prefill from the signed-in user when available
    try{const u=(typeof state!=='undefined'&&state.user)||null;if(u){if(u.name&&!f.name.value)f.name.value=u.name;if(u.email&&!f.email.value)f.email.value=u.email}}catch(_){}
    f.onsubmit=async e=>{
      e.preventDefault();btn.disabled=true;btn.textContent='Saving your registration…';msg.textContent='';
      const payload={name:f.elements.name.value.trim(),email:f.elements.email.value.trim(),preferred_date:sel.value};
      try{
        const r=await fetch('/api/public/pmp-class/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const text=await r.text();let data={};try{data=JSON.parse(text)}catch(_){}
        if(!r.ok)throw new Error((data&&typeof data.detail==='string'&&data.detail)||'We could not save your registration right now.');
        msg.style.color='#2F6B55';msg.textContent='✓ Registration saved. Opening secure payment…';
        setTimeout(()=>{window.location.href=CHECKOUT_URL},500);
      }catch(err){
        msg.style.color='#9B3B45';
        msg.textContent=(err&&err.message&&!/JSON|token|fetch/i.test(err.message)?err.message:'We could not save your registration right now.')+' You can still continue to payment below; we will match your payment by name.';
        btn.disabled=false;btn.innerHTML=BTN;if(fb)fb.hidden=false;
      }
    };
  });

  // Sign-up page: swap the right panel between the account form and the live-class form
  const acct=q('#landingAccount'),live=q('#landingLive'),open=q('#landingLiveBtn'),back=q('#liveBackBtn');
  function showLive(on){
    if(!acct||!live)return;
    acct.classList.toggle('hidden',on);live.classList.toggle('hidden',!on);
    const first=on?q('input[name=name]',live):q('#regName');
    if(first)setTimeout(()=>first.focus({preventScroll:true}),50);
  }
  if(open)open.addEventListener('click',e=>{e.preventDefault();showLive(true)});
  if(back)back.addEventListener('click',()=>showLive(false));
  // Returning to "Create account" from the left gold button also restores the account form
  const trial=q('#trialStartBtn');if(trial)trial.addEventListener('click',()=>showLive(false),true);

  // In-app: prefill the live form when the view opens
  document.querySelectorAll('[data-view="live"]').forEach(b=>b.addEventListener('click',()=>{
    const f=q('#live .live-form');if(!f)return;
    try{const u=typeof state!=='undefined'&&state.user;if(u){if(!f.elements.name.value)f.elements.name.value=u.name||'';if(!f.elements.email.value)f.elements.email.value=u.email||''}}catch(_){}
  }));
})();
