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
  const HOME_TABS=[['today','Today'],['plan','Full plan'],['mistakes','Fix mistakes']];
  window.renderFeatureLaunchpad=function(p){
    const host=q('#featureLaunchpad');if(!host)return;
    let focus=state.dashboardFocus||'today';
    if(!HOME_TABS.some(t=>t[0]===focus)){
      // Legacy focus values map onto real screens in the sidebar
      const map={notes:'notes',tricky:'tricky',diagrams:'diagrams',practice:'practice',exams:'exams',coach:'coach',readiness:'progress'};
      if(map[focus]&&state.currentView==='dashboard'){state.dashboardFocus='today';showView(map[focus]);return}
      focus='today';state.dashboardFocus='today';
    }
    host.innerHTML=HOME_TABS.map(([k,t])=>`<button class="pmp-focus-tab ${focus===k?'active':''}" type="button" role="tab" aria-selected="${focus===k}" data-dashboard-focus="${k}"><span class="feature-launch-icon" aria-hidden="true">${typeof launchpadIcon==='function'?launchpadIcon(k):''}</span><span>${esc(t)}</span></button>`).join('');
    const ws=q('#dashboardWorkspace');if(ws)ws.classList.toggle('v6-today-host',focus==='today');
    const overall=q('#dashboardOverallPct');if(overall&&typeof learningOverview==='function')overall.textContent=learningOverview(p||{}).avg+'%';
    qa('[data-dashboard-focus]',host).forEach(b=>b.onclick=()=>{state.dashboardFocus=b.dataset.dashboardFocus;window.renderFeatureLaunchpad(p)});
    renderDashboardWorkspace(focus,p);
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
  window.setStudyStatus=async function(type,id,status){
    const r=await orig.apply(this,arguments);
    if(status!=='reviewed')return r;
    if(fromToday){fromToday=false;state.dashboardFocus='today';showView('dashboard');setTimeout(()=>{state.dashboardFocus='today';if(typeof loadProgress==='function')loadProgress().then(()=>renderFeatureLaunchpad(state.lastProgress||{})).catch(()=>renderFeatureLaunchpad(state.lastProgress||{}))},0);return r}
    // Browse mode keeps every item in the list, so step forward explicitly
    try{
      if(type==='note'&&state.noteMode==='all'){state.noteIndex=Math.min((state.noteIndex||0)+1,Math.max(0,noteRows().length-1));renderNotes()}
      if(type==='tricky'&&state.trickyMode==='all'){state.flashIndex=Math.min((state.flashIndex||0)+1,Math.max(0,trickyRows().length-1));renderTricky()}
      if(type==='diagram'&&state.diagramMode==='all'){state.diagramIndex=Math.min((state.diagramIndex||0)+1,Math.max(0,diagramRows().length-1));renderDiagrams()}
    }catch(e){}
    return r;
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
