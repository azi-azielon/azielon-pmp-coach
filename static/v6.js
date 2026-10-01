
/* Per-browser memory of today's practice scores (shown in "Done today"). */
function v6SetScore(id,v){try{localStorage.setItem('v6score:'+id,v)}catch(e){}}
function v6GetScore(id){try{return localStorage.getItem('v6score:'+id)||''}catch(e){return''}}
/* Azielon PMP Coach — v6 learner experience layer.
   Loads after app.js. Re-renders the shell and the "Today" home so the learner
   always sees one clear next step. All data and actions come from app.js. */
(function(){
  'use strict';
  const q=(s,r=document)=>r.querySelector(s);
  const qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const esc=s=>(typeof escapeHtml==='function'?escapeHtml(String(s??'')):String(s??''));
  document.body.classList.add('v6');

  /* ---------- Shell: stepper into top bar, exam chip, health pill ---------- */
  const topbar=q('.topbar'),actions=q('.top-actions'),journey=q('#learnerJourney');
  if(topbar&&journey&&actions)topbar.insertBefore(journey,actions);
  let chip=null;
  if(actions){
    chip=document.createElement('button');chip.type='button';chip.id='v6ExamChip';chip.className='v6-exam-chip is-unset';chip.hidden=true;
    actions.insertBefore(chip,actions.firstChild);
    chip.onclick=()=>{state.dashboardFocus='readiness';showView('dashboard');setTimeout(()=>{state.dashboardFocus='readiness';renderFeatureLaunchpad(state.lastProgress||{})},0)};
  }
  const pill=q('#healthPill');
  if(pill)new MutationObserver(()=>pill.classList.toggle('is-offline',/offline/i.test(pill.textContent))).observe(pill,{childList:true,characterData:true,subtree:true});

  function fmtDate(iso){if(!iso)return'';const d=new Date(iso+'T12:00:00');return isNaN(d)?'':d.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'})}
  function updateChip(p){
    if(chip){chip.hidden=true;return}const staff=typeof isStaff==='function'&&isStaff();
    if(staff||!p||!p.adaptive_plan){chip.hidden=true;return}
    const days=p.adaptive_plan.days_until_exam;chip.hidden=false;
    if(days==null){chip.className='v6-exam-chip is-unset';chip.innerHTML='Set your exam date';chip.title='Add your exam date so your plan paces itself'}
    else if(days<0){chip.className='v6-exam-chip is-unset';chip.innerHTML='Update exam date';chip.title='Your saved exam date has passed'}
    else{chip.className='v6-exam-chip';chip.innerHTML=`<b>${days}</b><span>day${days===1?'':'s'} to exam</span>`;chip.title=`Exam: ${fmtDate(p.study_profile?.exam_date)}`}
  }
  function enhanceJourneyTips(){
    qa('.topbar .journey-stage[data-journey-tip]').forEach(b=>{if(b.querySelector('.v6-tip'))return;const t=document.createElement('span');t.className='v6-tip';t.textContent=b.dataset.journeyTip||'';b.appendChild(t);b.removeAttribute('title')});
  }
  if(typeof renderLearnerJourney==='function'){
    const orig=renderLearnerJourney;
    window.renderLearnerJourney=function(p){orig(p);enhanceJourneyTips();updateChip(p||state.lastProgress)};
  }

  /* ---------- Home tabs: only the views that live on Home ---------- */
  const HOME_TABS=[['today','Today'],['done','Done today'],['plan','Full plan'],['mistakes','Fix mistakes']];
  window.renderFeatureLaunchpad=function(p){
    const host=q('#featureLaunchpad');if(!host)return;
    let focus=state.dashboardFocus||'today';
    if(!HOME_TABS.some(t=>t[0]===focus)){
      // Legacy focus values map onto real screens in the sidebar
      const map={notes:'notes',tricky:'tricky',diagrams:'diagrams',practice:'practice',exams:'exams',coach:'coach',readiness:'progress'};
      if(map[focus]&&state.currentView==='dashboard'){state.dashboardFocus='today';showView(map[focus]);return}
      focus='today';state.dashboardFocus='today';
    }
    host.innerHTML=HOME_TABS.map(([k,t])=>`<button class="pmp-focus-tab ${focus===k?'active':''}" type="button" role="tab" aria-selected="${focus===k}" data-dashboard-focus="${k}"><span class="feature-launch-icon" aria-hidden="true">${typeof launchpadIcon==='function'?launchpadIcon(k):''}</span><span>${esc(t)}${k==='done'&&typeof v6DoneTodayTasks==='function'&&v6DoneTodayTasks().length?` <em class="v6-tab-count">${v6DoneTodayTasks().length}</em>`:''}</span></button>`).join('');
    const ws=q('#dashboardWorkspace');if(ws)ws.classList.toggle('v6-today-host',focus==='today');
    const overall=q('#dashboardOverallPct');if(overall&&typeof learningOverview==='function')overall.textContent=learningOverview(p||{}).avg+'%';
    qa('[data-dashboard-focus]',host).forEach(b=>b.onclick=()=>{state.dashboardFocus=b.dataset.dashboardFocus;window.renderFeatureLaunchpad(p)});
    if(focus==='done'&&typeof v6RenderDoneToday==='function'){v6RenderDoneToday()}else renderDashboardWorkspace(focus,p);
    renderGlobalStudyNav(p);
  };

  /* ---------- Today ---------- */
  const TYPE={
    note:{label:'Topic note',verb:'Read this note',icon:'notes'},
    tricky:{label:'Tricky words',verb:'Compare the terms',icon:'tricky'},
    diagram:{label:'Diagram',verb:'Study the diagram',icon:'diagrams'},
    practice:{label:'Practice',verb:'Start practice',icon:'practice'},
    exam:{label:'Mock exam',verb:'Resume exam',icon:'exams'},
    review:{label:'Fix mistakes',verb:'Review now',icon:'mistakes'}
  };
  const icon=k=>typeof launchpadIcon==='function'?launchpadIcon(k):'';

  function ring(score){
    const v=Math.max(0,Math.min(100,Number(score)||0));
    return `<div class="v6-score"><b>${v}</b><span>/100</span></div><div class="v6-thinbar"><i style="width:${v}%"></i></div>`;
  }
  function readinessCard(p){
    const r=p?.readiness||{},plan=p?.adaptive_plan||{},prof=p?.study_profile||{},days=plan.days_until_exam;
    let line;
    if(days==null||days<0){
      line=`<p>${days<0?'Your exam date has passed. Set your new date':'Add your exam date'} and your daily plan will pace itself.</p><form class="v6-date-form" id="v6DateForm"><input type="date" id="v6DateInput" required min="${todayDateKey()}" aria-label="Exam date"><button type="submit">Save</button></form>`;
    }else{
      const perWeek=plan.target_questions_per_week?` · ${plan.target_questions_per_week} questions/week`:'';
      line=`<p><b>${days} day${days===1?'':'s'}</b> to your exam · ${esc(fmtDate(prof.exam_date))}</p><p>${esc(plan.phase||'Foundation')} phase${esc(perWeek)}</p>`;
    }
    return `<section class="v6-card v6-ready">${ring(r.score)}<div><span class="v6-kicker">Exam readiness</span><h4>${esc(r.label||'Getting started')}</h4>${line}</div></section>`;
  }
  function watchCard(p){
    const pat=(p?.mistake_patterns||[])[0],weak=(p?.adaptive_plan?.weak_domains||[])[0];
    if(pat){
      const weakLine=weak?`<div class="v6-watch-sub"><span>Weakest domain: <b>${esc(weak.domain)} · ${weak.accuracy}%</b></span><button class="v6-link" type="button" data-dash-practice data-count="10" data-domain="${esc(weak.domain)}">Practice it →</button></div>`:'';
      return `<section class="v6-card v6-watch"><span class="v6-kicker">Watch out for</span><h4>${esc(pat.title)}</h4><p>${esc(pat.tip||'')}${pat.count?` Seen in ${pat.count} of your recent misses.`:''}</p><div class="v6-watch-actions"><button class="v6-link" type="button" data-dash-focus="mistakes">Fix this pattern →</button></div>${weakLine}</section>`;
    }
    if(weak)return `<section class="v6-card v6-watch"><span class="v6-kicker">Weakest area</span><h4>${esc(weak.domain)} · ${weak.accuracy}%</h4><p>Your lowest-scoring domain so far. Today’s practice leans toward it automatically.</p><button class="v6-link" type="button" data-dash-practice data-count="10" data-domain="${esc(weak.domain)}">Practice ${esc(weak.domain)} →</button></section>`;
    return `<section class="v6-card v6-watch is-good"><span class="v6-kicker">How this works</span><h4>We plan it. You follow the next step.</h4><p>As you study and practice, this card will point out the reasoning habits costing you points.</p></section>`;
  }
  function dateNudge(p){
    const days=p?.adaptive_plan?.days_until_exam;if(days!=null&&days>=0)return'';
    return `<section class="v6-nudge"><span class="v6-kicker">One-time setup</span><p>${days<0?'Your exam date has passed. Add the new date':'Add your exam date'} so your daily plan paces itself.</p><form class="v6-date-form" id="v6DateForm"><input type="date" id="v6DateInput" required min="${todayDateKey()}" aria-label="Exam date"><button type="submit">Save</button></form></section>`;
  }
  function statsCard(p){
    const acc=p?.practice_accuracy,done=p?.practice_unique_attempted||0,total=p?.practice_bank_total||0,rev=(p?.review_queue||[]).length;
    return `<section class="v6-card v6-stats"><button class="v6-stat" type="button" data-dash-open="progress"><b>${acc==null?'—':Math.round(acc)+'%'}</b><span>Accuracy</span></button><button class="v6-stat" type="button" data-dash-open="practice"><b>${done}</b><span>of ${total} practiced</span></button><button class="v6-stat" type="button" data-dash-open="review"><b>${rev}</b><span>to review</span></button></section>`;
  }
  function taskRow(t,isNext){
    const st=taskState(t),meta=TYPE[t.type]||{label:t.label||'Study'};
    const cls=st==='done'?'is-done':st==='in_progress'?'is-progress':'';
    return `<div class="v6-task ${cls} ${isNext?'is-next':''}"><button class="v6-task-dot" type="button" ${st==='done'?'disabled aria-label="Done"':`data-today-done="${esc(t.id)}" aria-label="Mark done" title="Mark done"`}>✓</button><div class="v6-task-copy"><div class="v6-task-meta"><span class="v6-task-type">${esc(meta.label)}</span>${t.carriedFrom?'<span class="v6-task-flag">· carried over</span>':''}${st==='in_progress'?'<span class="v6-task-flag">· in progress</span>':''}${isNext?'<span class="v6-task-flag">· up next</span>':''}</div><p class="v6-task-title" title="${esc(t.title)}">${esc(t.title)}</p></div><button class="v6-task-open" type="button" data-today-open="${esc(t.id)}">${st==='done'?'Review':'Open'} →</button></div>`;
  }
  function nextHero(p,tasks){
    const next=tasks.find(t=>taskState(t)!=='done');
    const j=typeof learnerJourneyState==='function'?learnerJourneyState(p||{}):null;
    const stage=j?`Stage ${j.index+1} of 5 · ${j.stages[j.index].title}`:'';
    if(next){
      const meta=TYPE[next.type]||{label:next.label,verb:'Open',icon:'today'};
      const why=next.reason?`<div class="v6-next-why">★ ${esc(next.reason)}</div>`:'';
      return `<section class="v6-next"><div class="v6-next-top"><span class="v6-kicker">Your next step</span><span class="v6-next-type">${icon(meta.icon)}${esc(meta.label)}</span></div><h2>${esc(next.title)}</h2><p>${esc(next.detail||'')}</p>${why}<div class="v6-next-actions"><button class="v6-btn-gold" type="button" data-today-open="${esc(next.id)}">${esc(meta.verb)} <span aria-hidden="true">→</span></button><button class="v6-btn-quiet" type="button" data-today-done="${esc(next.id)}">Mark done</button></div></section>`;
    }
    const n=typeof nextAfterTodayAction==='function'?nextAfterTodayAction(p||{}):null;
    return `<section class="v6-next v6-done-hero"><div class="v6-next-top"><span class="v6-kicker">Today’s plan is complete</span>${stage?`<span class="v6-next-type">${esc(stage)}</span>`:''}</div><h2>Great work today.</h2><p>${n?esc('Want to keep going? Next up: '+n.title+'.'):'Come back tomorrow for your next plan.'}</p>${n?`<div class="v6-next-actions"><button class="v6-btn-gold" type="button" data-next-after-today="${esc(n.kind)}" data-next-item="${esc(n.itemId||'')}">${esc(n.button||'Keep going')} →</button></div>`:''}</section>`;
  }

  function upNext(p,tasks){
    if(typeof nextFourTasks!=='function')return'';let rows=[];try{rows=nextFourTasks(p||{},tasks).slice(0,2)}catch(e){return''}
    if(!rows.length)return'';
    return `<section class="v6-card v6-plan v6-upnext"><div class="v6-plan-head"><h3>Coming up after today</h3><span class="v6-plan-count">Planned for you</span></div><div class="v6-plan-list">${rows.map(t=>{const meta=TYPE[t.type]||{label:t.label||'Study'};return `<div class="v6-task"><span class="v6-task-dot" aria-hidden="true"></span><div class="v6-task-copy"><div class="v6-task-meta"><span class="v6-task-type">${esc(meta.label)}</span></div><p class="v6-task-title" title="${esc(t.title)}">${esc(t.title)}</p></div><button class="v6-task-open" type="button" data-next-preview-open="${esc(t.type)}" data-next-preview-id="${esc(String(t.itemId||''))}">Preview →</button></div>`}).join('')}</div></section>`;
  }
  window.renderTodayPlanFromDb=function(p,tasks){
    const host=q('#dashboardWorkspace');if(!host)return;host.classList.add('v6-today-host');
    tasks=tasks||[];const done=tasks.filter(t=>taskState(t)==='done').length,pct=tasks.length?Math.round(done/tasks.length*100):0;
    const nextId=(tasks.find(t=>taskState(t)!=='done')||{}).id;
    host.innerHTML=`<div class="v6-home"><div class="v6-col">${nextHero(p,tasks)}<section class="v6-card v6-plan"><div class="v6-plan-head"><h3>Today’s plan</h3><div class="v6-plan-bar" aria-hidden="true"><i style="width:${pct}%"></i></div><span class="v6-plan-count">${done} of ${tasks.length} done</span></div><div class="v6-plan-list">${tasks.length?tasks.map(t=>taskRow(t,t.id===nextId)).join(''):'<p class="v6-task-flag" style="padding:10px 6px">You are caught up for today.</p>'}</div></section>${upNext(p,tasks)}</div><div class="v6-col">${watchCard(p)}${dateNudge(p)}</div></div>`;
    state.todayTaskJustAdded=false;
    bindDashboardWorkspaceActions();
    const f=q('#v6DateForm');
    if(f)f.onsubmit=async e=>{e.preventDefault();const v=q('#v6DateInput').value;if(!v)return;const btn=f.querySelector('button');btn.textContent='Saving…';
      const prof=p?.study_profile||{};
      try{await api('/api/coach/profile',{method:'PUT',body:JSON.stringify({exam_date:v,weekly_hours:prof.weekly_hours||7,study_days_per_week:prof.study_days_per_week||5,session_minutes:prof.session_minutes||45})});await loadProgress();}
      catch(err){btn.textContent='Save';alert(err.message||'Could not save your exam date.')}};
  };

  // Loading state that matches the new layout (avoids a jump)
  const origLoad=typeof loadAndRenderTodayPlan==='function'?loadAndRenderTodayPlan:null;
  if(origLoad)window.loadAndRenderTodayPlan=async function(p){
    const host=q('#dashboardWorkspace');
    if(host&&!host.querySelector('.v6-home')){host.classList.add('v6-today-host');host.innerHTML='<div class="v6-home"><div class="v6-col"><section class="v6-next"><span class="v6-kicker">Your next step</span><h2 style="opacity:.55">Preparing today’s plan…</h2></section></div><div class="v6-col"></div></div>'}
    return origLoad(p);
  };
})();

/* Fix: My Progress summary was never rendered (function existed but was not called). */
(function(){
  if(typeof renderCompactProgressDashboard!=='function')return;
  const safe=()=>{try{if(state.lastProgress)renderCompactProgressDashboard(state.lastProgress)}catch(e){console.warn('progress summary',e)}};
  if(typeof loadProgress==='function'){const orig=loadProgress;window.loadProgress=async function(){const r=await orig.apply(this,arguments);safe();return r}}
  if(typeof showView==='function'){const orig=showView;window.showView=function(id){const r=orig.apply(this,arguments);if(id==='progress')safe();return r}}
})();

/* My Progress = report card. Today's task list lives on Today; here we link to it. */
(function(){
  const panel=document.querySelector('.progress-next-panel');if(!panel)return;
  const b=document.createElement('button');b.type='button';b.className='primary v6-progress-today';b.textContent='Open today’s plan →';
  b.onclick=()=>{state.dashboardFocus='today';showView('dashboard');setTimeout(()=>{state.dashboardFocus='today';renderFeatureLaunchpad(state.lastProgress||{})},0)};
  panel.appendChild(b);
})();

/* Practice focus mode: while a session runs, show only the question. */
(function(){
  const view=document.getElementById('practice'),area=document.getElementById('sessionArea');if(!view||!area)return;
  const top=area.querySelector('.session-top');
  if(top&&!top.querySelector('.v6-session-exit')){
    const b=document.createElement('button');b.type='button';b.className='v6-session-exit';b.textContent='← Practice setup';
    b.onclick=()=>{if(typeof clearPracticeTimer==='function')try{clearPracticeTimer()}catch(e){}area.classList.add('hidden');if(typeof loadProgress==='function')loadProgress().catch(()=>{})};
    top.insertBefore(b,top.firstChild);
  }
  const sync=()=>view.classList.toggle('v6-in-session',!area.classList.contains('hidden'));
  new MutationObserver(sync).observe(area,{attributes:true,attributeFilter:['class']});sync();
})();

/* "Done" flow: marking a topic done moves the learner forward.
   Opened from Today -> back to Today (next step is waiting). Otherwise -> next item. */
(function(){
  let fromToday=false;
  if(typeof openTodayTask==='function'){const o=openTodayTask;window.openTodayTask=async function(t){
    const kind=t&&t.type;
    if(!['note','tricky','diagram'].includes(kind)){fromToday=false;return o.apply(this,arguments)}
    // Open the exact item in the one-at-a-time study view (not the browse grid)
    if(taskState(t)!=='done'&&typeof setDailyTaskStatus==='function'){try{await setDailyTaskStatus(t,'in_progress')}catch(e){}}
    const cfg={note:['notes','noteMode','noteIndex',()=>noteRows(),()=>renderNotes(),'data-note-mode'],
               tricky:['tricky','trickyMode','flashIndex',()=>trickyRows(),()=>renderTricky(),'data-tricky-mode'],
               diagram:['diagrams','diagramMode','diagramIndex',()=>diagramRows(),()=>renderDiagrams(),'data-diagram-mode']}[kind];
    const [view,modeKey,idxKey,rowsFn,renderFn,attr]=cfg;
    showView(view);
    setTimeout(()=>{
      fromToday=true;
      state[modeKey]='study';let rows=rowsFn(),i=rows.findIndex(x=>String(x.id)===String(t.itemId));
      if(i<0){state[modeKey]='all';rows=rowsFn();i=Math.max(0,rows.findIndex(x=>String(x.id)===String(t.itemId)));state[modeKey]='study';
        if(kind==='note'&&typeof renderNotesSingle==='function'){renderNotesSingle(rows,i,true);fromToday=true;return}}
      state[idxKey]=Math.max(0,i);renderFn();
      document.querySelectorAll(`[${attr}]`).forEach(b=>b.classList.toggle('active',b.getAttribute(attr)==='study'));
      fromToday=true;
    },60);
  }}
  document.addEventListener('click',e=>{if(e.target.closest('#nav button'))fromToday=false},true);
  if(typeof setStudyStatus!=='function')return;
  const orig=setStudyStatus;
  const KIND={
    note:{list:'notes',btn:'noteReviewed',idx:'noteIndex',rows:()=>noteRows(),render:()=>renderNotes(),next:'Next topic'},
    tricky:{list:'tricky',btn:'trickyReviewed',idx:'flashIndex',rows:()=>trickyRows(),render:()=>renderTricky(),next:'Next pair'},
    diagram:{list:'diagrams',btn:'diagramReviewed',idx:'diagramIndex',rows:()=>diagramRows(),render:()=>renderDiagrams(),next:'Next diagram'}};
  const curId={};
  function backToToday(){fromToday=false;state.dashboardFocus='today';showView('dashboard');setTimeout(()=>{state.dashboardFocus='today';if(typeof loadProgress==='function')loadProgress().then(()=>renderFeatureLaunchpad(state.lastProgress||{})).catch(()=>renderFeatureLaunchpad(state.lastProgress||{}))},0)}
  function goNext(type){
    if(fromToday)return backToToday();
    const k=KIND[type],rows=k.rows(),pos=rows.findIndex(x=>String(x.id)===String(curId[type]));
    // A finished item drops out of the "to study" list, so the same position is already the next item.
    state[k.idx]=pos>=0?(pos+1)%Math.max(1,rows.length):Math.min(state[k.idx]||0,Math.max(0,rows.length-1));
    k.render();const v=document.querySelector('.view.active');if(v)v.scrollTop=0;
  }
  // One clear action bar under every note, tricky pair and diagram: [Review later] [Mark as done] [Next →]
  function decorate(type,item){
    const k=KIND[type],done=document.getElementById(k.btn);if(!done)return;
    if(!item){const rows=k.rows();item=rows[Math.min(state[k.idx]||0,rows.length-1)]}
    if(item)curId[type]=item.id;
    const bar=done.parentElement;bar.classList.add('v6-study-bar');if(bar.querySelector('.v6-study-next'))return;
    const isDone=done.classList.contains('is-complete');
    done.textContent=isDone?'✓ Done':'Mark as done';done.disabled=isDone;
    done.title='Saves this as studied. It counts toward your progress and Today’s plan.';
    const nx=document.createElement('button');nx.type='button';nx.className='v6-study-next'+(isDone?' is-ready':'');
    nx.textContent=(fromToday?'Back to Today':k.next)+' →';nx.onclick=()=>goNext(type);bar.appendChild(nx);
  }
  if(typeof renderNotesSingle==='function'){const o=renderNotesSingle;window.renderNotesSingle=function(rows,i,iso){const r=o.apply(this,arguments);try{decorate('note',rows&&rows[state.noteIndex])}catch(e){}return r}}
  if(typeof renderTricky==='function'){const o=renderTricky;window.renderTricky=function(){const r=o.apply(this,arguments);try{decorate('tricky')}catch(e){}return r}}
  if(typeof renderDiagrams==='function'){const o=renderDiagrams;window.renderDiagrams=async function(){const r=await o.apply(this,arguments);try{decorate('diagram')}catch(e){}return r}}
  window.setStudyStatus=async function(type,id,status){
    const k=KIND[type],btn=k&&document.getElementById(k.btn);
    if(status!=='reviewed'||!btn)return orig.apply(this,arguments);
    // Mark as done = save it as studied and stay on the page; Next moves on.
    btn.disabled=true;btn.textContent='Saving…';
    try{await api(`/api/study/items/${type}/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify({status})})}
    catch(e){btn.disabled=false;btn.textContent='Mark as done';alert(e.message||'Could not save. Try again.');return}
    const item=(state[k.list]||[]).find(x=>String(x.id)===String(id));if(item)item.studyStatus='reviewed';
    curId[type]=id;btn.textContent='✓ Done';btn.classList.add('is-complete');
    const art=btn.closest('article');const badge=art&&art.querySelector('.study-status-badge, .status-badge');if(badge){badge.textContent='Done';badge.className=badge.className.replace(/\bstatus-\S+/g,'')+' status-reviewed'}
    const nx=btn.parentElement.querySelector('.v6-study-next');if(nx){nx.classList.add('is-ready');nx.focus({preventScroll:true})}
    if(typeof loadStudySummary==='function')loadStudySummary().catch(()=>{});
  };
})();

/* Exam focus mode: once an exam is chosen or running, show only that exam. */
(function(){
  const view=document.getElementById('exams');if(!view)return;
  const ids=['examSetup','ruleReviewArea','examSessionArea','examResults'];
  const els=ids.map(id=>document.getElementById(id)).filter(Boolean);
  const back=document.createElement('button');back.type='button';back.className='v6-session-exit v6-exam-back';back.textContent='← All exams';
  back.onclick=()=>{if(state.examLock)return;els.forEach(e=>e.classList.add('hidden'));view.scrollTop=0};
  view.insertBefore(back,view.firstChild);
  const sync=()=>{
    const open=els.some(e=>!e.classList.contains('hidden')&&e.innerHTML.trim());
    view.classList.toggle('v6-exam-focus',open);
    back.hidden=!open||!!state.examLock||!document.getElementById('examSessionArea').classList.contains('hidden');
    if(open)view.scrollTop=0;
  };
  els.forEach(e=>new MutationObserver(sync).observe(e,{attributes:true,attributeFilter:['class']}));sync();
})();
/* Keep the current exam question visible in the one-line navigator */
(function(){const nav=document.getElementById('examNavigator');if(!nav)return;new MutationObserver(()=>{const c=nav.querySelector('.current, .active, [aria-current="true"]');if(c)c.scrollIntoView({block:'nearest',inline:'center'})}).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']})})();

/* ---------- Daily plan practice: on today's topics, and it completes ---------- */
(function(){
  // 1) Attach today's note / tricky pair / diagram to the practice request so questions match what was studied.
  if(typeof api==='function'){
    const origApi=api;
    window.api=function(path,opts){
      if(state.v6RelatedTo&&path==='/api/practice/sessions'&&opts&&opts.method==='POST'){
        try{const b=JSON.parse(opts.body||'{}');b.related_to=state.v6RelatedTo;opts={...opts,body:JSON.stringify(b)}}catch(e){}
        state.v6RelatedTo=null;
      }
      return origApi.call(this,path,opts);
    };
  }
  function todaysTopics(task){
    const plan=state.todayPlan||[],out={};let i=task?plan.findIndex(t=>t.id===task.id):-1;
    if(i<0)i=plan.findIndex(t=>t.type==='practice'&&taskState(t)!=='done');
    for(let k=i-1;k>=0;k--){const t=plan[k];if(t.type==='practice'||t.type==='exam')break;if(['note','tricky','diagram'].includes(t.type)&&t.itemId&&!out[t.type])out[t.type]=String(t.itemId)}
    return out;
  }
  // 2) Starting practice from Today: remember the task, use today's topics, mixed domains.
  if(typeof openTodayTask==='function'){
    const o=window.openTodayTask;
    window.openTodayTask=async function(t){
      if(t&&t.type==='practice'){
        state.v6PracticeTask=t;const rel=todaysTopics(t);state.v6RelatedTo=Object.keys(rel).length?rel:null;
        if(state.v6RelatedTo){t={...t,domain:'',focus:''}} // topic-matched set replaces the domain/missed filters
      }else if(t&&t.type!=='practice'){state.v6PracticeTask=null}
      return o.call(this,t);
    };
  }
  document.addEventListener('click',e=>{const b=e.target.closest('#nav button');if(b&&b.dataset.view!=='practice'){state.v6PracticeTask=null}},true);
  // 3) Session finished: mark today's practice task done and point to the next step.
  if(typeof renderSessionComplete==='function'){
    const orig=renderSessionComplete;
    window.renderSessionComplete=async function(){
      const sess=state.session,task=state.v6PracticeTask;
      const r=await orig.apply(this,arguments);
      if(!sess)return r;
      let res=null;try{res=await api(`/api/practice/sessions/${sess.session_id}/results`)}catch(e){}
      let planTask=task;
      if(!planTask){planTask=(state.todayPlan||[]).find(x=>x.type==='practice'&&taskState(x)!=='done'&&(sess.total||0)>=Math.min(10,Number(x.count||10)))||null}
      const withMatch=planTask&&typeof v6StartMatchQueue==='function'&&typeof hasFeature==='function'&&hasFeature('match');
      if(withMatch){try{localStorage.setItem('v6pq:'+planTask.id,'1')}catch(e){}}
      else if(planTask&&taskState(planTask)!=='done'&&typeof setDailyTaskStatus==='function'){try{await setDailyTaskStatus(planTask,'done')}catch(e){}}
      state.v6PracticeTask=null;
      const card=document.getElementById('questionCard');if(!card)return r;
      const acc=res&&res.accuracy!=null?Math.round(res.accuracy):null;
      if(planTask&&res)v6SetScore(planTask.id,`${res.correct}/${res.total}${acc!=null?` · ${acc}%`:''}`);
      const verdict=acc==null?'':acc>=80?'Exam-ready accuracy on these topics.':acc>=65?'Close. Review the misses, then move on.':'These topics need another pass. Review each miss before moving on.';
      const box=document.createElement('div');box.className='v6-session-done';
      box.innerHTML=`<span class="v6-kicker">${planTask?'Today’s practice complete':'Session complete'}</span><h3>${res?`${res.correct} of ${res.total} correct`:'Answers saved'}${acc!=null?` <span>· ${acc}%</span>`:''}</h3>${verdict?`<p>${verdict}</p>`:''}<div class="v6-next-actions"><button class="v6-btn-gold" type="button" id="v6BackToday">${withMatch?'Next: 2 match sets on these topics →':'Continue to next step →'}</button>${res&&res.correct<res.total?'<button class="v6-btn-quiet" type="button" id="v6ReviewMisses">Practice my misses</button>':''}</div>`;
      const existing=card.querySelector('.session-summary');
      if(existing){existing.prepend(box);existing.querySelector('h3:not(.v6-session-done h3)')?.remove()}else{card.innerHTML='';card.appendChild(box)}
      const back=box.querySelector('#v6BackToday');back.onclick=async()=>{if(withMatch){document.getElementById('sessionArea').classList.add('hidden');const ok=await v6StartMatchQueue(planTask,v6BlockTopicText(planTask));if(ok)return;try{await setDailyTaskStatus(planTask,'done')}catch(e){}}document.getElementById('sessionArea').classList.add('hidden');state.dashboardFocus='today';showView('dashboard');try{await loadProgress()}catch(e){}renderFeatureLaunchpad(state.lastProgress||{})};
      const miss=box.querySelector('#v6ReviewMisses');if(miss)miss.onclick=()=>{const f=document.getElementById('pReviewFocus');if(f)f.value='last_session_incorrect';const c=document.getElementById('pCount');if(c)c.value=Math.min(10,(res.total-res.correct)||5);createPracticeSession()};
      return r;
    };
  }
})();

/* ---------- Pacing engine: finish everything before exam day ---------- */
(function(){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const MIN={note:20,tricky:10,diagram:12,question:2,exam:300}; // exam = 4 h sitting + 1 h review
  const EXAM_TARGET=5,EXAM_PASS=80,REVIEW_DAYS=5;
  const tierFull=()=>{const t=String(state.tierCode||state.billing?.tier_code||state.billing?.entitlement?.tier_code||'');return t==='full'||t.startsWith('full')||(typeof isStaff==='function'&&isStaff())};
  const open=rows=>(rows||[]).filter(x=>['not_started','needs_review'].includes(x.studyStatus||'not_started'));
  window.v6Pace=function(p){
    p=p||state.lastProgress||{};const plan=p.adaptive_plan||{},prof=p.study_profile||{};
    const days=plan.days_until_exam;const perWeek=Math.max(1,Math.min(7,Number(prof.study_days_per_week||plan.study_days_per_week||5)));
    const left={note:open(state.notes).length,tricky:open(state.tricky).length,diagram:tierFull()?open(state.diagrams).length:0,
      question:Math.max(0,Number(p.practice_bank_total||0)-Number(p.practice_unique_attempted||0))};
    const hist=(p.exam_history||[]).filter(x=>x.total&&x.correct/x.total*100>=EXAM_PASS&&x.answered>=x.total*0.9);
    const examsDone=Math.min(EXAM_TARGET,hist.length);const examsLeft=EXAM_TARGET-examsDone;
    const out={blocksPerDay:1,perBlockQuestions:15,days,left,examsDone,examsLeft,examTarget:EXAM_TARGET,examPass:EXAM_PASS,perDay:{note:1,tricky:1,diagram:tierFull()?1:0,question:15},hoursPerDay:null,studyDays:null,learnDays:null,examEvery:null,status:'no-date'};
    if(days==null||days<0)return out;
    const studyDays=Math.max(1,Math.floor(days*perWeek/7));
    // keep the final stretch for exams + review; learning must finish before it
    // Learning gets at least 60% of the study days; exams and review share the rest (they can overlap when time is short).
    const review=Math.min(REVIEW_DAYS,Math.floor(studyDays/6));
    const examDays=Math.min(examsLeft*2,Math.max(studyDays>1?1:0,Math.floor(studyDays*0.4)));
    const learnDays=Math.min(studyDays,Math.max(1,Math.ceil(studyDays*0.6),studyDays-examDays-review));
    const per=k=>left[k]?Math.max(1,Math.ceil(left[k]/learnDays)):0;
    out.perDay={note:per('note'),tricky:per('tricky'),diagram:per('diagram'),question:Math.max(10,Math.min(60,Math.ceil(left.question/Math.max(1,studyDays-examsLeft))))};
    const total=left.note*MIN.note+left.tricky*MIN.tricky+left.diagram*MIN.diagram+left.question*MIN.question+examsLeft*MIN.exam;
    out.hoursPerDay=Math.max(0.5,Math.ceil(total/60/studyDays*2)/2);
    out.studyDays=studyDays;out.learnDays=learnDays;out.examEvery=examsLeft?Math.max(1,Math.floor(Math.max(1,studyDays-learnDays)/examsLeft)):null;out.examsFit=Math.min(examsLeft,Math.max(1,studyDays-learnDays+Math.floor(learnDays/3)));
    out.learningDone=!left.note&&!left.tricky&&!left.diagram;
    out.blocksPerDay=Math.max(1,out.perDay.note,out.perDay.tricky,out.perDay.diagram);
    out.perBlockQuestions=Math.max(8,Math.min(30,Math.ceil(out.perDay.question/out.blocksPerDay)));
    out.examPhase=out.learningDone||studyDays<=examDays+1;
    out.status=out.hoursPerDay>8?'unrealistic':out.hoursPerDay>5?'tight':out.hoursPerDay>3?'steady':'comfortable';
    return out;
  };

  // Daily plan built from the pace: N topics, N tricky pairs, N diagrams, practice on those topics, and an exam when it's time.
  // A study block = one topic note + one tricky pair + one diagram + questions on exactly those topics.
  function buildBlock(p,n,exclude){
    const pace=v6Pace(p),weak=p?.adaptive_plan?.weak_domains?.[0]?.domain||'';exclude=exclude||new Set();
    const first=rows=>{let c=open(rows).filter(x=>!exclude.has(String(x.id)));if(weak){const w=c.find(x=>String(x.domain||'').toLowerCase()===weak.toLowerCase());if(w)return w}return c[0]||null};
    const base=(n-1)*10,t=[];
    const note=first(state.notes),tr=first(state.tricky),dg=pace.perDay.diagram?first(state.diagrams):null;
    if(note)t.push({id:`note:${note.id}`,type:'note',itemId:note.id,label:'Read',title:note.title,detail:(note.keyRules||[])[0]||note.summary||'',view:'notes',reason:`Block ${n} · topic`,sortOrder:base+t.length});
    if(tr)t.push({id:`tricky:${tr.id}`,type:'tricky',itemId:tr.id,label:'Compare',title:`${tr.left} vs ${tr.right}`,detail:typeof trickyDecisionText==='function'?trickyDecisionText(tr):'',view:'tricky',reason:`Block ${n} · tricky words`,sortOrder:base+t.length});
    if(dg)t.push({id:`diagram:${dg.id}`,type:'diagram',itemId:dg.id,label:'Visualize',title:dg.title,detail:dg.whyItMatters||dg.whatItIs||'',view:'diagrams',reason:`Block ${n} · diagram`,sortOrder:base+t.length});
    const q=pace.perBlockQuestions;
    t.push({id:`practice:${todayDateKey()}:b${n}`,type:'practice',label:'Practice',title:(t.length?`${q} questions on these ${t.length===1?'topic':'topics'}`:`${q} mixed questions`)+(typeof hasFeature==='function'&&hasFeature('match')?' + 2 match sets':''),detail:t.length?`Questions on ${t.map(x=>x.title).join(' · ')}.`:'Build coverage and speed.',view:'practice',count:q,focus:'',domain:'',reason:`Block ${n} · practice`,sortOrder:base+t.length});
    if(n===1&&pace.examsLeft>0&&pace.examPhase){
      const ex=(p?.exam_cards||[]).find(x=>!x.completed||(x.total&&x.correct/x.total*100<pace.examPass));
      if(ex)t.push({id:`exam:${ex.exam_code}:${todayDateKey()}`,type:'exam',label:'Exam',title:`${ex.exam_name||'Full exam'} — aim for ${pace.examPass}%+`,detail:`${pace.examsDone} of ${pace.examTarget} exams passed at ${pace.examPass}%+.`,view:'exams',examKind:ex.kind||'mock',reason:'Exam stamina and pacing',sortOrder:base+t.length});
    }
    return t;
  }
  window.v6BlockCount=tasks=>(tasks||[]).filter(t=>t.type==='practice').length||1;
  if(typeof buildFreshTodayTasks==='function')window.buildFreshTodayTasks=function(p){return buildBlock(p,1)};
  // When a block is finished and the pace needs more today, add the next block.
  if(typeof appendOneNextTodayTask==='function'){
    window.appendOneNextTodayTask=async function(p,tasks){
      const pace=v6Pace(p),done=v6BlockCount(tasks);
      if(pace.hoursPerDay==null&&done>=1)return false;
      if(done>=pace.blocksPerDay)return false;
      const used=new Set((tasks||[]).map(t=>String(t.itemId||'')));
      const next=buildBlock(p,done+1,used).filter(t=>t.type!=='exam');
      if(next.length<=1&&!next.some(t=>t.type!=='practice')&&done>=1)return false;
      await api('/api/study/daily-plan/import-local',{method:'POST',body:JSON.stringify({plans:[{plan_date:todayDateKey(),tasks:next.map(t=>({...t,status:'not_started'}))}]})});
      const r=await api(`/api/study/daily-plan?plan_date=${encodeURIComponent(todayDateKey())}`);
      state.todayPlan=(r.tasks||[]).map(hydrateDbTask).filter(Boolean);state.todayTaskJustAdded=true;return true;
    };
  }

  // One quiet pacing line on Today, full breakdown on My Progress.
  function paceLine(p){
    const s=v6Pace(p);if(s.hoursPerDay==null)return'';
    return `<p class="v6-pace">Study about <b>${s.hoursPerDay} h/day</b> on ${s.studyDays} study day${s.studyDays===1?'':'s'} to finish every topic and <b>${s.examTarget} exams at ${s.examPass}%+</b> before exam day <span>(${s.examsDone} of ${s.examTarget} done)</span>.</p>`;
  }
  const origToday=window.renderTodayPlanFromDb;
  window.renderTodayPlanFromDb=function(p,tasks){
    tasks=tasks||[];const blocks=[];let cur=[];
    tasks.forEach(t=>{cur.push(t);if(t.type==='practice'||t.type==='exam'){blocks.push(cur);cur=[]}});if(cur.length)blocks.push(cur);
    let idx=blocks.findIndex(b=>b.some(t=>taskState(t)!=='done'));if(idx<0)idx=blocks.length-1;
    const shown=blocks.length?blocks[Math.max(0,idx)]:tasks;
    origToday(p,shown);
    const pace=v6Pace(p),total=Math.max(pace.blocksPerDay||1,blocks.filter(b=>b.some(t=>t.type==='practice')).length);
    const cnt=document.querySelector('.v6-plan-count');if(cnt&&blocks.length){const d=shown.filter(t=>taskState(t)==='done').length;cnt.textContent=`${total<=8?`Block ${Math.max(1,idx+1)} of ${total}`:`Block ${Math.max(1,idx+1)} today`} · ${d} of ${shown.length} done`}
    const head=document.querySelector('.v6-plan-head');if(head&&!document.querySelector('.v6-pace'))head.insertAdjacentHTML('afterend',paceLine(p));
  };

  function renderPacePanel(){
    const host=document.querySelector('#progress [data-progress-panel="overview"]');if(!host)return;
    let box=document.getElementById('v6PacePanel');if(!box){box=document.createElement('section');box.id='v6PacePanel';box.className='v6-pace-panel';host.appendChild(box)}
    const s=v6Pace(state.lastProgress);
    if(s.hoursPerDay==null){box.innerHTML=`<span class="v6-kicker">Your plan to exam day</span><p>Add your exam date under <b>My Plan</b> and Azielon will pace every topic, question and exam for you.</p>`;return}
    const L=s.left,row=(label,left,per,unit)=>left?`<div><b>${left}</b><span>${label} left</span><small>${per} ${unit}${per===1?'':'s'} a day</small></div>`:`<div class="is-done"><b>✓</b><span>${label}</span><small>complete</small></div>`;
    const bars=Array.from({length:s.examTarget},(_,i)=>`<i class="${i<s.examsDone?'on':''}"></i>`).join('');
    const tone={comfortable:'Comfortable pace.',steady:'Steady pace — keep it daily.',tight:'Tight timeline — add study days per week or move your exam date if you can.',unrealistic:`That is more than most people can study in a day. Move your exam date if you can; otherwise focus on topic notes, tricky words and practice, and skim the diagrams.`}[s.status];
    box.innerHTML=`<div class="v6-pace-head"><div><span class="v6-kicker">Your plan to exam day</span><h3>${s.hoursPerDay} hours a day · ${s.days} days left</h3><p>${tone} Based on ${s.studyDays} study days before your exam.</p></div><div class="v6-exam-goal"><span class="v6-kicker">Exams at ${s.examPass}%+</span><div class="v6-exam-bars">${bars}</div><small>${s.examsDone} of ${s.examTarget} · pass ${s.examTarget} before exam day</small></div></div><div class="v6-pace-grid">${row('Topic notes',L.note,s.perDay.note,'topic')}${row('Tricky words',L.tricky,s.perDay.tricky,'pair')}${tierFull()?row('Diagrams',L.diagram,s.perDay.diagram,'diagram'):''}${row('Practice questions',L.question,s.perDay.question,'question')}</div><p class="v6-pace-note">${s.learningDone?'All topics are done.':`Learning is spread over your first ${s.learnDays} study day${s.learnDays===1?'':'s'}.`} ${s.examsLeft?(s.examsFit<s.examsLeft?`There is time for about ${s.examsFit} full exam${s.examsFit===1?'':'s'} (each is about 4 hours); aim for ${s.examPass}%+ on each.`:`Then take a full exam ${s.examEvery<=1?'every study day':`every ${s.examEvery} study days`} until you have ${s.examTarget} scores at ${s.examPass}%+.`):''} Keep the last days for review.</p>`;
  }
  if(typeof renderCompactProgressDashboard==='function'){
    const o=window.renderCompactProgressDashboard;window.renderCompactProgressDashboard=function(p){const r=o.apply(this,arguments);try{renderPacePanel()}catch(e){console.warn(e)}return r};
  }
})();

/* ---------- Lesson-style explanations + readable matching review ---------- */
(function(){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const LABELS=['Concept','Spot it','In this scenario','Why not the others','Remember'];
  function lessonHTML(text){
    const lines=String(text||'').split(/\n+/).map(s=>s.trim()).filter(Boolean);
    return '<div class="v6-lesson">'+lines.map(l=>{
      const m=l.match(/^([^:]{2,60}):\s*(.+)$/);
      if(!m)return `<p>${esc(l)}</p>`;
      const k=m[1].trim(),known=LABELS.includes(k);
      return `<div class="v6-lesson-row ${known?'is-'+k.toLowerCase().replace(/\s+/g,'-'):'is-pair'}"><b>${esc(k)}</b><span>${esc(m[2])}</span></div>`;
    }).join('')+'</div>';
  }
  window.v6LessonHTML=lessonHTML;
  function upgrade(root){
    (root||document).querySelectorAll('.feedback p:not([data-v6])').forEach(p=>{
      const t=p.textContent||'';if(!/^Concept:/.test(t.trim()))return;
      const d=document.createElement('div');d.innerHTML=lessonHTML(t);d.firstChild.dataset.v6='1';p.replaceWith(d.firstChild);
    });
  }
  new MutationObserver(ms=>{for(const m of ms)if(m.addedNodes.length){upgrade(document.getElementById('app'));break}}).observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  // Matching review: a table instead of raw JSON
  if(typeof renderExamReview==='function'){
    const orig=renderExamReview;
    window.renderExamReview=function(i){
      orig.apply(this,arguments);
      try{
        const x=state.examReviewResults.results[i];if(!x||x.question?.type!=='matching')return;
        const pre=document.querySelector('#examReviewCard .review-pre');if(!pre)return;
        const mine=x.selected?.matching_pairs||{},ans=x.answer||{};
        const rows=Object.keys(ans).map(l=>{const ok=mine[l]===ans[l];return `<tr class="${ok?'ok':'no'}"><td>${esc(l)}</td><td>${mine[l]?esc(mine[l]):'<i>not answered</i>'}</td><td>${ok?'✓':esc(ans[l])}</td></tr>`}).join('');
        const t=document.createElement('div');t.className='v6-match-review';
        t.innerHTML=`<table><thead><tr><th>Item</th><th>Your match</th><th>Correct</th></tr></thead><tbody>${rows}</tbody></table>`;
        pre.replaceWith(t);
      }catch(e){}
    };
  }
})();


/* ---------- v6.3: Done today tab ---------- */
function v6DoneTodayTasks(){return (state.todayPlan||[]).filter(t=>taskState(t)==='done')}
function v6RenderDoneToday(){
  const host=document.getElementById('dashboardWorkspace');if(!host)return;host.classList.add('v6-today-host');
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const LBL={note:'Topic note',tricky:'Tricky words',diagram:'Diagram',practice:'Practice',exam:'Exam'};
  const done=v6DoneTodayTasks(),left=(state.todayPlan||[]).length-done.length;
  const counts=['note','tricky','diagram','practice'].map(t=>[t,done.filter(x=>x.type===t).length]).filter(x=>x[1]);
  const rows=done.map(t=>{const sc=(t.type==='practice'||t.type==='exam')?v6GetScore(t.id):'';const canReview=['note','tricky','diagram'].includes(t.type);
    return `<div class="v6-task is-done"><span class="v6-task-dot" aria-hidden="true">✓</span><div class="v6-task-copy"><div class="v6-task-meta"><span class="v6-task-type">${esc(LBL[t.type]||t.label||'Study')}</span>${sc?`<span class="v6-done-score">· ${esc(sc)}</span>`:''}</div><p class="v6-task-title" title="${esc(t.title)}">${esc(t.title)}</p></div>${canReview?`<button class="v6-task-open" type="button" data-today-open="${esc(t.id)}">Review →</button>`:''}</div>`}).join('');
  const summary=counts.length?counts.map(([t,n])=>`${n} ${({note:'topic',tricky:'tricky pair',diagram:'diagram',practice:'practice set'})[t]}${n===1?'':'s'}`).join(' · '):'';
  host.innerHTML=`<div class="v6-home"><div class="v6-col"><section class="v6-card v6-plan v6-done-page"><div class="v6-plan-head"><h3>Done today</h3><span class="v6-plan-count">${done.length} finished${left>0?` · ${left} to go`:''}</span></div>${summary?`<p class="v6-pace">${summary}</p>`:''}<div class="v6-plan-list">${rows||'<p class="v6-task-flag" style="padding:14px 6px">Nothing finished yet today. Your first step is waiting on the <b>Today</b> tab.</p>'}</div>${left>0?'<div class="v6-next-actions" style="margin-top:14px"><button class="v6-btn-gold" type="button" data-dashboard-focus-go="today">Continue today’s plan →</button></div>':''}</section></div></div>`;
  bindDashboardWorkspaceActions();
  const go=host.querySelector('[data-dashboard-focus-go]');if(go)go.onclick=()=>{state.dashboardFocus='today';renderFeatureLaunchpad(state.lastProgress||{})};
}

/* ---------- v6.3: exam report: actions on top, answer review opens at the top ---------- */
(function(){
  if(typeof showExamResults==='function'){
    const o=showExamResults;
    window.showExamResults=async function(){
      const r=await o.apply(this,arguments);
      const area=document.getElementById('examResults');if(!area)return r;
      const rep=area.querySelector('.exam-report-final'),acts=rep&&rep.querySelector('.report-actions'),head=rep&&rep.querySelector('.final-report-head');
      if(acts&&head){head.after(acts);acts.classList.add('v6-report-top')}
      area.classList.remove('v6-reviewing');const v=document.getElementById('exams');if(v)v.scrollTop=0;
      return r;
    };
  }
  if(typeof renderExamReview==='function'){
    const o=renderExamReview;
    window.renderExamReview=function(i){
      const r=o.apply(this,arguments);
      const area=document.getElementById('examResults'),card=document.getElementById('examReviewCard');
      if(area&&card&&area.contains(card)){
        area.classList.add('v6-reviewing');
        if(!card.querySelector('.v6-review-back')){const b=document.createElement('button');b.type='button';b.className='v6-session-exit v6-review-back';b.textContent='← Back to exam report';b.onclick=()=>{area.classList.remove('v6-reviewing');card.innerHTML='';const v=document.getElementById('exams');if(v)v.scrollTop=0};card.prepend(b)}
      }
      if(card){const qc=card.querySelector('.question-card'),acts=qc&&qc.querySelector('.question-actions'),meta=qc&&qc.querySelector('.question-meta');if(acts&&meta){acts.classList.add('v6-review-nav');meta.after(acts)}}
      const v=document.getElementById('exams');if(v)v.scrollTop=0;window.scrollTo(0,0);
      return r;
    };
  }
})();

/* ---------- v6.3: practice summary: all actions in one row at the top ---------- */
(function(){
  if(typeof renderSessionComplete!=='function')return;
  const o=renderSessionComplete;
  window.renderSessionComplete=async function(){
    const r=await o.apply(this,arguments);
    const box=document.querySelector('#questionCard .v6-session-done'),acts=box&&box.querySelector('.v6-next-actions'),rev=document.getElementById('reviewAnswers');
    if(acts&&rev){rev.className='v6-btn-quiet';rev.textContent='Review my answers';acts.appendChild(rev);
      const sum=box.closest('.session-summary');if(sum)[...sum.children].forEach(ch=>{if(ch!==box)ch.remove()})}
    return r;
  };
})();

/* Practice answer review: Previous / Next at the top of the card */
(function(){
  if(typeof renderEndReview!=='function')return;
  const o=renderEndReview;
  window.renderEndReview=function(){const r=o.apply(this,arguments);
    const qc=document.querySelector('#questionCard .question-card')||document.getElementById('questionCard'),acts=qc&&qc.querySelector('.question-actions'),meta=qc&&qc.querySelector('.question-meta');
    if(acts&&meta){acts.classList.add('v6-review-nav');meta.after(acts)}
    const v=document.querySelector('.view.active');if(v)v.scrollTop=0;return r};
})();

/* ---------- v6.4: exams — pause & exit, resume later; timer continues across rule reviews ---------- */
(function(){
  const sid=()=>state.examSession&&state.examSession.session_id;
  async function exitExam(){
    clearExamTimer();state.examLock=false;state.v6RulePaused=false;
    document.getElementById('examSessionArea')?.classList.add('hidden');document.getElementById('ruleReviewArea')?.classList.add('hidden');
    state.examSession=null;
    try{await loadExamCatalog()}catch(e){}
    if(typeof renderExamCatalog==='function')renderExamCatalog();
    const v=document.getElementById('exams');if(v)v.scrollTop=0;
  }
  window.v6ExitExam=exitExam;
  const pb=document.getElementById('examPauseBtn');
  if(pb&&pb.onclick){const o=pb.onclick;pb.textContent='Pause';pb.onclick=async function(e){
    await o.call(this,e);
    const card=document.querySelector('#examQuestionCard .pause-card');if(!card||card.querySelector('#v6ExitExam'))return;
    const p=card.querySelector('p');if(p)p.textContent='Resume now, or exit and come back later. You will pick up at this question with the same time left.';
    const btn=document.createElement('button');btn.id='v6ExitExam';btn.type='button';btn.className='secondary';btn.textContent='Exit — resume later';btn.onclick=exitExam;
    const r=card.querySelector('#resumePausedExam');if(r){const row=document.createElement('div');row.className='v6-next-actions';r.replaceWith(row);row.append(r,btn)}else card.appendChild(btn);
  }}
  // Resuming a paused exam from the exam list restarts its timer on the server first.
  if(typeof resumeExam==='function'){const o=resumeExam;window.resumeExam=async function(code){
    const e=(state.examCatalog||[]).find(x=>x.code===code),a=e&&e.active_session;
    if(a&&a.paused){try{await api(`/api/exam-sessions/${a.session_id}/resume`,{method:'POST'})}catch(err){}}
    return o.apply(this,arguments)}}
  // Reviewing the 10 rules between blocks stops the clock; it continues where it left off.
  if(typeof showExamRuleBlock==='function'){const o=showExamRuleBlock;window.showExamRuleBlock=async function(n){
    if(sid()&&state.examTimerHandle&&!state.v6RulePaused){clearExamTimer();try{await api(`/api/exam-sessions/${sid()}/pause`,{method:'POST'});state.v6RulePaused=true}catch(e){}}
    return o.apply(this,arguments)}}
  if(typeof beginExamQuestions==='function'){const o=beginExamQuestions;window.beginExamQuestions=async function(){
    try{
      if(state.v6RulePaused){const rr=await api(`/api/exam-sessions/${sid()}/resume`,{method:'POST'});state.v6RulePaused=false;state.examSession.remaining_seconds=Math.max(1,rr.remaining_seconds)}
      else if(sid()){const st=await api(`/api/exam-sessions/${sid()}/status`);if(st&&st.remaining_seconds!=null)state.examSession.remaining_seconds=Math.max(1,st.remaining_seconds)}
    }catch(e){}
    return o.apply(this,arguments)}}
})();

/* ---------- v6.5: Match the Following ---------- */
(function(){
  const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const THEMES=[['all','All'],['agile','Agile & Scrum'],['documents','Documents & flow'],['ownership','Who owns what'],['flows','Process flows'],['people','People & leadership'],['tools','Tools & techniques'],['risk_procurement','Risk & procurement'],['business','Business environment']];
  const THEME_LABEL=Object.fromEntries(THEMES);
  const host=()=>document.getElementById('matchHost');
  const M=state.v6Match={sets:null,theme:'all',play:null,queue:null};
  const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  const canMatch=()=>typeof hasFeature==='function'&&hasFeature('match');
  async function loadSets(force){if(M.sets&&!force)return M.sets;M.sets=await api('/api/match-sets');return M.sets}
  window.v6LoadMatchSets=loadSets;

  // Topic-linked choice: rank sets by word overlap with today's block topics.
  const STOP=new Set('the a an and or of to in on for vs with by is are be as at from this that what which who your into each its it how when why not do does'.split(' '));
  const toks=s=>String(s||'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').split(/\s+/).filter(w=>w.length>2&&!STOP.has(w));
  window.v6PickMatchSets=function(topicText,n=2){
    const want=new Set(toks(topicText));const sets=M.sets||[];
    const scored=sets.map(s=>{const bag=toks([s.title,s.prompt,(s.keywords||[]).join(' '),s.pairs.map(p=>p.left).join(' ')].join(' '));let sc=0;bag.forEach(w=>{if(want.has(w))sc++});(s.keywords||[]).forEach(k=>{if(String(topicText).toLowerCase().includes(k.toLowerCase()))sc+=3});
      if(s.studyStatus==='mastered')sc-=4;return {s,sc:sc+Math.random()*0.5}});
    scored.sort((a,b)=>b.sc-a.sc);return scored.slice(0,n).map(x=>x.s);
  };

  function statusDot(s){return s.studyStatus==='mastered'?'<span class="v6-m-dot is-done" title="Mastered">✓</span>':s.studyStatus==='needs_review'?'<span class="v6-m-dot is-retry" title="Try again">↻</span>':'<span class="v6-m-dot" aria-hidden="true"></span>'}
  function renderList(){
    const h=host();if(!h)return;const sets=M.sets||[];
    const rows=sets.filter(s=>M.theme==='all'||s.theme===M.theme);
    const mastered=sets.filter(s=>s.studyStatus==='mastered').length,retry=sets.filter(s=>s.studyStatus==='needs_review').length;
    const next=sets.find(s=>s.studyStatus==='needs_review')||sets.find(s=>s.studyStatus==='not_started');
    h.innerHTML=`<div class="v6-m-top"><p class="v6-m-intro">The exam asks these as drag-and-drop matching. Pair each term with what it does, who owns it, or what comes next.</p><span class="v6-m-count"><b>${mastered}</b> of ${sets.length} mastered${retry?` · ${retry} to retry`:''}</span>${next?`<button class="primary v6-m-next" type="button" data-m-open="${esc(next.id)}">${next.studyStatus==='needs_review'?'Retry':'Start'}: ${esc(next.title)} →</button>`:''}</div>
      <div class="v6-m-chips" role="tablist">${THEMES.map(([k,t])=>{const n=k==='all'?sets.length:sets.filter(s=>s.theme===k).length;return `<button type="button" class="${M.theme===k?'active':''}" data-m-theme="${k}">${esc(t)} <span>${n}</span></button>`}).join('')}</div>
      <div class="v6-m-list">${rows.map(s=>`<button type="button" class="v6-m-row" data-m-open="${esc(s.id)}">${statusDot(s)}<span class="v6-m-title">${esc(s.title)}</span><span class="v6-m-theme">${esc(THEME_LABEL[s.theme]||'')}</span><span class="v6-m-meta">${s.pairs.length} pairs${s.lastScore?` · last ${esc(s.lastScore)}`:''}</span><span class="v6-m-go">${s.studyStatus==='mastered'?'Practice again':s.studyStatus==='needs_review'?'Retry':'Start'} →</span></button>`).join('')}</div>`;
    h.querySelectorAll('[data-m-theme]').forEach(b=>b.onclick=()=>{M.theme=b.dataset.mTheme;renderList()});
    h.querySelectorAll('[data-m-open]').forEach(b=>b.onclick=()=>openSet(b.dataset.mOpen));
  }

  function openSet(id){
    const s=(M.sets||[]).find(x=>x.id===id);if(!s)return;
    M.play={set:s,order:shuffle(s.pairs.map((p,i)=>i)),pick:{},active:0,checked:false};
    renderPlay();
  }
  window.v6OpenMatchSet=async function(id){showView('match');await loadSets();openSet(id)};

  function renderPlay(){
    const h=host(),P=M.play;if(!h||!P)return;const s=P.set,n=s.pairs.length;
    const used=new Set(Object.values(P.pick));const filled=Object.keys(P.pick).length;
    const q=M.queue;const qline=q?`<span class="v6-m-q">Today’s practice · match set ${q.i+1} of ${q.ids.length}</span>`:'';
    let res='';
    if(P.checked){
      const right=s.pairs.filter((p,i)=>P.pick[i]===i).length;P.score=right;
      res=`<div class="v6-m-result ${right===n?'is-perfect':''}"><b>${right} of ${n} correct</b><span>${right===n?'You have this one. ✓':'Read the lesson under each pair, then try again.'}</span><div class="v6-m-actions v6-m-actions-top">${right<n?'<button type="button" class="secondary" data-m-retry>Try again</button>':''}<button type="button" class="primary" data-m-continue>${q?(q.i+1<q.ids.length?'Next match set →':'Finish practice step →'):'Next set →'}</button></div></div>`;
    }
    h.innerHTML=`<div class="v6-m-play">
      <div class="v6-m-head"><button type="button" class="v6-session-exit" data-m-back>${q?'← Today':'← All sets'}</button>${qline}<span class="v6-kicker">${esc(THEME_LABEL[s.theme]||'')} · ${esc(s.domain)}${s.approach&&s.approach!=='Mixed'?' · '+esc(s.approach):''}</span><h2>${esc(s.title)}</h2><p>${esc(s.prompt)}${P.checked?'':' Tap a term, then tap its match.'}</p></div>
      ${res}${P.checked?`<div class="v6-m-remember"><span class="v6-kicker">Remember</span><p>${esc(s.remember)}</p></div>`:''}
      <div class="v6-m-board ${P.checked?'is-checked':''}">
        <div class="v6-m-left">${s.pairs.map((p,i)=>{const pk=P.pick[i];const ok=P.checked&&pk===i,bad=P.checked&&pk!==i;
          return `<div class="v6-m-pair ${P.active===i&&!P.checked?'is-active':''} ${ok?'is-ok':''} ${bad?'is-bad':''}" data-m-left="${i}" role="button" tabindex="0"><span class="v6-m-term">${esc(p.left)}</span><span class="v6-m-slot">${pk!=null?esc(s.pairs[pk].right):'<i>Choose a match</i>'}</span>${P.checked?`<span class="v6-m-mark">${ok?'✓':'✗'}</span>`:''}${P.checked?`<div class="v6-m-lesson">${bad?`<b>Correct match:</b> ${esc(p.right)}<br>`:''}${esc(p.lesson)}</div>`:''}</div>`}).join('')}</div>
        ${P.checked?'':`<div class="v6-m-right">${P.order.map(j=>`<button type="button" class="v6-m-opt ${used.has(j)?'is-used':''}" data-m-right="${j}">${esc(s.pairs[j].right)}</button>`).join('')}</div>`}
      </div>
      ${P.checked?'':`<div class="v6-m-actions"><button type="button" class="secondary" data-m-clear ${filled?'':'disabled'}>Clear</button><button type="button" class="primary" data-m-check ${filled===n?'':'disabled'}>Check answers</button></div>`}
    </div>`;
    const v=document.getElementById('match');if(v)v.scrollTop=0;
    h.querySelector('[data-m-back]').onclick=()=>{if(q){M.queue=null;backToToday()}else{M.play=null;renderList()}};
    if(!P.checked){
      h.querySelectorAll('[data-m-left]').forEach(el=>{const f=()=>{const i=+el.dataset.mLeft;if(P.pick[i]!=null&&P.active===i){delete P.pick[i]}P.active=i;renderPlay()};el.onclick=f;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();f()}}});
      h.querySelectorAll('[data-m-right]').forEach(el=>el.onclick=()=>{const j=+el.dataset.mRight;
        for(const k in P.pick)if(P.pick[k]===j)delete P.pick[k];
        P.pick[P.active]=j;const nextEmpty=s.pairs.findIndex((_,i)=>P.pick[i]==null);P.active=nextEmpty<0?P.active:nextEmpty;renderPlay()});
      const cl=h.querySelector('[data-m-clear]');if(cl)cl.onclick=()=>{P.pick={};P.active=0;renderPlay()};
      const ck=h.querySelector('[data-m-check]');if(ck)ck.onclick=async()=>{P.checked=true;renderPlay();
        try{const r=await api(`/api/match-sets/${encodeURIComponent(s.id)}/result`,{method:'POST',body:JSON.stringify({correct:P.score,total:n})});s.studyStatus=r.status;s.lastScore=r.last_rating;s.attempts=r.review_count}catch(e){}
        if(q)q.scores.push([P.score,n]);};
    }else{
      const rt=h.querySelector('[data-m-retry]');if(rt)rt.onclick=()=>{if(q)q.scores.pop();openSet(s.id)};
      h.querySelector('[data-m-continue]').onclick=()=>{
        if(q){q.i++;if(q.i<q.ids.length)return openSet(q.ids[q.i]);return finishQueue()}
        const list=(M.sets||[]).filter(x=>M.theme==='all'||x.theme===M.theme);const i=list.findIndex(x=>x.id===s.id);
        const nxt=list.slice(i+1).find(x=>x.studyStatus!=='mastered')||list.find(x=>x.studyStatus!=='mastered'&&x.id!==s.id);
        if(nxt)openSet(nxt.id);else{M.play=null;renderList()}
      };
    }
  }

  function backToToday(){state.dashboardFocus='today';showView('dashboard');if(typeof loadProgress==='function')loadProgress().then(()=>renderFeatureLaunchpad(state.lastProgress||{})).catch(()=>{})}
  async function finishQueue(){
    const q=M.queue;M.queue=null;M.play=null;
    if(q&&q.task&&typeof setDailyTaskStatus==='function'){try{await setDailyTaskStatus(q.task,'done')}catch(e){}}
    if(q&&q.task){const m=q.scores.reduce((a,[c,t])=>[a[0]+c,a[1]+t],[0,0]);const prev=v6GetScore(q.task.id);v6SetScore(q.task.id,(prev?prev+' · ':'')+`match ${m[0]}/${m[1]}`);try{localStorage.removeItem('v6pq:'+q.task.id)}catch(e){}}
    backToToday();
  }
  // Start the match part of today's practice step.
  window.v6StartMatchQueue=async function(task,topicText){
    try{await loadSets()}catch(e){return false}
    const picks=v6PickMatchSets(topicText,2);if(!picks.length)return false;
    M.queue={task,ids:picks.map(x=>x.id),i:0,scores:[]};showView('match');openSet(M.queue.ids[0]);return true;
  };

  if(typeof showView==='function'){const o=window.showView;window.showView=function(id){const r=o.apply(this,arguments);
    if(id==='match'&&state.currentView==='match'){if(!M.play){if(M.sets)renderList();const hh=host();if(hh&&!M.sets)hh.innerHTML='<p class="v6-task-flag" style="padding:16px 0">Loading match sets…</p>';loadSets(true).then(()=>{if(!M.play)renderList()}).catch(err=>{const hh2=host();if(hh2)hh2.innerHTML=`<p class="v6-task-flag">${esc(err.message||'Could not load match sets.')}</p>`})}}
    return r}}
  // "Review concept" on a match item opens that set.
  if(typeof window.openConceptSource==='function'){const o=window.openConceptSource;window.openConceptSource=async function(type,id){if(type==='match')return v6OpenMatchSet(id);return o.apply(this,arguments)}}
})();

/* Practice step = questions, then 2 match sets on the same topics */
function v6BlockTopicText(task){
  const plan=state.todayPlan||[];const i=plan.findIndex(t=>t.id===task.id);const out=[];
  for(let k=i-1;k>=0;k--){const t=plan[k];if(t.type==='practice'||t.type==='exam')break;const it=t.item||{};out.push(t.title,it.title,it.summary,(it.keyRules||[]).join(' '),it.left,it.right,it.whatItIs)}
  return out.filter(Boolean).join(' ')||String(task.detail||task.title||'');
}
(function(){
  if(typeof openTodayTask!=='function')return;const o=window.openTodayTask;
  window.openTodayTask=async function(t){
    let resume=false;try{resume=t&&t.type==='practice'&&localStorage.getItem('v6pq:'+t.id)==='1'}catch(e){}
    if(resume&&typeof hasFeature==='function'&&hasFeature('match')){const ok=await v6StartMatchQueue(t,v6BlockTopicText(t));if(ok)return}
    return o.apply(this,arguments);
  };
})();
