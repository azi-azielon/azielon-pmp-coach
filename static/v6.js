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
      if(planTask&&taskState(planTask)!=='done'&&typeof setDailyTaskStatus==='function'){try{await setDailyTaskStatus(planTask,'done')}catch(e){}}
      state.v6PracticeTask=null;
      const card=document.getElementById('questionCard');if(!card)return r;
      const acc=res&&res.accuracy!=null?Math.round(res.accuracy):null;
      const verdict=acc==null?'':acc>=80?'Exam-ready accuracy on these topics.':acc>=65?'Close. Review the misses, then move on.':'These topics need another pass. Review each miss before moving on.';
      const box=document.createElement('div');box.className='v6-session-done';
      box.innerHTML=`<span class="v6-kicker">${planTask?'Today’s practice complete':'Session complete'}</span><h3>${res?`${res.correct} of ${res.total} correct`:'Answers saved'}${acc!=null?` <span>· ${acc}%</span>`:''}</h3>${verdict?`<p>${verdict}</p>`:''}<div class="v6-next-actions"><button class="v6-btn-gold" type="button" id="v6BackToday">Continue to next step →</button>${res&&res.correct<res.total?'<button class="v6-btn-quiet" type="button" id="v6ReviewMisses">Practice my misses</button>':''}</div>`;
      const existing=card.querySelector('.session-summary');
      if(existing){existing.prepend(box);existing.querySelector('h3:not(.v6-session-done h3)')?.remove()}else{card.innerHTML='';card.appendChild(box)}
      const back=box.querySelector('#v6BackToday');back.onclick=async()=>{document.getElementById('sessionArea').classList.add('hidden');state.dashboardFocus='today';showView('dashboard');try{await loadProgress()}catch(e){}renderFeatureLaunchpad(state.lastProgress||{})};
      const miss=box.querySelector('#v6ReviewMisses');if(miss)miss.onclick=()=>{const f=document.getElementById('pReviewFocus');if(f)f.value='last_session_incorrect';const c=document.getElementById('pCount');if(c)c.value=Math.min(10,(res.total-res.correct)||5);createPracticeSession()};
      return r;
    };
  }
})();

/* ---------- Pacing engine: finish everything before exam day ---------- */
(function(){
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
    const examDays=Math.min(studyDays-1,examsLeft*2);const learnDays=Math.max(1,studyDays-examDays-Math.min(REVIEW_DAYS,Math.floor(studyDays/6)));
    const per=k=>left[k]?Math.max(1,Math.ceil(left[k]/learnDays)):0;
    out.perDay={note:per('note'),tricky:per('tricky'),diagram:per('diagram'),question:Math.max(10,Math.min(60,Math.ceil(left.question/Math.max(1,studyDays-examsLeft))))};
    const total=left.note*MIN.note+left.tricky*MIN.tricky+left.diagram*MIN.diagram+left.question*MIN.question+examsLeft*MIN.exam;
    out.hoursPerDay=Math.max(0.5,Math.ceil(total/60/studyDays*2)/2);
    out.studyDays=studyDays;out.learnDays=learnDays;out.examEvery=examsLeft?Math.max(1,Math.floor(examDays/examsLeft)):null;
    out.learningDone=!left.note&&!left.tricky&&!left.diagram;
    out.blocksPerDay=Math.max(1,out.perDay.note,out.perDay.tricky,out.perDay.diagram);
    out.perBlockQuestions=Math.max(8,Math.min(30,Math.ceil(out.perDay.question/out.blocksPerDay)));
    out.examPhase=out.learningDone||studyDays<=examDays+1;
    out.status=out.hoursPerDay>6?'tight':out.hoursPerDay>3?'steady':'comfortable';
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
    t.push({id:`practice:${todayDateKey()}:b${n}`,type:'practice',label:'Practice',title:t.length?`${q} questions on these ${t.length===1?'topic':'topics'}`:`${q} mixed questions`,detail:t.length?`Questions on ${t.map(x=>x.title).join(' · ')}.`:'Build coverage and speed.',view:'practice',count:q,focus:'',domain:'',reason:`Block ${n} · practice`,sortOrder:base+t.length});
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
    const cnt=document.querySelector('.v6-plan-count');if(cnt&&blocks.length){const d=shown.filter(t=>taskState(t)==='done').length;cnt.textContent=`Block ${Math.max(1,idx+1)} of ${total} · ${d} of ${shown.length} done`}
    const head=document.querySelector('.v6-plan-head');if(head&&!document.querySelector('.v6-pace'))head.insertAdjacentHTML('afterend',paceLine(p));
  };

  function renderPacePanel(){
    const host=document.querySelector('#progress [data-progress-panel="overview"]');if(!host)return;
    let box=document.getElementById('v6PacePanel');if(!box){box=document.createElement('section');box.id='v6PacePanel';box.className='v6-pace-panel';host.appendChild(box)}
    const s=v6Pace(state.lastProgress);
    if(s.hoursPerDay==null){box.innerHTML=`<span class="v6-kicker">Your plan to exam day</span><p>Add your exam date under <b>My Plan</b> and Azielon will pace every topic, question and exam for you.</p>`;return}
    const L=s.left,row=(label,left,per,unit)=>left?`<div><b>${left}</b><span>${label} left</span><small>${per} ${unit}/day</small></div>`:`<div class="is-done"><b>✓</b><span>${label}</span><small>complete</small></div>`;
    const bars=Array.from({length:s.examTarget},(_,i)=>`<i class="${i<s.examsDone?'on':''}"></i>`).join('');
    const tone={comfortable:'Comfortable pace.',steady:'Steady pace — keep it daily.',tight:'Tight timeline — consider more study days per week or moving your exam date.'}[s.status];
    box.innerHTML=`<div class="v6-pace-head"><div><span class="v6-kicker">Your plan to exam day</span><h3>${s.hoursPerDay} hours a day · ${s.days} days left</h3><p>${tone} Based on ${s.studyDays} study days before your exam.</p></div><div class="v6-exam-goal"><span class="v6-kicker">Exams at ${s.examPass}%+</span><div class="v6-exam-bars">${bars}</div><small>${s.examsDone} of ${s.examTarget} · pass ${s.examTarget} before exam day</small></div></div><div class="v6-pace-grid">${row('Topic notes',L.note,s.perDay.note,'topic')}${row('Tricky words',L.tricky,s.perDay.tricky,'pair')}${tierFull()?row('Diagrams',L.diagram,s.perDay.diagram,'diagram'):''}${row('Practice questions',L.question,s.perDay.question,'questions')}</div><p class="v6-pace-note">Learning finishes about ${s.learnDays} study days in; after that, the plan schedules a full exam every ${s.examEvery||2} days until you have ${s.examTarget} scores at ${s.examPass}%+, with the final days for review.</p>`;
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
